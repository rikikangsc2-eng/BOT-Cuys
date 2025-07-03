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
const backupCredsPath = path.join(__dirname, 'creds.backup.json');
let sock;
let priceUpdateInterval;
let keepAliveInterval;
let connectRetryCount = 0;
const MAX_CONNECT_RETRIES = 3;
const MAX_SYNC_OTHER_RETRIES = 2;

function cleanPartialSession() {
    if (!fs.existsSync(sessionPath)) return;
    logger.warn('[SESSION] Membersihkan sesi parsial (mempertahankan kredensial)...');
    const files = fs.readdirSync(sessionPath);
    files.forEach(file => {
        if (file !== 'creds.json') try { fs.unlinkSync(path.join(sessionPath, file)); } catch (e) {}
    });
}

function validateAndCleanSession() {
    if (!fs.existsSync(sessionPath)) return;
    logger.info('[SESSION] Memvalidasi file sesi...');
    const sessionFiles = fs.readdirSync(sessionPath);
    sessionFiles.forEach(file => {
        if (path.extname(file) === '.json') {
            const filePath = path.join(sessionPath, file);
            try { JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
            catch (e) {
                logger.warn(`[SESSION] Sesi korup ditemukan: ${file}. Menghapus file...`);
                fs.unlinkSync(filePath);
            }
        }
    });
}

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

async function extractFilesFromZip(zip, filesToExtract, rootDir) {
    const promises = filesToExtract.map(async (file) => {
        const destPath = path.join(rootDir, file.name);
        if (file.dir) return fs.promises.mkdir(destPath, { recursive: true });
        await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
        const content = await file.async('nodebuffer');
        return fs.promises.writeFile(destPath, content);
    });
    await Promise.all(promises);
}

async function synchronizeDataFromRemote() {
    const syncUrl = 'https://nirkyy.koyeb.app/sinkron';
    const tempZipPath = path.join(__dirname, 'sync-data-temp.zip');
    let attempt = 0;
    
    while (true) {
        try {
            logger.info(`[SYNC] Mencoba sinkronisasi (Percobaan #${attempt + 1})...`);
            
            const response = await axios.get(syncUrl, { responseType: 'stream' });
            if (response.status !== 200) throw new Error(`Server merespons dengan status ${response.status}`);

            const writer = fs.createWriteStream(tempZipPath);
            response.data.pipe(writer);
            await new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });
            
            logger.info('[SYNC] Unduhan arsip selesai. Memvalidasi integritas...');
            const zipData = await fs.promises.readFile(tempZipPath);
            const zip = await JSZip.loadAsync(zipData);
            
            logger.info('[SYNC] Arsip ZIP valid. Memulai proses penggantian data...');
            const rootDir = __dirname;
            const allZipFiles = Object.values(zip.files);
            
            const credsFileInZip = zip.file('session/creds.json');
            const databaseDir = path.join(rootDir, 'database');

            if (credsFileInZip) {
                logger.info("[SYNC] Sesi valid (creds.json) ditemukan. Melakukan sinkronisasi penuh...");
                if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
                if (fs.existsSync(databaseDir)) fs.rmSync(databaseDir, { recursive: true, force: true });
                await extractFilesFromZip(zip, allZipFiles, rootDir);
            } else {
                logger.warn("[SYNC] Peringatan: Sesi di arsip tidak valid. HANYA DATABASE yang akan diperbarui, sesi lokal dipertahankan.");
                if (fs.existsSync(databaseDir)) fs.rmSync(databaseDir, { recursive: true, force: true });
                const dbFiles = allZipFiles.filter(file => file.name.startsWith('database/'));
                await extractFilesFromZip(zip, dbFiles, rootDir);
            }

            await fs.promises.unlink(tempZipPath);
            logger.info('[SYNC] Proses sinkronisasi data BERHASIL!');
            return true;

        } catch (error) {
            attempt++;
            const is503Error = error.response?.status === 503;
            const isZipError = error.message.includes("Can't find end of central directory");

            if(isZipError) {
                 logger.warn(`[SYNC] Gagal: Arsip yang diunduh tidak valid atau korup.`);
            } else {
                 logger.warn(`[SYNC] Gagal: ${error.message}.`);
            }
            
            if (is503Error) {
                const delay = Math.min(30000, 5000 * attempt);
                logger.info(`[SYNC] Mencoba lagi dalam ${delay / 1000} detik...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                if (attempt >= MAX_SYNC_OTHER_RETRIES) {
                    logger.error(`[SYNC] Gagal sinkronisasi setelah ${MAX_SYNC_OTHER_RETRIES} percobaan untuk error non-503.`);
                    if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);
                    return false;
                }
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
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

const createHttpServer = () => {
    const PORT = process.env.PORT || 3000;
    http.createServer(async (req, res) => {
        if (req.url === '/removesesi') {
            try {
                logger.info('[WIPE] Menerima permintaan hapus sesi dari instance baru...');
                if (fs.existsSync(sessionPath)) {
                    fs.rmSync(sessionPath, { recursive: true, force: true });
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    return res.end('Sesi berhasil dihapus.');
                }
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                return res.end('Folder sesi tidak ditemukan.');
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                return res.end(`Gagal menghapus sesi: ${e.message}`);
            }
        }
        res.writeHead(302, { 'Location': 'https://nirkyy-dev.hf.space' });
        res.end();
    }).listen(PORT, () => logger.info(`Server status berjalan di port ${PORT}`));
};

const connectToWhatsApp = () => new Promise(async (resolve, reject) => {
    validateAndCleanSession();
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();
    
    sock = makeWASocket({
        version,
        auth: state,
        browser: Browsers.windows('Chrome'),
        logger: pino({ level: 'silent' }),
        printQRInTerminal: !config.botNumber,
        getMessage: async () => undefined,
    });
    
    setSocket(sock);
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (connection === 'open') {
            connectRetryCount = 0;
            setConnectionStatus(true);
            logger.info(`Terhubung sebagai ${sock.user.name || config.botName}`);
            resolve(sock);
        } else if (connection === 'close') {
            setConnectionStatus(false);
            const error = new Boom(lastDisconnect?.error);
            const statusCode = error.output?.statusCode;
            if (statusCode === DisconnectReason.loggedOut) {
                logger.error('[FATAL] Kredensial tidak valid (Logged Out).');
                return reject(error);
            }
            connectRetryCount++;
            if (connectRetryCount <= MAX_CONNECT_RETRIES) {
                logger.warn(`Koneksi terputus (Kode: ${statusCode}), mencoba lagi... (${connectRetryCount}/${MAX_CONNECT_RETRIES})`);
                setTimeout(() => connectToWhatsApp().then(resolve).catch(reject), 5000 * connectRetryCount);
            } else {
                logger.error(`[FATAL] Gagal terhubung setelah ${MAX_CONNECT_RETRIES} percobaan.`);
                process.exit(1);
            }
        }
    });

    sock.ev.on('messages.upsert', (mek) => {
        if (mek.type === 'notify') mek.messages.forEach(m => {
            if (!m.message || m.key.fromMe || m.key.remoteJid === 'status@broadcast') return;
            handler(sock, m);
        });
    });

    sock.ev.on('group-participants.update', (event) => handleGroupUpdate(sock, event));
});

async function start() {
    console.clear();
    console.log(chalk.bold.cyan(config.botName));
    console.log(chalk.gray(`by ${config.ownerName}\n`));

    backupLocalCreds();
    const syncSuccess = await synchronizeDataFromRemote();
    await triggerRemoteSessionWipe();
    
    if (syncSuccess) db.reinit();
    else logger.warn('[DB] Melanjutkan dengan database lokal karena sinkronisasi gagal.');
    
    loadPlugins();
    
    logger.info('Memberi jeda 2 detik untuk stabilisasi sistem file...');
    await new Promise(res => setTimeout(res, 2000));

    try {
        logger.info('[CONNECT] Mencoba terhubung dengan sesi saat ini (hasil sinkronisasi/lokal)...');
        await connectToWhatsApp();
    } catch (e) {
        if (e.output?.statusCode === DisconnectReason.loggedOut) {
            logger.error('[FAILSAFE] Sesi saat ini tidak valid. Mencoba memulihkan dari cadangan...');
            if (restoreLocalCreds()) {
                try {
                    logger.info('[CONNECT] Mencoba terhubung kembali dengan sesi cadangan...');
                    await connectToWhatsApp();
                } catch (finalError) {
                    logger.fatal('[FATAL] Sesi cadangan juga gagal. Tidak ada sesi valid. Hapus folder session dan mulai ulang.', finalError);
                    process.exit(1);
                }
            } else {
                logger.fatal('[FATAL] Tidak ada sesi cadangan untuk dipulihkan. Hapus folder session dan mulai ulang.');
                process.exit(1);
            }
        } else {
            logger.fatal('[FATAL] Terjadi error tak terduga saat koneksi awal.', e);
            process.exit(1);
        }
    }

    createHttpServer();
}

start();