const db = require('../../lib/database');

module.exports = {
  command: 'afk',
  description: 'Mengatur status AFK (Away From Keyboard).',
  run: async (sock, message, args) => {
    const userJid = message.sender;
    const reason = args.join(' ') || 'Tanpa alasan';
    const time = Date.now();
    
    let afkData = db.get('afk');
    afkData[userJid] = { reason, time };
    db.save('afk', afkData);
    
    const afkMessage = `✅ *Anda sekarang AFK*\n\n*Alasan:* ${reason}`;
    await message.reply(afkMessage);
  }
};