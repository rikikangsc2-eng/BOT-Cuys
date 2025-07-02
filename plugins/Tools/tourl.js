const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { uploadToImgbb } = require('../../lib/functions');

module.exports = {
    command: 'tourl',
    description: 'Mengubah media gambar/video menjadi URL.',
    run: async (sock, message, args) =>  {
        let mediaSource = null;
        const quotedMessage = message.msg?.contextInfo?.quotedMessage;

        if (quotedMessage && /imageMessage|videoMessage/.test(Object.keys(quotedMessage)[0])) {
            mediaSource = { message: quotedMessage };
        
        } else if (/imageMessage|videoMessage/.test(message.type)) {
            mediaSource = message;
        } else {
            return message.reply('Silakan reply gambar/video, atau kirim gambar/video dengan caption `.tourl`');
        }

        try {
            await message.reply('Sedang mengunggah media...');
            const buffer = await downloadMediaMessage(mediaSource, 'buffer', {});
            const url = await uploadToImgbb(buffer);
            await message.reply(url);
        } catch (e) {
            console.error(e);
            await message.reply(`Gagal mengunggah media. Error: ${e.message}`);
        }
    }
};