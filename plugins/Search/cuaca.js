const axios = require('axios');
const config = require('../../config');
const { getBuffer } = require('../../lib/functions');

module.exports = {
  command: ['cuaca', 'weather'],
  description: 'Mendapatkan informasi cuaca terkini untuk lokasi tertentu.',
  category: 'Tools',
  run: async (sock, message, args) => {
    if (!args.length) {
      return message.reply('Gunakan format: *.cuaca <nama_lokasi>*\nContoh: .cuaca Jakarta');
    }

    const location = args.join(' ');
    const jsonApiUrl = `https://wttr.in/${encodeURIComponent(location)}?format=j1`;
    const imageUrl = `https://wttr.in/${encodeURIComponent(location)}.png?m&lang=id`;

    try {
      await message.reply(`🌤️ Mencari informasi cuaca untuk *${location}*...`);

      const [response, imageBuffer] = await Promise.all([
          axios.get(jsonApiUrl),
          getBuffer(imageUrl)
      ]);
      
      const data = response.data;

      if (!data.current_condition || !data.weather) {
          throw new Error('Data cuaca tidak lengkap dari API.');
      }
      
      const current = data.current_condition[0];
      const today = data.weather[0];
      const area = data.nearest_area[0];
      const chanceOfRain = Math.max(...today.hourly.map(h => parseInt(h.chanceofrain, 10)));

      const weatherIcons = {
          "113": "☀️", "116": "🌤️", "119": "☁️", "122": "🌥️", "143": "🌫️",
          "176": "🌦️", "200": "⛈️", "227": "🌨️", "230": "❄️", "248": "🌫️",
          "260": "🌫️", "263": "🌦️", "266": "🌧️", "281": "🌧️", "284": "🌧️",
          "293": "🌧️", "296": "🌧️", "299": "🌧️", "302": "🌧️", "305": "🌧️",
          "308": "🌧️", "311": "🌧️", "314": "🌧️", "323": "🌨️", "326": "🌨️",
          "329": "🌨️", "332": "🌨️", "335": "🌨️", "338": "❄️", "350": "🌨️",
          "353": "🌦️", "356": "🌦️", "359": "🌧️", "368": "🌨️", "371": "❄️",
          "386": "⛈️", "389": "⛈️", "392": "🌨️", "395": "❄️",
      };

      const icon = weatherIcons[current.weatherCode] || '🌍';

      const weatherText = `*Laporan Cuaca untuk ${area.areaName[0].value}*\n\n` +
                          `${icon} *Saat ini:* ${current.weatherDesc[0].value}\n` +
                          `🌡️ *Suhu:* ${current.temp_C}°C (Terasa ${current.FeelsLikeC}°C)\n` +
                          `💧 *Kelembaban:* ${current.humidity}%\n` +
                          `💨 *Angin:* ${current.windspeedKmph} km/j\n` +
                          `☔️ *Peluang Hujan:* ${chanceOfRain}%\n\n` +
                          `*Prakiraan Hari Ini:*\n` +
                          `🔼 *Tertinggi:* ${today.maxtempC}°C\n` +
                          `🔽 *Terendah:* ${today.mintempC}°C`;

      const messageOptions = {
          text: weatherText,
          contextInfo: {
              externalAdReply: {
                  title: `Cuaca - ${location.charAt(0).toUpperCase() + location.slice(1)}`,
                  body: `${current.weatherDesc[0].value}, ${current.temp_C}°C`,
                  thumbnail: imageBuffer,
                  sourceUrl: `https://wttr.in/${encodeURIComponent(location)}`,
                  mediaType: 1,
              }
          }
      };
      
      await sock.sendMessage(message.from, messageOptions, { quoted: message });

    } catch (error) {
      console.error('Error pada plugin cuaca:', error);
      if (error.response && error.response.status === 404) {
          await message.reply(`Maaf, lokasi "*${location}*" tidak ditemukan. Coba gunakan nama kota yang lebih spesifik.`);
      } else {
          await message.reply('Gagal mendapatkan informasi cuaca. API mungkin sedang tidak aktif atau terjadi kesalahan.');
      }
    }
  }
};