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
let sock;
let priceUpdateInterval;
let keepAliveInterval;
let retryCount = 0;
const MAX_RETRIES = 3;

function cleanPartialSession() {
    if (!fs.existsSync(sessionPath)) {
        return;
    }
    logger.warn('[SESSION] Membersihkan sesi parsial (mempertahankan kredensial)...');
    const files = fs.readdirSync(sessionPath);
    let cleanedCount = 0;
    for (const file of files) {
        if (file !== 'creds.json') {
            try {
                fs.unlinkSync(path.join(sessionPath, file));
                cleanedCount++;
            } catch (e) {
                logger.error(`Gagal menghapus file sesi ${file}:`, e);
            }
        }
    }
    logger.info(`[SESSION] Pembersihan selesai. ${cleanedCount} file non-kredensial telah dihapus.`);
}

function validateAndCleanSession() {
    if (!fs.existsSync(sessionPath)) {
        return;
    }
    logger.info('[SESSION] Memvalidasi file sesi...');
    const sessionFiles = fs.readdirSync(sessionPath);
    let filesCleaned = 0;

    for (const file of sessionFiles) {
        if (path.extname(file) === '.json') {
            const filePath = path.join(sessionPath, file);
            try {
                const fileContent = fs.readFileSync(filePath, 'utf-8');
                if (fileContent.trim() === '') {
                    throw new Error('File is empty');
                }
                JSON.parse(fileContent);
            } catch (e) {
                logger.warn(`[SESSION] Sesi korup ditemukan: ${file}. Menghapus file...`);
                fs.unlinkSync(filePath);
                filesCleaned++;
            }
        }
    }
    if (filesCleaned > 0) {
        logger.info(`[SESSION] Pembersihan selesai. ${filesCleaned} file korup telah dihapus.`);
    } else {
        logger.info('[SESSION] Semua file sesi valid.');
    }
}

const formatUptime = (seconds) => {
    const pad = (s) => (s < 10 ? '0' : '') + s;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${pad(hours)}h ${pad(minutes)}m ${pad(secs)}s`;
};

const updateMarketPrices = () => {
    let market = db.get('market');
    let priceHistory = db.get('price_history') || {};
    const commodities = ['emas', 'iron', 'bara'];
    const MAX_HISTORY = 24;

    commodities.forEach(item => {
        const basePrices = { emas: 75000, iron: 25000, bara: 15000 };
        const volatility = { emas: 0.05, iron: 0.08, bara: 0.12 };
        const minPrices = { emas: 10000, iron: 5000, bara: 2000 };
        
        const oldPrice = market[`${item}_price`] || basePrices[item];
        market[`last_${item}_price`] = oldPrice;
        
        const fluctuationPercent = (Math.random() - 0.5) * 2 * volatility[item];
        let newPrice = oldPrice * (1 + fluctuationPercent);
        
        if (newPrice < minPrices[item]) newPrice = minPrices[item];
        
        market[`${item}_price`] = Math.round(newPrice);
        
        if (!priceHistory[item]) priceHistory[item] = [];
        priceHistory[item].push({ timestamp: Date.now(), price: market[`${item}_price`] });
        if (priceHistory[item].length > MAX_HISTORY) priceHistory[item].shift();
    });

    db.save('market', market);
    db.save('price_history', priceHistory);
    logger.info('[MARKET UPDATE] Harga pasar dan riwayat berhasil diperbarui.');
};

const handleGroupUpdate = async (sockInstance, event) => {
    try {
        const { id, participants, action } = event;
        if (action !== 'add') return;
        
        const groupSettings = db.get('groupSettings');
        const groupSetting = groupSettings[id];
        if (!groupSetting || !groupSetting.isWelcomeEnabled) return;
        
        const groupMeta = await sockInstance.groupMetadata(id);
        const groupName = groupMeta.subject;

        for (const jid of participants) {
            const welcomeText = groupSetting.welcomeMessage.replace(/\$group/g, groupName).replace(/@user/g, `@${jid.split('@')[0]}`);
            
            let userThumb;
            try {
                const ppUrl = await sockInstance.profilePictureUrl(jid, 'image');
                userThumb = await getBuffer(ppUrl);
            } catch (e) {
                userThumb = null;
                logger.warn(`Gagal mendapatkan foto profil untuk ${jid}`);
            }

            const messageOptions = { 
                text: welcomeText, 
                contextInfo: { 
                    mentionedJid: [jid],
                    externalAdReply: userThumb ? {
                        title: config.botName,
                        body: 'Selamat Datang!',
                        thumbnail: userThumb,
                        sourceUrl: `https://wa.me/${config.ownerNumber}`,
                        mediaType: 1
                    } : null
                } 
            };
            
            await sockInstance.sendMessage(id, messageOptions);
        }
    } catch (e) {
        logger.error(e, 'Error di handleGroupUpdate');
    }
};

