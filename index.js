const pm2 = require('pm2');
const config = require('./config');

const serverOptions = {
    script: './app.js',
    name: 'NirKyy-Server',
    exec_mode: 'fork',
    max_memory_restart: '150M'
};

const botOptions = {
    script: './purpur.js',
    name: 'NirKyy-Bot',
    exec_mode: 'fork',
    max_memory_restart: '350M'
};

pm2.connect(function(err) {
    if (err) {
        console.error(err);
        process.exit(2);
    }
    
    console.log(`[PM2] Terhubung. Memulai proses untuk Server dan Bot...`);
    
    pm2.start([serverOptions, botOptions], function(err, apps) {
        if (err) {
            console.error('[PM2] Gagal memulai salah satu aplikasi:', err);
            pm2.disconnect();
            throw err;
        }
        
        console.log(`[PM2] Aplikasi Server dan Bot berhasil dimulai.`);
        console.log('[PM2] Menampilkan log PM2. Tekan CTRL+C untuk keluar dari log (proses tetap berjalan di background).');
        
        pm2.streamLogs('all', 0);
    });
});