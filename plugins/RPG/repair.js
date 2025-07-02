const db = require('../../lib/database');
const gameConfig = require('../../gameConfig');
const { getRepairCost } = require('../../lib/rpgUtils');

const itemNames = {
    pedanglegendaris: "Pedang Legendaris",
    bajuzirahbaja: "Baju Zirah Baja",
    perisaiiron: "Perisai Iron"
};

function formatCooldown(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes} menit ${seconds} detik`;
}

module.exports = {
    command: ['repair', 'perbaiki'],
    description: 'Memperbaiki peralatan yang rusak.',
    category: 'RPG',
    run: async (sock, message, args) => {
        const senderJid = message.sender;
        const itemKey = args[0]?.toLowerCase();

        if (!itemKey || !itemNames[itemKey]) {
            let repairList = 'Gunakan format `.repair <nama_item>`\n\n*Item yang bisa diperbaiki:*\n';
            for (const key in itemNames) {
                repairList += `- ${key}\n`;
            }
            return message.reply(repairList);
        }
        
        let cooldowns = db.get('cooldowns');
        const userCooldown = cooldowns[senderJid]?.repair || 0;
        const cooldownTime = gameConfig.cooldowns.repair;

        if (Date.now() - userCooldown < cooldownTime) {
            const timeLeft = cooldownTime - (Date.now() - userCooldown);
            return message.reply(`Pandai besi sedang istirahat. Tunggu *${formatCooldown(timeLeft)}* lagi.`);
        }

        let usersDb = db.get('users');
        const user = usersDb[senderJid];
        if (!user || !user[itemKey]) {
            return message.reply(`Anda tidak memiliki *${itemNames[itemKey]}*.`);
        }

        const maxDurability = gameConfig.durability.max[itemKey] || 100;
        if (user[itemKey].durability >= maxDurability) {
            return message.reply(`*${itemNames[itemKey]}* Anda dalam kondisi sempurna.`);
        }

        const cost = getRepairCost(itemKey);
        if (!cost) {
            return message.reply(`Item ini tidak dapat diperbaiki.`);
        }

        let missingItems = [];
        if ((user.balance || 0) < cost.balance) {
            missingItems.push(`- Uang: Kurang Rp ${(cost.balance - (user.balance || 0)).toLocaleString()}`);
        }
        for (const material in cost) {
            if (material !== 'balance' && (user[material]?.amount || 0) < cost[material]) {
                missingItems.push(`- ${material}: Kurang ${cost[material] - (user[material]?.amount || 0)}`);
            }
        }
        
        if (missingItems.length > 0) {
            let costText = `*Biaya Perbaikan ${itemNames[itemKey]}:*\n`;
            for (const key in cost) {
                costText += `- ${key.charAt(0).toUpperCase() + key.slice(1)}: ${cost[key].toLocaleString()}\n`;
            }
            return message.reply(`Bahan tidak cukup untuk perbaikan.\n\n${costText}\n*Kekurangan Anda:*\n${missingItems.join('\n')}`);
        }

        user.balance -= cost.balance;
        for (const material in cost) {
            if (material !== 'balance') user[material].amount -= cost[material];
        }

        user[itemKey].durability = maxDurability;
        
        if (!cooldowns[senderJid]) cooldowns[senderJid] = {};
        cooldowns[senderJid].repair = Date.now();

        usersDb[senderJid] = user;
        db.save('users', usersDb);
        db.save('cooldowns', cooldowns);
        
        return message.reply(`✅ *${itemNames[itemKey]}* berhasil diperbaiki ke kondisi semula!`);
    }
};