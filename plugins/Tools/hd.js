const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { uploadToImgbb } = require('../../lib/functions');

module.exports = {
  command: 'hd',
  description: 'Meningkatkan kualitas gambar menjadi HD menggunakan AI.',
  run: async (sock, message, args) => {
    let mediaSource = null;
    const quotedMessage = message.msg?.contextInfo?.quotedMessage;
    
    if (quotedMessage && /imageMessage/.test(Object.keys(quotedMessage)[0])) {
      mediaSource = { message: quotedMessage };
    } else if (/imageMessage/.test(message.type)) {
      mediaSource = message;
    } else {
      return message.reply('Silakan reply gambar, atau kirim gambar dengan caption *.hd*');
    }
    
    try {
      await message.reply('Sedang memproses gambar dengan AI, ini mungkin memakan waktu beberapa saat...');
      const buffer = await downloadMediaMessage(mediaSource, 'buffer', {});
      
      const uploadedUrl = await uploadToImgbb(buffer);
      if (!uploadedUrl) {
        return message.reply('Gagal mengunggah gambar sementara untuk diproses.');
      }
      
      const apiUrl = `https://nirkyy-dev.hf.space/api/v1/ai-upscale?url=${encodeURIComponent(uploadedUrl)}&scale=4`;
      
      await message.media('Berikut adalah gambar versi HD:', apiUrl);
      
    } catch (e) {
      console.error('Error pada plugin HD:', e);
      await message.reply(`Gagal memproses gambar. Error: ${e.message}`);
    }
  }
};