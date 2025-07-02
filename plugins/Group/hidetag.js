module.exports = {
  command: ['h', 'hidetag'],
  description: 'Memberi tahu semua anggota grup secara tersembunyi (hanya admin).',
  run: async (sock, message, args) => {
    if (!message.isGroup) {
      return message.reply('Perintah ini hanya bisa digunakan di dalam grup.');
    }
    
    const groupMeta = await sock.groupMetadata(message.from);
    const sender = groupMeta.participants.find(p => p.id === message.sender);
    const isAdmin = sender && (sender.admin === 'admin' || sender.admin === 'superadmin');
    
    if (!isAdmin) {
      return message.reply('Hanya admin grup yang bisa menggunakan perintah ini.');
    }
    
    if (args.length === 0) {
      return message.reply('Gunakan format: *.hidetag <teks pengumuman>*');
    }
    
    const participants = groupMeta.participants.map(p => p.id);
    const text = args.join(' ');
    
    try {
      await sock.sendMessage(message.from, { text: text, mentions: participants });
    } catch (e) {
      console.error('Error pada plugin hidetag:', e);
      await message.reply('Gagal mengirim hidetag.');
    }
  }
};