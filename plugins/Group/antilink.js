const db = require('../../lib/database');

module.exports = {
  command: 'antilink',
  description: 'Mengaktifkan atau menonaktifkan fitur anti link WhatsApp.',
  run: async (sock, message, args) => {
    if (!message.isGroup) return message.reply('Perintah ini hanya bisa digunakan di dalam grup.');
    
    const groupMeta = await sock.groupMetadata(message.from);
    const sender = groupMeta.participants.find(p => p.id === message.sender);
    const isAdmin = sender && (sender.admin === 'admin' || sender.admin === 'superadmin');
    
    if (!isAdmin) return message.reply('Hanya admin grup yang bisa menggunakan perintah ini.');
    
    const option = args[0]?.toLowerCase();
    if (option !== 'on' && option !== 'off') {
      return message.reply('Gunakan format: *.antilink on* atau *.antilink off*');
    }
    
    const settings = db.get('groupSettings');
    if (!settings[message.from]) {
      settings[message.from] = {};
    }
    
    settings[message.from].isAntilinkEnabled = (option === 'on');
    db.save('groupSettings', settings);
    
    await message.reply(`Fitur anti link WhatsApp telah *${option === 'on' ? 'diaktifkan' : 'dinonaktifkan'}* untuk grup ini.`);
  }
};