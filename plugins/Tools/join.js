const config = require('../../config');
const db = require('../../lib/database');

module.exports = {
  command: 'join',
  description: 'Membuat bot bergabung ke grup melalui link.',
  run: async (sock, message, args) => {
    if (!args[0]) {
      return message.reply(`Gunakan format: *.join <link grup>*\n\nBiaya untuk bergabung adalah *Rp ${config.joinPrice.toLocaleString()}*`);
    }
    
    const usersDb = db.get('users');
    const user = usersDb[message.sender] || { balance: 0 };
    
    if (user.balance < config.joinPrice) {
      return message.reply(`Saldo Anda tidak mencukupi untuk menggunakan fitur ini.\n\n*Saldo Anda:* Rp ${user.balance.toLocaleString()}\n*Biaya Join:* Rp ${config.joinPrice.toLocaleString()}`);
    }
    
    const linkRegex = /chat\.whatsapp\.com\/([0-9A-Za-z]{22})/;
    const match = args[0].match(linkRegex);
    
    if (!match) {
      return message.reply('Link grup yang Anda berikan tidak valid.');
    }
    
    const inviteCode = match[1];
    
    try {
      await message.reply('Mencoba untuk bergabung ke grup...');
      await sock.groupAcceptInvite(inviteCode);
      
      user.balance -= config.joinPrice;
      usersDb[message.sender] = user;
      db.save('users', usersDb);
      
      await message.reply(`Berhasil bergabung ke grup! Saldo Anda telah dipotong sebesar Rp ${config.joinPrice.toLocaleString()}.`);
    } catch (e) {
      console.error('Error pada plugin join:', e);
      await message.reply('Gagal bergabung. Mungkin link tidak valid, grup penuh, atau saya sudah dikeluarkan dari grup tersebut.');
    }
  }
};