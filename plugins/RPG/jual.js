const db = require('../../lib/database');
const config = require('../../config');

const sellPrices = {
    daging: 500,
    ikan: 300,
    tikus: 100,
    baja: 15000,
    emas: 1000,
    iron: 200,
    bara: 100,
};

module.exports = {
    command: 'jual',
    description: 'Menjual item dari inventaris untuk mendapatkan uang.',
    category: 'RPG',
    run: async (sock, message, args, { activeEvents, isNpcCall = false, npcData = {} }) => {
        let priceModifier = 1;
        let eventMessage = "";
        if (activeEvents?.dullMarket) {
            priceModifier = activeEvents.dullMarket.priceModifier;
            eventMessage = `\n\n*Event ${activeEvents.dullMarket.name} sedang berlangsung, semua harga jual turun!*`;
        }
        
        const senderJid = message.sender;
        let usersDb = db.get('users');
        const user = usersDb[senderJid];

        if (isNpcCall) {
            const itemToSell = npcData.item;
            const amountToSell = npcData.amount;
            if (!sellPrices[itemToSell]) {
                return { success: false, message: `Maaf, saya tidak menerima *"${itemToSell}"*.` };
            }
            if (!user || (user[itemToSell]?.amount || 0) < amountToSell) {
                return { success: false, message: `Sepertinya kamu tidak punya cukup *${itemToSell}* untuk dijual.` };
            }
            
            const pricePerUnit = Math.floor(sellPrices[itemToSell] * priceModifier);
            const totalEarnings = pricePerUnit * amountToSell;

            user[itemToSell].amount -= amountToSell;
            if (user[itemToSell].amount <= 0) delete user[itemToSell];
            user.balance = (user.balance || 0) + totalEarnings;

            usersDb[senderJid] = user;
            db.save('users', usersDb);

            return { success: true, message: `Saya beli *${amountToSell} ${itemToSell}* milikmu seharga *Rp ${totalEarnings.toLocaleString()}*.` };
        }

        const itemToSell = args[0]?.toLowerCase();
        const amountToSell = parseInt(args[1]);

        if (!itemToSell) {
            let priceList = '📦 *Daftar Jual Item*\n\n';
            priceList += 'Gunakan format: *.jual <item> <jumlah>*\n\n';
            for (const item in sellPrices) {
                const currentPrice = Math.floor(sellPrices[item] * priceModifier);
                priceList += `• *${item.charAt(0).toUpperCase() + item.slice(1)}:* Rp ${currentPrice.toLocaleString()} / unit\n`;
            }
            priceList += eventMessage;
            return message.reply(priceList);
        }

        if (!sellPrices[itemToSell]) {
            return message.reply(`Item *"${itemToSell}"* tidak dapat dijual di sini. Coba \`.trading\` untuk aset lain.`);
        }

        if (isNaN(amountToSell) || amountToSell <= 0) {
            return message.reply('Masukkan jumlah yang valid untuk dijual.');
        }

        if (!user || (user[itemToSell]?.amount || 0) < amountToSell) {
            return message.reply(`Anda tidak memiliki cukup *${itemToSell}* untuk dijual. Anda hanya punya ${user[itemToSell]?.amount || 0} unit.`);
        }
        
        const pricePerUnit = Math.floor(sellPrices[itemToSell] * priceModifier);
        const totalEarnings = pricePerUnit * amountToSell;

        user[itemToSell].amount -= amountToSell;
        if (user[itemToSell].amount <= 0) delete user[itemToSell];
        user.balance = (user.balance || 0) + totalEarnings;

        usersDb[senderJid] = user;
        db.save('users', usersDb);

        const successMessage = `✅ *Penjualan Berhasil*\n\n` +
            `Anda telah menjual *${amountToSell} ${itemToSell}* seharga *Rp ${totalEarnings.toLocaleString()}*.\n\n` +
            `*Saldo Baru:* Rp ${user.balance.toLocaleString()}` + eventMessage;
            
        await message.reply(successMessage);
    }
};