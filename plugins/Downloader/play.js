const axios = require('axios');

module.exports = {
  command: ['play'],
  description: 'Mencari dan mengunduh lagu dari SoundCloud.',
  run: async (sock, message, args) => {
    if (!args.length) {
      return message.reply('Gunakan format: *.play <judul lagu>*');
    }
    
    const query = args.join(' ');
    
    try {
      await sock.sendMessage(message.from, { react: { text: '🔎', key: message.key } });
      
      const searchApiUrl = `https://nirkyy-dev.hf.space/api/v1/soundcloud-search?query=${encodeURIComponent(query)}`;
      const searchResponse = await axios.get(searchApiUrl);
      const searchResult = searchResponse.data;
      
      if (!searchResult.success || searchResult.data.length === 0) {
        await sock.sendMessage(message.from, { react: { text: '❌', key: message.key } });
        return message.reply('Lagu tidak ditemukan. Coba gunakan judul yang lebih spesifik.');
      }
      
      const topResult = searchResult.data[0];
      const songUrl = topResult.url;
      const songTitle = topResult.title;
      
      await sock.sendMessage(message.from, { react: { text: '📥', key: message.key } });
      
      const downloadApiUrl = `https://nirkyy-dev.hf.space/api/v1/soundcloud-downloader?url=${encodeURIComponent(songUrl)}`;
      const downloadResponse = await axios.get(downloadApiUrl);
      const downloadResult = downloadResponse.data;
      
      if (!downloadResult.success || !downloadResult.data.downloadUrl) {
        await sock.sendMessage(message.from, { react: { text: '❌', key: message.key } });
        return message.reply('Gagal mendapatkan link unduhan untuk lagu ini.');
      }
      
      const finalDownloadUrl = downloadResult.data.downloadUrl;
      
      await message.media(songTitle, finalDownloadUrl);
      await sock.sendMessage(message.from, { react: { text: '✅', key: message.key } });
      
    } catch (e) {
      console.error('Error pada plugin Play:', e);
      await sock.sendMessage(message.from, { react: { text: '❌', key: message.key } });
      await message.reply('Terjadi kesalahan. API mungkin sedang bermasalah atau judul tidak valid.');
    }
  }
};