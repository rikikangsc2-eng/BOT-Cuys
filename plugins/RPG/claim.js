const db = require('../../lib/database');
const gameConfig = require('../../gameConfig');

function formatCooldown(ms) {
    if (ms < 0) ms = 0;
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours} jam ${minutes} menit`;
}

module.exports = {
    command: 'klaim',
    description: 'Mengambil hadiah harian, mingguan, atau bulanan.',
    category: 'RPG',
    run: async (sock, message, args, { handler }) => {
        const type = args[0]?.toLowerCase();
        const claimTypes = gameConfig.rewards.claim;

        if (!type || !claimTypes[type]) {
            return message.reply('Gunakan format: `.klaim <harian|mingguan|bulanan>`');
        }

        const senderJid = message.sender;
        let usersDb = db.get('users');
        let cooldowns = db.get('cooldowns');

        const user = usersDb[senderJid] || { balance: 0, level: 1, xp: 0 };
        const userCooldowns = cooldowns[senderJid] || {};
        
        const lastClaim = userCooldowns[`claim_${type}`] || 0;
        const rewardInfo = claimTypes[type];
        const cooldownInfo = gameConfig.cooldowns.claim[type];
        
        if (Date.now() - lastClaim < cooldownInfo) {
            const timeLeft = cooldownInfo - (Date.now() - lastClaim);
            return message.reply(`Anda sudah mengklaim hadiah ${type} ini. Tunggu *${formatCooldown(timeLeft)}* lagi.`);
        }

        user.xp = (user.xp || 0) + rewardInfo.xp;
        user.balance = (user.balance || 0) + rewardInfo.balance;

        let rewardText = `🎉 *Hadiah ${type.charAt(0).toUpperCase() + type.slice(1)} Diklaim!* 🎉\n\n`;
        rewardText += `+ *${rewardInfo.xp} XP*\n`;
        rewardText += `+ *Rp ${rewardInfo.balance.toLocaleString()}*\n`;

        if (rewardInfo.items) {
            for (const item in rewardInfo.items) {
                const amount = rewardInfo.items[item];
                if (typeof user[item] !== 'object' || user[item] === null) user[item] = { amount: 0 };
                user[item].amount = (user[item].amount || 0) + amount;
                rewardText += `+ *${amount} ${item.charAt(0).toUpperCase() + item.slice(1)}*\n`;
            }
        }
        
        if (!cooldowns[senderJid]) cooldowns[senderJid] = {};
        cooldowns[senderJid][`claim_${type}`] = Date.now();
        
        await handler.checkLevelUp(sock, message, user);
        
        usersDb[senderJid] = user;
        db.save('users', usersDb);
        db.save('cooldowns', cooldowns);

        await message.reply(rewardText);
    }
};