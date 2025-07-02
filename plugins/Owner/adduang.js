const config = require('../../config');
const db = require('../../lib/database');

module.exports = {
  command: 'adduang',
  description: 'Menambahkan saldo ke pengguna (Owner only).',
  run: async (sock, message, args) => {
    const ownerJid = `${config.ownerNumber}@s.whatsapp.net`;
    if (message.sender !== ownerJid) {
      return message.reply('Perintah ini hanya untuk Owner.');
    }
    
    if (args.length < 2) {
      return message.reply('Gunakan format: *.adduang <nomor> <jumlah>*\nContoh: .adduang 6281234567890 10000');
    }
    
    const number = args[0].replace(/[^0-9]/g, '');
    const amount = parseInt(args[1]);
    
    if (!number || isNaN(amount) || amount <= 0) {
      return message.reply('Format input tidak valid. Pastikan nomor dan jumlah benar.');
    }
    
    const targetJid = `${number}@s.whatsapp.net`;
    let usersDb = db.get('users');
    
    if (!usersDb[targetJid]) {
      usersDb[targetJid] = { balance: 0, name: number };
    }
    
    usersDb[targetJid].balance += amount;
    db.save('users', usersDb);
    
    const response = `✅ *Transaksi Berhasil*\n\n*Jumlah:* Rp ${amount.toLocaleString()}\n*Untuk:* @${number}\n*Saldo Baru:* Rp ${usersDb[targetJid].balance.toLocaleString()}`;
    
    await sock.sendMessage(message.from, { text: response, mentions: [targetJid] });
  }
};