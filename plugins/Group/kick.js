module.exports = {
  command: 'kick',
  description: 'Mengeluarkan anggota dari grup.',
  run: async (sock, message, args) => {
    if (!message.isGroup) return message.reply('Perintah ini hanya bisa digunakan di dalam grup.');
    
    const groupMeta = await sock.groupMetadata(message.from);
    const sender = groupMeta.participants.find(p => p.id === message.sender);
    const bot = groupMeta.participants.find(p => p.id === sock.user.id.split(':')[0] + '@s.whatsapp.net');
    
    const isAdmin = sender && (sender.admin === 'admin' || sender.admin === 'superadmin');
    const isBotAdmin = bot && (bot.admin === 'admin' || bot.admin === 'superadmin');
    
    if (!isAdmin) return message.reply('Hanya admin grup yang bisa menggunakan perintah ini.');
    if (!isBotAdmin) return message.reply('Jadikan bot sebagai admin terlebih dahulu untuk menggunakan perintah ini.');
    
    const mentionedJids = message.msg?.contextInfo?.mentionedJid || [];
    const quotedUser = message.msg?.contextInfo?.quotedMessage ? message.msg.contextInfo.participant : null;
    
    const usersToKick = [...mentionedJids];
    if (quotedUser && !usersToKick.includes(quotedUser)) {
      usersToKick.push(quotedUser);
    }
    
    if (usersToKick.length === 0) return message.reply('Gunakan format: *.kick <@tag>* atau reply pesan pengguna yang ingin dikeluarkan.');
    
    try {
      await sock.groupParticipantsUpdate(message.from, usersToKick, 'remove');
      message.reply('Berhasil mengeluarkan anggota.');
    } catch (e) {
      console.error(e);
      message.reply('Gagal mengeluarkan anggota. Mungkin mereka adalah admin atau pemilik grup.');
    }
  }
};