const { downloadMediaMessage } = require('@whiskeysockets/baileys');

const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

module.exports = {
    command: 's',
    description: 'Membuat stiker dari gambar/video (Maks 5MB).',
    run: async (sock, message, args) => {
        let mediaSource = null;
        const quotedMessage = message.msg?.contextInfo?.quotedMessage;
        
        if (quotedMessage && /imageMessage|videoMessage/.test(Object.keys(quotedMessage)[0])) {
            mediaSource = { message: quotedMessage };
        } else if (/imageMessage|videoMessage/.test(message.type)) {
            mediaSource = message;
        } else {
            return message.reply('Silakan reply gambar/video, atau kirim gambar/video dengan caption `.s`');
        }
        
        try {
            await message.reply('Sedang memproses, mohon tunggu...');
            
            const buffer = await downloadMediaMessage(mediaSource, 'buffer', {});
            
            if (buffer.length > MAX_FILE_SIZE_BYTES) {
                return message.reply(`Gagal membuat stiker. Ukuran file media melebihi batas *${MAX_FILE_SIZE_MB}MB*.`);
            }
            
            await message.sticker(buffer);
            
        } catch (e) {
            console.error(e);
            await message.reply(`Gagal membuat stiker. Pastikan media yang dikirim valid.\nError: ${e.message}`);
        }
    }
};