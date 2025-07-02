const axios = require('axios');
const config = require('../../config');

module.exports = {
  command: ['tiktok', 'tt', 'tthd'],
  description: 'Mengunduh video TikTok. Gunakan .tthd untuk kualitas HD.',
  run: async (sock, message, args) => {
    if (!args[0] || !args[0].includes('tiktok.com')) {
      return message.reply('Gunakan format: *.tiktok <URL TikTok>* atau *.tthd <URL TikTok>*');
    }
    
    await message.reply('Sedang memproses, mohon tunggu...');
    
    try {
      const url = args[0];
      const usedCommand = message.body.split(' ')[0].slice(config.prefix.length).toLowerCase();
      const apiUrl = `https://nirkyy-dev.hf.space/api/v1/tiktokdl?url=${encodeURIComponent(url)}`;
      
      const response = await axios.get(apiUrl);
      const result = response.data;
      
      if (result && result.success && result.data && result.data.downloads) {
        const data = result.data;
        const caption = data.title || 'Video TikTok';
        
        let downloadUrl;
        let errorMessage;
        
        if (usedCommand === 'tthd') {
          const hdVideo = data.downloads.find(d => d.label.includes('HD'));
          if (hdVideo) {
            downloadUrl = hdVideo.url;
          } else {
            errorMessage = 'Gagal menemukan unduhan versi HD untuk video ini.';
          }
        } else {
          const normalVideo = data.downloads.find(d => d.label.includes('MP4') && !d.label.includes('HD'));
          const anyVideo = data.downloads.find(d => d.label.includes('MP4'));
          
          if (normalVideo) {
            downloadUrl = normalVideo.url;
          } else if (anyVideo) {
            downloadUrl = anyVideo.url;
          } else {
            errorMessage = 'Gagal menemukan link unduhan video MP4 dari API.';
          }
        }
        
        if (downloadUrl) {
          await message.media(caption, downloadUrl);
        } else {
          await message.reply(errorMessage);
        }
        
      } else {
        return message.reply(result.message || 'Gagal mendapatkan data video dari URL tersebut. Pastikan URL valid.');
      }
    } catch (e) {
      console.error('Error pada plugin TikTok:', e);
      await message.reply('Terjadi kesalahan saat mencoba mengunduh video. API mungkin sedang down atau URL tidak valid.');
    }
  }
};