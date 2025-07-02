const axios = require('axios');

module.exports = {
  command: ['stiksearch', 'stickersearch'],
  description: 'Mencari stiker dari Pinterest berdasarkan teks.',
  category: 'Search',
  run: async (sock, message, args) => {
    if (!args.length) {
      return message.reply('Gunakan format: *.stiksearch <teks>*\nContoh: .stiksearch kucing lucu');
    }
    
    const query = args.join(' ');
    const apiUrl = `https://nirkyy-dev.hf.space/api/v1/pin?query=${encodeURIComponent(query)}`;
    
    try {
      await message.reply(`🔎 Mencari stiker untuk "*${query}*"...`);
      const response = await axios.get(apiUrl);
      const result = response.data;
      
      if (!result.success || !result.data || result.data.pins.length === 0) {
        return message.reply(`Tidak ada stiker yang ditemukan untuk "*${query}*".`);
      }
      
      const pins = result.data.pins;
      const stickerCount = Math.min(pins.length, 5);
      
      await message.reply(`Menemukan ${pins.length} hasil. Mengirim ${stickerCount} stiker teratas...`);
      
      for (let i = 0; i < stickerCount; i++) {
        const pin = pins[i];
        if (pin.media?.images?.orig?.url) {
          try {
            await message.sticker(pin.media.images.orig.url);
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (stickerError) {
            console.error(`Gagal membuat stiker dari URL: ${pin.media.images.orig.url}`, stickerError);
            await message.reply(`Gagal mengirim salah satu stiker.`);
          }
        }
      }
    } catch (error) {
      console.error('Error pada plugin stiksearch:', error);
      await message.reply('Terjadi kesalahan saat mencari stiker. API mungkin sedang tidak aktif.');
    }
  }
};