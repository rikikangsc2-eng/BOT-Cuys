const fs = require('fs');
const path = require('path');
const config = require('../../config');

module.exports = {
  command: 'self',
  description: 'Mengubah bot ke mode pribadi (hanya owner).',
  run: async (sock, message, args) => {
    const ownerJid = `${config.ownerNumber}@s.whatsapp.net`;
    const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    
    if (message.sender !== ownerJid && message.sender !== botJid) {
      return message.reply('Perintah ini hanya untuk Owner.');
    }
    
    config.isPublic = false;
    const configPath = path.join(__dirname, '../../config.js');
    const fileContent = `module.exports = ${JSON.stringify(config, null, 4)};`;
    fs.writeFileSync(configPath, fileContent);
    
    await message.reply('Mode bot telah diubah ke *Self/Pribadi*.');
  }
};