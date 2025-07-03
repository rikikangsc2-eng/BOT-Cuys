const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const path = require('path');
const http = require('http');
const chalk = require('chalk');
const fs = require('fs');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const JSZip = require('jszip');

const handler = require('./handler');
const config = require('./config');
const db = require('./lib/database');
const logger = require('./lib/logger');
const { getBuffer } = require('./lib/functions');
const { loadPlugins } = require('./lib/pluginManager');
const { setConnectionStatus, processQueue, setSocket } = require('./lib/connectionManager');

const sessionPath = path.join(__dirname, 'session');
const dbPath = path.join(__dirname, 'database');
const dbFilePath = path.join(dbPath, 'storage.db');
const backupCredsPath = path.join(__dirname, 'creds.backup.json');
let sock;
let priceUpdateInterval;
let keepAliveInterval;
let connectRetryCount = 0;
const MAX_CONNECT_RETRIES = 3;
const MAX_SYNC_OTHER_RETRIES = 2;

function backupLocalCreds() {
    const credsPath = path.join(sessionPath, 'creds.json');
    if (fs.existsSync(credsPath)) {
        fs.copyFileSync(credsPath, backupCredsPath);
        logger.info('[BACKUP] Kredensial lokal berhasil dicadangkan.');
    }
}

function restoreLocalCreds() {
    if (fs.existsSync(backupCredsPath)) {
        if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath);
        fs.copyFileSync(backupCredsPath, path.join(sessionPath, 'creds.json'));
        logger.info('[RESTORE] Kredensial cadangan berhasil dipulihkan.');
        return true;
    }
    logger.warn('[RESTORE] Tidak ada kredensial cadangan untuk dipulihkan.');
    return false;
}

