const axios = require('axios');

module.exports = {
  command: ['ustadz', 'tanya'],
  description: 'Membuat stiker meme Ustadz dengan teks kustom.',
  category: 'Fun',
  run: async (sock, message, args) => {
    const query = args.join(' ');
    if (!query) {
      return message.reply('Gunakan format: *.ustadz <teks pertanyaan>*\nContoh: .ustadz kapan saya nikah?');
    }
    
    await message.reply('Sedang meminta nasihat dari Ustadz... 🙏');
    
    try {
      const apiUrl = 'https://lemon-ustad.vercel.app/api/generate-image';
      const response = await axios.post(apiUrl, {
        isi: query,
        option: "type2"
      }, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
          'Referer': 'https://lemon-ustad.vercel.app/'
        },
        responseType: 'arraybuffer'
      });
      
      await message.sticker(response.data);

    } catch (e) {
      console.error('Error pada plugin Ustadz:', e);
      await message.reply('Maaf, Ustadz sedang tidak di tempat. Mungkin lagi istirahat atau API-nya bermasalah.');
    }
  }
};