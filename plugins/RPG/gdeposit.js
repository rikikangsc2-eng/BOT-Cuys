const db = require('../../lib/database');

const getPlayerGuild = (playerJid) => {
    const guilds = db.get('guilds') || {};
    return Object.values(guilds).find(g => g.members[playerJid]);
};

module.exports = {
    command: ['gdeposit', 'gdep'],
    description: 'Menyetor uang ke bank guild.',
    category: 'RPG',
    run: async (sock, message, args) => {
        const amount = parseInt(args[0]);
        const senderJid = message.sender;

        if (isNaN(amount) || amount <= 0) {
            return message.reply('Masukkan jumlah yang valid untuk disetor.');
        }

        let usersDb = db.get('users');
        const user = usersDb[senderJid] || { balance: 0 };
        const userGuild = getPlayerGuild(senderJid);

        if (!userGuild) {
            return message.reply('Anda tidak berada di guild manapun.');
        }

        if (user.balance < amount) {
            return message.reply(`Saldo Anda tidak cukup. Saldo: Rp ${user.balance.toLocaleString()}`);
        }

        user.balance -= amount;
        userGuild.bank = (userGuild.bank || 0) + amount;
        userGuild.xp = (userGuild.xp || 0) + Math.floor(amount / 1000); 

        let guildsDb = db.get('guilds');
        guildsDb[userGuild.id] = userGuild;

        db.save('users', usersDb);
        db.save('guilds', guildsDb);

        const responseText = `✅ Anda berhasil menyetor *Rp ${amount.toLocaleString()}* ke bank guild *${userGuild.name}*.\n\n` +
            `Guild mendapatkan *${Math.floor(amount / 1000)} XP*.\n` +
            `Saldo Bank Guild saat ini: *Rp ${userGuild.bank.toLocaleString()}*`;
        
        await message.reply(responseText);
    }
};