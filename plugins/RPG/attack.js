const db = require('../../lib/database');
const gameConfig = require('../../gameConfig');
const { calculatePower, applyDurabilityLoss, createHealthBar } = require('../../lib/rpgUtils');

const getPartyLeader = (playerJid, activeDungeons) => {
    if (!activeDungeons) return null;
    for (const [leaderJid, party] of activeDungeons.entries()) {
        if (party.members.includes(playerJid)) {
            return { leaderJid, party };
        }
    }
    return null;
};

async function processBattleTurn(sock, leaderJid, party, activeDungeons) {
    const dungeonConfig = gameConfig.dungeons[party.dungeonType];
    const currentPlayerJid = party.members[party.turnIndex];
    let usersDb = db.get('users');

    const damage = Math.floor(calculatePower(usersDb[currentPlayerJid]) * (Math.random() * 0.5 + 0.75));
    party.bossHP -= damage;
    party.bossHP = Math.max(0, party.bossHP);
    party.battleLog.push(`💥 @${currentPlayerJid.split('@')[0]} menyerang dan memberikan *${damage.toLocaleString()}* kerusakan!`);
    if(party.battleLog.length > 3) party.battleLog.shift();

    if (party.bossHP <= 0) {
        let resultText = `🎉 *DUNGEON DITAKLUKKAN!* 🎉\n\nTim berhasil mengalahkan boss *${dungeonConfig.name}*!\n\n*Hadiah untuk Setiap Anggota:*\n`;
        const { xp, balance, lootTable } = dungeonConfig.rewards;
        resultText += `- *XP:* +${xp.toLocaleString()}\n- *Uang:* +Rp ${balance.toLocaleString()}\n\n`;

        let sharedLoot = [];
        for (const loot of lootTable) {
            if (Math.random() < loot.dropChance) {
                sharedLoot.push(loot);
            }
        }
        
        if (sharedLoot.length > 0) {
            resultText += `💎 *Loot Langka Ditemukan!*\n`;
            sharedLoot.forEach(item => resultText += `- *${item.amount}x ${item.name}*\n`);
        } else {
            resultText += `_Sayangnya, tidak ada loot langka yang ditemukan kali ini._\n`;
        }

        party.members.forEach(jid => {
            let user = usersDb[jid];
            user.xp = (user.xp || 0) + xp;
            user.balance = (user.balance || 0) + balance;
            sharedLoot.forEach(loot => {
                if (!user[loot.item]) user[loot.item] = { amount: 0 };
                user[loot.item].amount += loot.amount;
            });
            usersDb[jid] = user;
        });
        
        db.save('users', usersDb);
        await sock.sendMessage(party.groupId, { text: resultText, mentions: party.members });
        activeDungeons.delete(leaderJid);
        return;
    }

    party.turnIndex = (party.turnIndex + 1) % party.members.length;
    
    if (party.turnIndex === 0) {
        const bossAttackLog = `👹 Boss mengamuk dan menyerang balik! Semua peralatan anggota kehilangan *${dungeonConfig.bossDamage}* durabilitas!`;
        party.battleLog.push(bossAttackLog);
        if(party.battleLog.length > 3) party.battleLog.shift();
        
        party.members.forEach(jid => {
            let user = usersDb[jid];
            if (user.equipment) {
                Object.values(user.equipment).forEach(itemKey => {
                    user = applyDurabilityLoss(user, itemKey, dungeonConfig.bossDamage);
                });
            }
            usersDb[jid] = user;
        });
        db.save('users', usersDb);
    }
    
    const nextPlayerJid = party.members[party.turnIndex];
    const logText = party.battleLog.map(log => `> _${log}_`).join('\n');
    
    let updateText = `⚔️ *${dungeonConfig.name}: Pertarungan Lanjut!* ⚔️\n\n` +
        `*Boss HP:*\n${createHealthBar(party.bossHP, party.maxBossHP)}\n\n` +
        `*Giliran Menyerang:* @${nextPlayerJid.split('@')[0]}\n\n` +
        `*Log Pertarungan:*\n${logText}\n\n` +
        `Ketik \`.attack\` untuk menyerang!`;

    const sentMsg = await sock.sendMessage(party.groupId, { text: updateText, mentions: party.members });
    party.lastMessageId = sentMsg.key.id;
    activeDungeons.set(leaderJid, party);
}

module.exports = {
    command: 'attack',
    description: 'Menyerang bos dalam pertarungan dungeon.',
    category: 'RPG',
    run: async (sock, message, args, { activeDungeons }) => {
        const senderJid = message.sender;
        const partyInfo = getPartyLeader(senderJid, activeDungeons);

        if (!partyInfo) {
            return;
        }

        const { leaderJid, party } = partyInfo;
        if (party.phase !== 'battle') {
            return;
        }
        if (party.members[party.turnIndex] !== senderJid) {
            return sock.sendMessage(message.from, { text: `Sabar, bukan giliranmu! Sekarang giliran @${party.members[party.turnIndex].split('@')[0]}.`, mentions: [party.members[party.turnIndex]] });
        }
        
        await processBattleTurn(sock, leaderJid, party, activeDungeons);
    }
};