const axios = require('axios');

module.exports = {
    command: ['ttsearch', 'tiktoksearch'],
    description: 'Mencari dan mengunduh video TikTok teratas berdasarkan kata kunci.',
    category: 'Search',
    run: async (sock, message, args) => {
        if (!args.length) {
            return message.reply('Gunakan format: *.ttsearch <kata kunci>*\nContoh: .ttsearch video lucu');
        }

        const query = args.join(' ');
        const apiUrl = `https://nirkyy-dev.hf.space/api/v1/tiktok-search?query=${encodeURIComponent(query)}`;

        try {
            await message.reply(`🔎 Mencari & mengunduh video TikTok untuk "*${query}*"...`);
            const response = await axios.get(apiUrl);
            const result = response.data;

            if (!result.success || !result.data || !result.data.status || !result.data.data) {
                return message.reply(`Tidak ada video yang ditemukan untuk "*${query}*". API mungkin mengembalikan hasil kosong.`);
            }

            const videoData = result.data.data;
            const caption = videoData.title || 'Video TikTok';
            const videoUrl = videoData.video;

            if (!videoUrl) {
                return message.reply('Video ditemukan, tetapi tidak ada link unduhan yang tersedia.');
            }
            
            await message.media(caption, videoUrl);

        } catch (error) {
            console.error('Error pada plugin ttsearch:', error);
            await message.reply('Gagal mendapatkan data video. API mungkin sedang tidak aktif atau terjadi kesalahan.');
        }
    }
};