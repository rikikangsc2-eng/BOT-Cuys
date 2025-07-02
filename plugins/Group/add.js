module.exports = {
  command: 'add',
  description: 'Menambahkan anggota ke grup.',
  run: async (sock, message, args) => {
    if (!message.isGroup) return message.reply('Perintah ini hanya bisa digunakan di dalam grup.');
    
    const groupMeta = await sock.groupMetadata(message.from);
    const sender = groupMeta.participants.find(p => p.id === message.sender);
    const bot = groupMeta.participants.find(p => p.id === sock.user.id.split(':')[0] + '@s.whatsapp.net');
    
    const isAdmin = sender && (sender.admin === 'admin' || sender.admin === 'superadmin');
    const isBotAdmin = bot && (bot.admin === 'admin' || bot.admin === 'superadmin');
    
    if (!isAdmin) return message.reply('Hanya admin grup yang bisa menggunakan perintah ini.');
    if (!isBotAdmin) return message.reply('Jadikan bot sebagai admin terlebih dahulu untuk menggunakan perintah ini.');
    
    const number = args[0]?.replace(/[^0-9]/g, '');
    if (!number) return message.reply('Gunakan format: *.add <nomor>*\nContoh: .add 6281234567890');
    
    const jid = `${number}@s.whatsapp.net`;
    
    try {
      await sock.groupParticipantsUpdate(message.from, [jid], 'add');
      message.reply(`Berhasil menambahkan @${number} ke grup.`, [jid]);
    } catch (e) {
      console.error(e);
      message.reply('Gagal menambahkan anggota. Mungkin nomor tidak valid, privat, atau sudah ada di dalam grup.');
    }
  }
};