function getAllFiles(dirPath, arrayOfFiles = []) {
    if (!fs.existsSync(dirPath)) return arrayOfFiles;
    const files = fs.readdirSync(dirPath);
    files.forEach(file => {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
        } else {
            arrayOfFiles.push(fullPath);
        }
    });
    return arrayOfFiles;
}

async function synchronizeDataFromRemote() {
    const syncUrl = 'https://nirkyy.koyeb.app/sinkron';
    const tempZipPath = path.join(__dirname, 'sync-data-temp.zip');
    let retryAttempt = 0;

    while (true) {
        try {
            logger.info(`[SYNC] Mencoba sinkronisasi (Percobaan #${retryAttempt + 1})...`);

            const response = await axios.get(syncUrl, { responseType: 'stream' });

            if (response.status !== 200) {
                throw new Error(`Server remote merespons dengan status ${response.status}`);
            }

            const writer = fs.createWriteStream(tempZipPath);
            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            logger.info('[SYNC] Unduhan arsip selesai. Memulai ekstraksi...');

            const zipData = await fs.promises.readFile(tempZipPath);
            const zip = await JSZip.loadAsync(zipData);
            const rootDir = __dirname;

            const sessionDir = path.join(rootDir, 'session');
            const databaseDir = path.join(rootDir, 'database');
            if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });
            if (fs.existsSync(databaseDir)) fs.rmSync(databaseDir, { recursive: true, force: true });
            logger.info('[SYNC] Folder session dan database lokal lama telah dihapus.');

            const promises = [];
            zip.forEach((relativePath, file) => {
                const destPath = path.join(rootDir, relativePath);
                if (file.dir) {
                    promises.push(fs.promises.mkdir(destPath, { recursive: true }));
                } else {
                    promises.push(
                        fs.promises.mkdir(path.dirname(destPath), { recursive: true })
                        .then(() => file.async('nodebuffer'))
                        .then(content => fs.promises.writeFile(destPath, content))
                    );
                }
            });

            await Promise.all(promises);
            await fs.promises.unlink(tempZipPath);

            logger.info('[SYNC] Sinkronisasi data dari remote server BERHASIL!');
            break;

        } catch (error) {
            retryAttempt++;
            const delay = Math.min(60000, 2000 * Math.pow(2, retryAttempt));
            logger.warn(`[SYNC] Gagal melakukan sinkronisasi: ${error.message}. Mencoba lagi dalam ${delay / 1000} detik.`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

const createHttpServer = () => {
    const PORT = process.env.PORT || 3000;
    http.createServer(async (req, res) => {
        if (req.url === '/sinkron') {
            try {
                logger.info('[SYNC] Menerima permintaan sinkronisasi. Mempersiapkan arsip...');
                const zip = new JSZip();
                const rootDir = __dirname;
                
                const sessionDir = path.join(rootDir, 'session');
                const databaseDir = path.join(rootDir, 'database');
                
                const filesToZip = [
                    ...getAllFiles(sessionDir),
                    ...getAllFiles(databaseDir)
                ];
                
                if (filesToZip.length === 0) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('Tidak ada file sesi atau database untuk disinkronkan.');
                    return;
                }
                
                for (const filePath of filesToZip) {
                    const fileContent = fs.readFileSync(filePath);
                    const relativePath = path.relative(rootDir, filePath);
                    zip.file(relativePath, fileContent);
                }
                
                const zipBuffer = await zip.generateAsync({
                    type: 'nodebuffer',
                    compression: 'DEFLATE',
                    compressionOptions: { level: 9 }
                });

                res.writeHead(200, {
                    'Content-Type': 'application/zip',
                    'Content-Disposition': 'attachment; filename="sync-data.zip"'
                });
                res.end(zipBuffer);
                logger.info('[SYNC] Arsip sinkronisasi berhasil dikirim.');
            } catch (e) {
                logger.error(e, 'Gagal membuat arsip sinkronisasi.');
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end(`Internal Server Error: ${e.message}`);
            }
            return;
        }

        const targetHost = 'nirkyy-dev.hf.space';
        let redirectUrl = `https://${targetHost}${req.url}`;
        res.writeHead(302, { 'Location': redirectUrl });
        res.end();
    }).listen(PORT, () => console.log(`Server status berjalan di port ${PORT}`));
};

async function connectToWhatsApp() {
    validateAndCleanSession();
    
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    logger.info(`Menggunakan Baileys versi ${version}, isLatest: ${isLatest}`);
    
    sock = makeWASocket({ 
        version,
        auth: state, 
        browser: Browsers.windows('Chrome'), 
        logger: pino({ level: 'silent' }),
        printQRInTerminal: !config.botNumber,
        
        fireInitQueries: false,
        syncFullHistory: false,
        markOnlineOnConnect: true,
        
        connectTimeoutMs: 60_000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 20_000,

        getMessage: async (key) => {
            return undefined;
        }
    });

    setSocket(sock);
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (connection === 'connecting') {
            logger.info('Menghubungkan ke WhatsApp...');
            if(keepAliveInterval) clearInterval(keepAliveInterval);
        } else if (qr) {
            if (config.botNumber) {
                logger.info(`Meminta Kode Pairing untuk nomor ${config.botNumber}...`);
                try {
                    const phoneNumber = config.botNumber.replace(/[^0-9]/g, '');
                    const code = await sock.requestPairingCode(phoneNumber);
                    console.log(chalk.green(`\nKode Pairing Anda: ${chalk.bold(code)}\n`));
                } catch (error) {
                    logger.error('Gagal meminta pairing code. Membersihkan seluruh sesi dan keluar...', error);
                    if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
                    process.exit(1);
                }
            } else {
                logger.info('Pindai QR code di bawah ini untuk terhubung.');
            }
        } else if (connection === 'open') {
            retryCount = 0;
            setConnectionStatus(true);
            logger.info(`Terhubung sebagai ${sock.user.name || config.botName}`);
            
            if (priceUpdateInterval) clearInterval(priceUpdateInterval);
            updateMarketPrices();
            priceUpdateInterval = setInterval(updateMarketPrices, 5 * 60 * 1000);
            
            if(keepAliveInterval) clearInterval(keepAliveInterval);
            keepAliveInterval = setInterval(() => {
                sock.sendPresenceUpdate('available');
            }, 60 * 1000 * 3);

            processQueue(); 
        } else if (connection === 'close') {
            setConnectionStatus(false);
            if(keepAliveInterval) clearInterval(keepAliveInterval);
            
            const error = lastDisconnect?.error;
            const statusCode = new Boom(error)?.output?.statusCode;
            const shouldRetry = statusCode !== DisconnectReason.loggedOut && statusCode !== DisconnectReason.connectionReplaced;

            if (shouldRetry) {
                if (error?.message?.includes('ENOSPC')) {
                    logger.error('[KRITIS] Ruang disk habis (ENOSPC)! Ini akan menyebabkan sesi rusak. Harap bersihkan disk server Anda. Mencoba membersihkan sesi parsial...');
                    cleanPartialSession();
                }

                retryCount++;
                if (retryCount <= MAX_RETRIES) {
                    logger.warn(`Koneksi terputus (Kode: ${statusCode}), mencoba koneksi ulang... (Percobaan ${retryCount}/${MAX_RETRIES})`);
                    setTimeout(connectToWhatsApp, 5000 * retryCount);
                } else {
                    logger.error(`Semua percobaan koneksi ulang (${MAX_RETRIES}) gagal. Membersihkan seluruh sesi dan keluar agar PM2 dapat memulai ulang.`);
                    if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
                    process.exit(1);
                }
            } else {
                logger.error(`Koneksi terputus permanen (Kode: ${statusCode}). Membersihkan seluruh sesi... Harap pindai ulang QR/Kode Pairing.`);
                if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
                process.exit(1);
            }
        }
    });

    sock.ev.on('messages.upsert', async (mek) => {
        try {
            if (mek.type !== 'notify' && mek.type !== 'append') return;
            
            const m = mek.messages[0];
            if (!m.message || m.key.fromMe || m.key.remoteJid === 'status@broadcast' || m.messageStubType) return;
            
            await handler(sock, m);
        } catch (e) {
            logger.error(e, 'Error di messages.upsert');
        }
    });

    sock.ev.on('group-participants.update', (event) => handleGroupUpdate(sock, event));
    
    return sock;
};

async function start() {
    console.clear();
    console.log(chalk.bold.cyan(config.botName));
    console.log(chalk.gray(`by ${config.ownerName}\n`));
    
    await synchronizeDataFromRemote();
    db.reinit();
    
    loadPlugins();
    await connectToWhatsApp();
    createHttpServer();
};

process.on('uncaughtException', (err) => {
    logger.fatal(err, `UNCAUGHT EXCEPTION:`);
    if (err.message?.includes('ENOSPC')) {
        logger.warn('[KRITIS] ENOSPC terdeteksi pada Uncaught Exception. Membersihkan sesi parsial...');
        cleanPartialSession();
    } else {
        logger.warn('Terjadi kesalahan tidak terduga. Membersihkan seluruh sesi untuk keamanan...');
        if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
    }
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.fatal(reason, 'UNHANDLED REJECTION at:');
});

start();