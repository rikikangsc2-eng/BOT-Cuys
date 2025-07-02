const db = require('../../lib/database');
const gameConfig = require('../../gameConfig');

const LEVEL_DIFFERENCE_LIMIT = 10;
const FAILURE_PENALTY_RATE = 0.05;

function formatCooldown(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes} menit ${seconds} detik`;
}

module.exports = {
    command: 'rampok',
    description: 'Mencoba merampok saldo pengguna lain.',
    run: async (sock, message, args, { handler }) => {
        const cooldownTime = gameConfig.cooldowns.rampok;
        let cooldowns = db.get('cooldowns');
        let usersDb = db.get('users');
        
        const robberUser = usersDb[message.sender] || { balance: 0, level: 1 };
        const userCooldown = cooldowns[message.sender]?.rampok || 0;

        if (Date.now() - userCooldown < cooldownTime) {
            const timeLeft = cooldownTime - (Date.now() - userCooldown);
            return message.reply(`Anda baru saja merampok. Tunggu *${formatCooldown(timeLeft)}* lagi.`);
        }

        const mentionedJid = message.msg?.contextInfo?.mentionedJid?.[0];
        const targetJid = mentionedJid || message.msg?.contextInfo?.participant;
        if (!targetJid || targetJid === message.sender) return message.reply('Gunakan format: *.rampok @target* atau reply pesan target.');
        
        const robberLevel = robberUser.level || 1;
        if (robberLevel < gameConfig.requirements.rampokLevel) {
             return message.reply(`Anda harus mencapai *Level ${gameConfig.requirements.rampokLevel}* untuk bisa merampok.`);
        }
        
        const targetUser = usersDb[targetJid] || { balance: 0, level: 1 };
        const targetLevel = targetUser.level || 1;
        
        if (Math.abs(robberLevel - targetLevel) > LEVEL_DIFFERENCE_LIMIT) {
            return message.reply(`Target terlalu kuat atau terlalu lemah! Perbedaan level terlalu jauh (Maksimal ${LEVEL_DIFFERENCE_LIMIT} level).`);
        }
        
        if (targetUser.balance < 5000) return message.reply(`Dia miskin anjr, jangan dirampok.`);
        
        if ((targetUser.jimatAntiRampok || 0) > 0) {
            targetUser.jimatAntiRampok -= 1;
            usersDb[targetJid] = targetUser;
            db.save('users', usersDb);
            return message.reply(`Gagal merampok! @${targetJid.split('@')[0]} dilindungi oleh kekuatan jimat misterius!`, [targetJid]);
        }
        
        if (!cooldowns[message.sender]) cooldowns[message.sender] = {};
        cooldowns[message.sender].rampok = Date.now();
        db.save('cooldowns', cooldowns);

        let petBonus = 0;
        const robberPet = robberUser.pet;
        if (robberPet && (robberPet.lastFed + (24 * 60 * 60 * 1000)) > Date.now()) {
            const petEffect = gameConfig.petEffects[robberPet.key];
            if (petEffect && petEffect.type === 'rampok_success_chance') {
                petBonus = petEffect.value;
            }
        }

        const levelDifference = robberLevel - targetLevel;
        const baseSuccessChance = 0.3; 
        const successChance = Math.max(0.1, Math.min(0.8, baseSuccessChance + (levelDifference * gameConfig.penalties.rampok.success_rate_bonus_per_level) + petBonus));
        
        const random = Math.random();

        if (random > successChance) {
            const penaltyAmount = Math.floor(robberUser.balance * FAILURE_PENALTY_RATE);
            robberUser.balance -= penaltyAmount;
            usersDb[message.sender] = robberUser;
            db.save('users', usersDb);

            const defenses = ["menodongkan pistol", "mengeluarkan golok", "menendang peler nya", "melempar batu", "memanggil hansip"];
            const defense = defenses[Math.floor(Math.random() * defenses.length)];
            const failMessage = `Gagal merampok! @${targetJid.split('@')[0]} berhasil menghalau @${message.sender.split('@')[0]} dan ${defense}!\n\nKarena ceroboh, kamu kehilangan *Rp ${penaltyAmount.toLocaleString()}*.`;
            return sock.sendMessage(message.from, { text: failMessage, mentions: [targetJid, message.sender] });
        }
        
        const amountStolen = Math.floor(targetUser.balance * (Math.random() * 0.4 + 0.1));

        if ((targetUser.jimatPembalik || 0) > 0) {
            targetUser.jimatPembalik -= 1;
            robberUser.balance -= amountStolen;
            targetUser.balance += amountStolen;
            
            usersDb[message.sender] = robberUser;
            usersDb[targetJid] = targetUser;
            db.save('users', usersDb);

            const reversalMessage = `*TAKDIR DIBALIKKAN!*\n\nNiat hati merampok @${targetJid.split('@')[0]}, @${message.sender.split('@')[0]} malah kehilangan *Rp ${amountStolen.toLocaleString()}* karena kekuatan Jimat Pembalik Takdir!`;
            return sock.sendMessage(message.from, { text: reversalMessage, mentions: [targetJid, message.sender] });
        }
        
        const xpGained = gameConfig.rewards.rampok.xp_base + Math.floor(amountStolen * gameConfig.rewards.rampok.xp_per_stolen_ratio);
        
        robberUser.balance += amountStolen;
        robberUser.xp = (robberUser.xp || 0) + xpGained;
        targetUser.balance -= amountStolen;
        
        await handler.checkLevelUp(sock, message, robberUser);
        
        usersDb[message.sender] = robberUser;
        usersDb[targetJid] = targetUser;
        db.save('users', usersDb);

        const successMessages = [
            `@${targetJid.split('@')[0]} menangis tersedu-sedu karena berhasil dirampok oleh @${message.sender.split('@')[0]} sebesar Rp ${amountStolen.toLocaleString()}`,
            `Dengan keahliannya, @${message.sender.split('@')[0]} berhasil menggasak Rp ${amountStolen.toLocaleString()} dari @${targetJid.split('@')[0]}!`,
            `Dompet @${targetJid.split('@')[0]} kini lebih ringan! @${message.sender.split('@')[0]} membawa kabur Rp ${amountStolen.toLocaleString()}.`
        ];
        let successMessage = successMessages[Math.floor(Math.random() * successMessages.length)];
        successMessage += `\nKamu mendapatkan *${xpGained} XP*!`;
        
        await sock.sendMessage(message.from, { text: successMessage, mentions: [targetJid, message.sender] });
    }
};