const db = require('../../lib/database');
const config = require('../../config');
const gameConfig = require('../../gameConfig');

const houseLevels = [
    { name: "Tanah Kosong", income: 0, cost: { balance: 50000, iron: 20 } },
    { name: "Gubuk Reyot", income: 100, cost: { balance: 200000, iron: 50, bara: 25 } },
    { name: "Rumah Kayu", income: 250, cost: { balance: 500000, iron: 100, baja: 5 } },
    { name: "Rumah Batu", income: 500, cost: { balance: 1500000, baja: 15, emas: 5 } },
    { name: "Villa Mewah", income: 1000, cost: { balance: 5000000, baja: 30, emas: 10, pedanglegendaris: 1 } },
    { name: "Istana Megah", income: 2500, cost: {} } 
];

module.exports = {
    command: ['rumah', 'home'],
    description: 'Melihat, meng-upgrade, dan mengklaim pendapatan dari rumah pribadi.',
    category: 'RPG',
    run: async (sock, message, args) => {
        const action = args[0]?.toLowerCase();
        const userJid = message.sender;
        let usersDb = db.get('users');
        
        if (!usersDb[userJid]) {
            usersDb[userJid] = {};
        }
        
        if (!usersDb[userJid].house) {
            usersDb[userJid].house = { level: 0, lastClaim: Date.now() };
            db.save('users', usersDb);
        }

        const user = usersDb[userJid];
        const currentHouseLevel = user.house.level;
        const currentHouse = houseLevels[currentHouseLevel];

        if (action === 'upgrade') {
            if (currentHouseLevel >= houseLevels.length - 1) {
                return message.reply('🎉 Selamat! Rumah Anda sudah mencapai level maksimal!');
            }

            const nextHouse = houseLevels[currentHouseLevel + 1];
            const cost = houseLevels[currentHouseLevel].cost;
            let missingItems = [];

            if ((user.balance || 0) < cost.balance) missingItems.push(`- Uang: Kurang Rp ${(cost.balance - (user.balance || 0)).toLocaleString()}`);
            for (const item in cost) {
                if (item !== 'balance' && (user[item]?.amount || 0) < cost[item]) {
                    missingItems.push(`- ${item.charAt(0).toUpperCase() + item.slice(1)}: Kurang ${cost[item] - (user[item]?.amount || 0)}`);
                }
            }

            if (missingItems.length > 0) {
                return message.reply(`Bahan tidak cukup untuk upgrade ke *${nextHouse.name}*.\n\n*Kebutuhan:*\n${Object.entries(cost).map(([key, val]) => `- ${key.charAt(0).toUpperCase() + key.slice(1)}: ${val.toLocaleString()}`).join('\n')}\n\n*Kekurangan:*\n${missingItems.join('\n')}`);
            }

            user.balance -= cost.balance;
            for (const item in cost) {
                if (item !== 'balance') user[item].amount -= cost[item];
            }
            
            user.house.level++;
            usersDb[userJid] = user;
            db.save('users', usersDb);

            return message.reply(`✅ Selamat! Rumah Anda berhasil di-upgrade menjadi *${nextHouse.name}*!`);
        }

        if (action === 'klaim') {
            const now = Date.now();
            const hoursPassed = (now - user.house.lastClaim) / (1000 * 60 * 60);
            const incomeToClaim = Math.floor(hoursPassed * currentHouse.income);

            if (incomeToClaim <= 0) {
                return message.reply('Belum ada pendapatan yang bisa diklaim. Coba lagi nanti.');
            }

            user.balance = (user.balance || 0) + incomeToClaim;
            user.house.lastClaim = now;
            usersDb[userJid] = user;
            db.save('users', usersDb);

            return message.reply(`Anda berhasil mengklaim pendapatan sebesar *Rp ${incomeToClaim.toLocaleString()}* dari rumah Anda.`);
        }

        let responseText = `🏡 *Rumah Pribadi Milik ${message.pushName}*\n\n` +
            `*Level:* ${currentHouseLevel}\n` +
            `*Tipe:* ${currentHouse.name}\n` +
            `*Pendapatan Pasif:* Rp ${currentHouse.income.toLocaleString()}/jam\n\n`;
            
        const hoursPassed = (Date.now() - user.house.lastClaim) / (1000 * 60 * 60);
        const pendingIncome = Math.floor(hoursPassed * currentHouse.income);
        
        responseText += `💰 *Pendapatan Belum Diklaim:* Rp ${pendingIncome.toLocaleString()}\n`;
        responseText += `_Gunakan .rumah klaim untuk mengambil._\n\n`;

        if (currentHouseLevel < houseLevels.length - 1) {
            const nextHouseCost = houseLevels[currentHouseLevel].cost;
            responseText += `*Upgrade Selanjutnya: ${houseLevels[currentHouseLevel + 1].name}*\n` +
                `*Biaya:*\n${Object.entries(nextHouseCost).map(([key, val]) => `- ${key.charAt(0).toUpperCase() + key.slice(1)}: ${val.toLocaleString()}`).join('\n')}\n` +
                `_Gunakan .rumah upgrade untuk meningkatkan._`;
        } else {
            responseText += `_Rumah Anda telah mencapai level tertinggi!_`;
        }

        await message.reply(responseText);
    }
};