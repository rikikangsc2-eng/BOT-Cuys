const db = require('../../lib/database');

module.exports = {
  command: 'setwelcome',
  description: 'Mengatur teks pesan selamat datang.',
  run: async (sock, message, args) => {
    if (!message.isGroup) return message.reply('Perintah ini hanya bisa digunakan di dalam grup.');
    
    const groupMeta = await sock.groupMetadata(message.from);
    const sender = groupMeta.participants.find(p => p.id === message.sender);
    const isAdmin = sender && (sender.admin === 'admin' || sender.admin === 'superadmin');
    
    if (!isAdmin) return message.reply('Hanya admin grup yang bisa menggunakan perintah ini.');
    
    const newText = args.join(' ');
    if (!newText) {
      return message.reply('Gunakan format: *.setwelcome <teks>*\nContoh: .setwelcome Halo @user, selamat datang di $group!');
    }
    
    const settings = db.get('groupSettings');
    if (!settings[message.from]) {
      settings[message.from] = { isWelcomeEnabled: false };
    }
    
    settings[message.from].welcomeMessage = newText;
    db.save('groupSettings', settings);
    
    await message.reply(`Pesan selamat datang berhasil diatur.`);
  }
};