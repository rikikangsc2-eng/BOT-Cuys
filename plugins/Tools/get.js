const axios = require('axios');

module.exports = {
  command: 'get',
  description: 'Melakukan request GET ke URL dan menampilkan respon (media atau JSON).',
  run: async (sock, message, args) => {
    const url = args[0];
    if (!url) {
      return message.reply('Gunakan format: *.get <URL>*\nContoh: .get https://example.com/api/data');
    }
    try {
      const response = await axios.get(url, { responseType: 'arraybuffer' });
      const contentType = response.headers['content-type'] || '';
      const buffer = Buffer.from(response.data);

      if (contentType.startsWith('image/') || contentType.startsWith('video/') || contentType.startsWith('audio/')) {
        const mediaType = contentType.startsWith('image/') ? 'image' :
                          contentType.startsWith('video/') ? 'video' : 'audio';
        return sock.sendMessage(message.from, { [mediaType]: buffer }, { quoted: message });
      }
      // Assume text or JSON
      const textData = buffer.toString('utf-8');
      try {
        const jsonData = JSON.parse(textData);
        const prettyJson = JSON.stringify(jsonData, null, 2);
        return message.reply(`📄 *Response JSON:*\n\n${prettyJson}`);
      } catch {
        return message.reply(`📄 *Response Text:*\n\n${textData}`);
      }
    } catch (e) {
      return message.reply(`Gagal mengambil data dari URL.\nError: ${e.message}`);
    }
  }
};

