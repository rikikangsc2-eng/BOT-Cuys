const axios = require('axios');
const db = require('../../lib/database');

module.exports = {
  command: 'susunkata',
  description: 'Bermain game susun kata.',
  run: async (sock, message, args, { activeGames }) => {
    if (!message.isGroup) {
      return message.reply('Game hanya bisa dimainkan di dalam grup.');
    }
    if (activeGames.has(message.from)) {
      return message.reply('Masih ada sesi permainan yang aktif di grup ini.');
    }
    
    try {
      const response = await axios.get('https://github.com/BochilTeam/database/raw/main/games/susunkata.json');
      const data = response.data;
      const soalData = data[Math.floor(Math.random() * data.length)];
      const hadiah = Math.floor(Math.random() * (5000 - 1000 + 1)) + 1000;
      
      const questionText = `🧩 *Game Susun Kata* 🧩\n\nSusun kata berikut:\n*${soalData.soal}*\n\n*Tipe:* ${soalData.tipe}\n*Hadiah:* Rp ${hadiah.toLocaleString()}\n*Waktu:* 60 detik\n\nLangsung ketik jawabanmu di chat ini!`;
      
      message.reply(questionText);
      
      const timeout = setTimeout(() => {
        if (activeGames.has(message.from)) {
          message.reply(`Waktu habis! Jawaban yang benar adalah *${soalData.jawaban}*`);
          activeGames.delete(message.from);
        }
      }, 60000);
      
      activeGames.set(message.from, {
        jawaban: soalData.jawaban,
        hadiah,
        timeout
      });
      
    } catch (error) {
      console.error('Error saat mengambil soal susun kata:', error);
      message.reply('Gagal memulai permainan. Terjadi kesalahan saat mengambil soal.');
    }
  }
};