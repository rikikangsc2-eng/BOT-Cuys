const axios = require('axios');

module.exports = {
  command: 'brat',
  description: 'Membuat stiker brat statis dengan teks kustom.',
  run: async (sock, message, args) => {
    if (!args.length) {
      return message.reply('Silakan masukkan teksnya.\nContoh: .brat apaan tuh');
    }
    
    const text = args.join(' ');
    const apiUrl = `https://nirkyy-dev.hf.space/api/v1/brat?text=${encodeURIComponent(text)}&animasi=false`;
    
    try {
      await message.reply('Sedang membuat stiker brat...');
      
      const response = await axios.get(apiUrl, {
        responseType: 'arraybuffer'
      });
      
      const buffer = Buffer.from(response.data, 'binary');
      await message.sticker(buffer);
      
    } catch (e) {
      console.error(e);
      await message.reply('Gagal membuat stiker. API mungkin sedang tidak aktif atau teks terlalu panjang.');
    }
  }
};