async function syncWithRetry(endpoint, processData, axiosOptions = {}) {
    const syncUrl = `https://nirkyy.koyeb.app${endpoint}`;
    let attempt = 0;
    while (true) {
        try {
            logger.info(`[SYNC] Mencoba sinkronisasi dari ${endpoint} (Percobaan #${attempt + 1})...`);
            const response = await axios.get(syncUrl, axiosOptions);
            if (response.status !== 200) throw new Error(`Server merespons dengan status ${response.status}`);
            await processData(response.data);
            logger.info(`[SYNC] Sinkronisasi dari ${endpoint} BERHASIL!`);
            return true;
        } catch (error) {
            attempt++;
            const is503Error = error.response?.status === 503;
            logger.warn(`[SYNC] Gagal sinkronisasi ${endpoint}: ${error.message}.`);

            if (is503Error) {
                const delay = Math.min(30000, 5000 * attempt);
                logger.info(`[SYNC] Error 503, mencoba lagi dalam ${delay / 1000} detik...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                if (attempt >= MAX_SYNC_OTHER_RETRIES) {
                    logger.error(`[SYNC] Gagal sinkronisasi ${endpoint} setelah ${MAX_SYNC_OTHER_RETRIES} percobaan.`);
                    return false;
                }
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
    }
}

async function processSessionCreds(buffer) {
    logger.info('[SYNC] Memvalidasi data kredensial...');
    try {
        const credsString = buffer.toString('utf-8');
        const credsData = JSON.parse(credsString);
        
        if (!credsData || !credsData.creds) {
            throw new Error("Data kredensial yang diterima tidak memiliki struktur yang valid.");
        }
        
        logger.info('[SYNC] Kredensial valid. Mengganti file creds.json lokal...');
        if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath);
        fs.writeFileSync(path.join(sessionPath, 'creds.json'), credsString);

    } catch(e) {
        throw new Error(`Data kredensial yang diterima tidak valid atau korup: ${e.message}`);
    }
}

async function processDatabaseFile(buffer) {
    const tempDbPath = path.join(__dirname, 'storage.db.temp');
    try {
        fs.writeFileSync(tempDbPath, buffer);
        logger.info('[SYNC] File database sementara telah ditulis. Melakukan uji integritas...');
        
        const tempDb = new (require('better-sqlite3'))(tempDbPath);
        tempDb.pragma('integrity_check');
        tempDb.close();
        
        logger.info('[SYNC] Uji integritas berhasil. Mengganti database utama...');
        if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { recursive: true, force: true });
        fs.mkdirSync(dbPath, { recursive: true });
        fs.renameSync(tempDbPath, dbFilePath);
    } catch (e) {
        if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
        throw new Error(`Uji integritas database gagal: ${e.message}`);
    }
}

async function triggerRemoteSessionWipe() {
    const wipeUrl = 'https://nirkyy.koyeb.app/removesesi';
    try {
        logger.info(`[WIPE] Meminta instance lama untuk menghapus sesi di ${wipeUrl}...`);
        await axios.get(wipeUrl, { timeout: 5000 });
        logger.info('[WIPE] Permintaan hapus sesi berhasil dikirim.');
    } catch (error) {
        logger.warn(`[WIPE] Gagal menghubungi instance lama (mungkin sudah nonaktif, ini normal).`);
    }
}

const connectToWhatsApp = () => new Promise(async (resolve, reject) => {
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();
    
    sock = makeWASocket({ version, auth: state, browser: Browsers.windows('Chrome'), logger: pino({ level: 'silent' }), getMessage: async () => undefined });
    setSocket(sock);
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            connectRetryCount = 0; setConnectionStatus(true);
            logger.info(`Terhubung sebagai ${sock.user.name || config.botName}`); resolve(sock);
        } else if (connection === 'close') {
            setConnectionStatus(false);
            const error = new Boom(lastDisconnect?.error);
            const statusCode = error.output?.statusCode;
            if (statusCode === DisconnectReason.loggedOut) {
                logger.error('[FATAL] Kredensial tidak valid (Logged Out).'); return reject(error);
            }
            connectRetryCount++;
            if (connectRetryCount <= MAX_CONNECT_RETRIES) {
                logger.warn(`Koneksi terputus (Kode: ${statusCode}), mencoba lagi... (${connectRetryCount}/${MAX_CONNECT_RETRIES})`);
                setTimeout(() => connectToWhatsApp().then(resolve).catch(reject), 5000 * connectRetryCount);
            } else {
                logger.error(`[FATAL] Gagal terhubung setelah ${MAX_CONNECT_RETRIES} percobaan.`); process.exit(1);
            }
        }
    });
    sock.ev.on('messages.upsert', (m) => { if (m.type === 'notify') m.messages.forEach(msg => handler(sock, msg)); });
});

async function start() {
    console.clear();
    console.log(chalk.bold.cyan(config.botName));
    console.log(chalk.gray(`by ${config.ownerName}\n`));

    backupLocalCreds();
    await syncWithRetry('/sinkronsesi', processSessionCreds, { responseType: 'arraybuffer' });
    const dbSynced = await syncWithRetry('/sinkrondb', processDatabaseFile, { responseType: 'arraybuffer' });
    await triggerRemoteSessionWipe();
    
    if (dbSynced) db.reinit();
    else logger.warn('[DB] Melanjutkan dengan database lokal karena sinkronisasi gagal.');
    
    loadPlugins();
    
    logger.info('Memberi jeda 2 detik untuk stabilisasi sistem file...');
    await new Promise(res => setTimeout(res, 2000));

    try {
        logger.info('[CONNECT] Mencoba terhubung dengan sesi saat ini...');
        await connectToWhatsApp();
    } catch (e) {
        if (e.output?.statusCode === DisconnectReason.loggedOut) {
            logger.error('[FAILSAFE] Sesi saat ini tidak valid. Mencoba memulihkan dari cadangan...');
            if (restoreLocalCreds()) {
                try {
                    logger.info('[CONNECT] Mencoba terhubung kembali dengan sesi cadangan...');
                    await connectToWhatsApp();
                } catch (finalError) {
                    logger.fatal('[FATAL] Sesi cadangan juga gagal.', finalError); process.exit(1);
                }
            } else {
                logger.fatal('[FATAL] Tidak ada sesi cadangan untuk dipulihkan.'); process.exit(1);
            }
        } else {
            logger.fatal('[FATAL] Terjadi error tak terduga saat koneksi awal.', e); process.exit(1);
        }
    }
}

start();