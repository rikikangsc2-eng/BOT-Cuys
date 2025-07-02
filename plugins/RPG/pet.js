const db = require('../../lib/database');
const gameConfig = require('../../gameConfig');

const PET_HUNGER_DURATION = 24 * 60 * 60 * 1000;

module.exports = {
    command: 'pet',
    description: 'Mengelola hewan peliharaan Anda.',
    category: 'RPG',
    run: async (sock, message, args) => {
        const action = args[0]?.toLowerCase();
        const senderJid = message.sender;

        let usersDb = db.get('users');
        const user = usersDb[senderJid] || {};
        
        switch(action) {
            case 'shop':
            case 'toko':
                let shopText = '🐾 *Toko Hewan Peliharaan*\n\n';
                for (const petKey in gameConfig.petShop) {
                    const pet = gameConfig.petShop[petKey];
                    shopText += `*${pet.name}*\n`;
                    shopText += `  - Harga: Rp ${pet.price.toLocaleString()}\n`;
                    shopText += `  - Deskripsi: ${pet.description}\n`;
                    shopText += `  _Gunakan .pet beli ${petKey}_\n\n`;
                }
                return message.reply(shopText);

            case 'beli':
            case 'buy':
                const petKeyToBuy = args[1];
                if (!petKeyToBuy) {
                    return message.reply("Sebutkan nama hewan yang ingin dibeli. Contoh: .pet beli kucingOren");
                }

                const correctPetKey = Object.keys(gameConfig.petShop).find(key => key.toLowerCase() === petKeyToBuy.toLowerCase());
                const petToBuy = correctPetKey ? gameConfig.petShop[correctPetKey] : null;

                if (!petToBuy) return message.reply('Hewan peliharaan tidak ditemukan di toko. Pastikan penulisan namanya benar (misal: kucingOren).');
                if (user.pet) return message.reply(`Anda sudah memiliki *${user.pet.name}*. Lepaskan dulu jika ingin membeli yang baru dengan perintah \`.pet lepas\`.`);
                if ((user.balance || 0) < petToBuy.price) return message.reply(`Uang Anda tidak cukup untuk membeli *${petToBuy.name}*.`);

                user.balance -= petToBuy.price;
                user.pet = {
                    key: correctPetKey,
                    name: petToBuy.name,
                    lastFed: Date.now()
                };
                usersDb[senderJid] = user;
                db.save('users', usersDb);
                return message.reply(`Selamat! Anda telah membeli *${petToBuy.name}*! Jangan lupa memberinya makan.`);

            case 'makan':
            case 'feed':
                if (!user.pet) return message.reply('Anda tidak memiliki hewan peliharaan.');
                
                const foodNeeded = gameConfig.petShop[user.pet.key].food;
                if ((user[foodNeeded]?.amount || 0) < 1) {
                    return message.reply(`Anda tidak punya makanan untuknya! Dia butuh *${foodNeeded}*.`);
                }

                user[foodNeeded].amount -= 1;
                user.pet.lastFed = Date.now();
                usersDb[senderJid] = user;
                db.save('users', usersDb);
                return message.reply(`Anda memberi makan *${user.pet.name}*. Dia terlihat senang!`);

            case 'lepas':
            case 'release':
                if (!user.pet) {
                    return message.reply('Anda tidak memiliki hewan peliharaan untuk dilepaskan.');
                }
                const petName = user.pet.name;
                delete user.pet;
                usersDb[senderJid] = user;
                db.save('users', usersDb);
                return message.reply(`Anda telah melepaskan *${petName}* ke alam liar. Anda sekarang bebas untuk memiliki hewan peliharaan baru.`);

            default:
                if (!user.pet) {
                    return message.reply('Anda belum memiliki hewan peliharaan. Kunjungi `.pet shop` untuk membeli.');
                }
                
                const timeLeft = (user.pet.lastFed + PET_HUNGER_DURATION) - Date.now();
                const isHungry = timeLeft <= 0;
                
                let infoText = `🐾 *Info Peliharaan Anda*\n\n`;
                infoText += `*Nama:* ${user.pet.name}\n`;
                if(isHungry) {
                    infoText += `*Status:* 😫 Lapar (Efek tidak aktif)\n`;
                } else {
                    const hours = Math.floor(timeLeft / 3600000);
                    const minutes = Math.floor((timeLeft % 3600000) / 60000);
                    infoText += `*Status:* 😊 Kenyang (Sisa waktu: ${hours}j ${minutes}m)\n`;
                    infoText += `*Efek Aktif:* ${gameConfig.petShop[user.pet.key].description}\n`;
                }
                infoText += `\n*Perintah Tersedia:*\n`;
                infoText += `• \`.pet makan\`: Memberi makan peliharaan.\n`;
                infoText += `• \`.pet lepas\`: Melepaskan peliharaan Anda saat ini.\n`;
                infoText += `• \`.pet shop\`: Melihat toko peliharaan.`;
                return message.reply(infoText);
        }
    }
};