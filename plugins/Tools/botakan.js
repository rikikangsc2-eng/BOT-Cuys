const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const axios = require('axios');

module.exports = {
  command: ['botakan', 'gundul'],
  description: 'Membuat wajah di gambar menjadi botak menggunakan AI.',
  category: 'Fun',
  run: async (sock, message, args) => {
    let mediaSource = null;
    const quotedMessage = message.msg?.contextInfo?.quotedMessage;

    if (quotedMessage && /imageMessage/.test(Object.keys(quotedMessage)[0])) {
      mediaSource = { message: quotedMessage };
    } else if (/imageMessage/.test(message.type)) {
      mediaSource = message;
    } else {
      return message.reply('Silakan reply gambar, atau kirim gambar dengan caption *.botakan*');
    }

    try {
      await message.reply('Mencukur rambut, harap tunggu...');
      const buffer = await downloadMediaMessage(mediaSource, 'buffer', {});
      const base64Image = buffer.toString('base64');

      const requestBody = {
        imageData: base64Image,
        filter: "botak"
      };

      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; RMX2185 Build/QP1A.190711.020) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.7151.90 Mobile Safari/537.36',
        'Referer': 'https://wpw.my.id/'
      };

      const response = await axios.post('https://wpw.my.id/api/process-image', requestBody, { headers });

      if (response.data && response.data.status === 'success' && response.data.processedImageUrl) {
        const base64Data = response.data.processedImageUrl.replace('data:image/png;base64,', '');
        const stickerBuffer = Buffer.from(base64Data, 'base64');
        await message.media(stickerBuffer);
      } else {
        throw new Error('Respons API tidak valid atau gagal.');
      }

    } catch (error) {
      console.error('Error pada plugin botakan:', error);
      await message.reply('Gagal memproses gambar. API mungkin sedang bermasalah atau gambar tidak cocok.');
    }
  }
};