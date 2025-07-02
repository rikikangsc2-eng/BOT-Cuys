const pm2 = require('pm2');
const config = require('./config');

const pm2Options = {
    script: './purpur.js',
    name: config.botName || 'NirKyy-Bot',
    exec_mode: 'fork',
    max_memory_restart: '400M'
};

pm2.connect(function(err) {
    if (err) {
        console.error(err);
        process.exit(2);
    }

    console.log(`[PM2] Terhubung. Memulai proses untuk ${pm2Options.name}...`);

    pm2.start(pm2Options, function(err, apps) {
        if (err) {
            console.error('[PM2] Gagal memulai aplikasi:', err);
            pm2.disconnect();
            throw err;
        }

        console.log(`[PM2] Aplikasi ${pm2Options.name} berhasil dimulai.`);
        console.log('[PM2] Menampilkan log PM2. Tekan CTRL+C untuk keluar dari log (bot tetap berjalan di background).');
        
        pm2.streamLogs('all', 0);

    });
});