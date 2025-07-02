const db = require('../../lib/database');
const { LRUCache } = require('lru-cache');
const gameConfig = require('../../gameConfig');
const { getPlayerGuild, calculatePower, applyDurabilityLoss, createHealthBar } = require('../../lib/rpgUtils');

const pendingDuels = new LRUCache({ max: 500, ttl: 1000 * 60 * 60 });
const LEVEL_DIFFERENCE_LIMIT = 10;
const DUEL_AZIMAT_BOOST = 250;

async function runDuelAnimation(sock, initialMessage, p1, p2, amount, handler, activeEvents = {}) {
    const p1Jid = p1.jid;
    const p2Jid = p2.jid;
    const mentions = [p1Jid, p2Jid];
    let usersDb = db.get('users');
    let p1Data = usersDb[p1Jid];
    let p2Data = usersDb[p2Jid];
    let p1Power = calculatePower(p1Data);
    let p2Power = calculatePower(p2Data);
    
    let p1AzimatUsed = false;
    if ((p1Data.azimatDuelSakti || 0) > 0) {
        p1Data.azimatDuelSakti -= 1;
        p1Power += DUEL_AZIMAT_BOOST;
        p1AzimatUsed = true;
    }

    let p2AzimatUsed = false;
    if ((p2Data.azimatDuelSakti || 0) > 0) {
        p2Data.azimatDuelSakti -= 1;
        p2Power += DUEL_AZIMAT_BOOST;
        p2AzimatUsed = true;
    }

    if (p1AzimatUsed || p2AzimatUsed) {
        usersDb[p1Jid] = p1Data;
        usersDb[p2Jid] = p2Data;
        db.save('users', usersDb);
    }
    
    const attackPhrases = [
        "melemparkan sendal jepit legendaris", "menggunakan jurus 'Pukulan Seribu Bayangan'", "menyerang sambil teriak 'WIBUUU!'",
        "menggelitik lawan hingga tak berdaya", "mengeluarkan tatapan sinis yang menyakitkan", "melempar batu kerikil dengan presisi tinggi",
        "menggunakan 'Senggolan Maut'"
    ];
    const defensePhrases = [
        "menangkis serangan dengan tutup panci", "menghindar sambil joget TikTok", "tiba-tiba pura-pura AFK",
        "menggunakan tameng 'Sabar Ini Ujian'", "membangun benteng dari bantal guling", "berubah menjadi batu untuk sesaat",
        "berhasil menghindar tipis"
    ];

    let p1HP = 100;
    let p2HP = 100;

    let header = `🔥 *DUEL DIMULAI* 🔥\nTaruhan: *Rp ${amount.toLocaleString()}*\n\n` +
                   `💪 @${p1Jid.split('@')[0]} (Power: ${p1Power})${p1AzimatUsed ? ' ✨' : ''}\n` +
                   `💪 @${p2Jid.split('@')[0]} (Power: ${p2Power})${p2AzimatUsed ? ' ✨' : ''}\n`;
    if(p1AzimatUsed || p2AzimatUsed) header += `\n_Salah satu petarung menggunakan Azimat Sakti!_\n`

    const editMessage = async (text) => {
        try {
            await sock.sendMessage(initialMessage.from, { text, mentions, edit: initialMessage.key });
            await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (e) {
            console.error("Gagal mengedit pesan:", e);
        }
    };
    
    let actionMessage = "Para petarung saling menatap tajam, bersiap untuk ronde pertama!";

    while (p1HP > 0 && p2HP > 0) {
        const isP1Attacking = Math.random() < 0.5;
        const attackerJid = isP1Attacking ? p1Jid : p2Jid;
        const defenderJid = isP1Attacking ? p2Jid : p1Jid;
        const attackerPower = isP1Attacking ? p1Power : p2Power;
        const defenderPower = isP1Attacking ? p2Power : p1Power;

        const baseDamage = 5 + Math.floor(Math.random() * (attackerPower / 10));
        const defenseReduction = Math.floor(defenderPower / 20);
        const damage = Math.max(1, baseDamage - defenseReduction);
        
        const attackDesc = attackPhrases[Math.floor(Math.random() * attackPhrases.length)];
        const defenseDesc = defensePhrases[Math.floor(Math.random() * defensePhrases.length)];
        
        actionMessage = `💥 @${attackerJid.split('@')[0]} ${attackDesc}, namun @${defenderJid.split('@')[0]} ${defenseDesc}! Tetap terkena *${damage}* kerusakan!`;

        if (isP1Attacking) {
            p2HP -= damage;
        } else {
            p1HP -= damage;
        }
        
        const hpDisplay = `*@${p1Jid.split('@')[0]} (Lv.${p1.data.level}):* ${createHealthBar(p1HP, 100)}\n` +
                          `*@${p2Jid.split('@')[0]} (Lv.${p2.data.level}):* ${createHealthBar(p2HP, 100)}`;

        await editMessage(`${header}\n${hpDisplay}\n\n${actionMessage}`);
        
        if (p1HP <= 0 || p2HP <= 0) break;
    }

    const finalWinnerJid = p1HP > 0 ? p1Jid : p2Jid;
    const finalLoserJid = p1HP > 0 ? p2Jid : p1Jid;
    let xpGained = gameConfig.rewards.duel.xp_base + Math.floor(amount * gameConfig.rewards.duel.xp_per_bet_ratio);
    
    let bonusMessages = [];
    const guildsDb = db.get('guilds');
    const winnerGuild = getPlayerGuild(finalWinnerJid, guildsDb);
    const semangatKsatriaKey = Object.keys(gameConfig.guildBuffs).find(k => k.toLowerCase() === 'semangatksatria');
    if (winnerGuild && semangatKsatriaKey && winnerGuild.activeBuffs && winnerGuild.activeBuffs[semangatKsatriaKey.toLowerCase()]?.expires > Date.now()) {
        const buffInfo = gameConfig.guildBuffs.semangatKsatria;
        const bonusXp = Math.floor(xpGained * buffInfo.effect.value);
        xpGained += bonusXp;
        bonusMessages.push(`Guild Buff: +${bonusXp} XP`);
    }

    const winnerData = usersDb[finalWinnerJid];
    const winnerPet = winnerData.pet;
    if (winnerPet && (winnerPet.lastFed + (24 * 60 * 60 * 1000)) > Date.now()) {
        const petEffect = gameConfig.petEffects[winnerPet.key];
        if (petEffect && petEffect.type === 'duel_xp_bonus') {
            const bonusXp = Math.floor(xpGained * petEffect.value);
            xpGained += bonusXp;
            bonusMessages.push(`Pet Bonus: +${bonusXp} XP`);
        }
    }

    if (activeEvents.doubleXp) {
        xpGained *= activeEvents.doubleXp.multiplier;
        bonusMessages.push(`Event: ${activeEvents.doubleXp.name}!`);
    }

    const hpDisplay = `*@${p1Jid.split('@')[0]}:* ${createHealthBar(p1HP, 100)}\n` +
                      `*@${p2Jid.split('@')[0]}:* ${createHealthBar(p2HP, 100)}`;
                      
    let finalMessage = `🏆 *DUEL SELESAI!* Pemenangnya adalah @${finalWinnerJid.split('@')[0]}!\nDia mendapatkan *${xpGained} XP*!`;
    if (bonusMessages.length > 0) {
        finalMessage += `\n*Bonus:* ${bonusMessages.join(', ')}`;
    }
    
    let loserData = usersDb[finalLoserJid];
    winnerData.balance += amount;
    winnerData.xp = (winnerData.xp || 0) + xpGained;
    loserData.balance -= amount;

    let durabilityReport = '';
    if (loserData.equipment) {
        let durabilityLost = false;
        Object.values(loserData.equipment).forEach(item => {
            const oldDurability = loserData[item]?.durability || gameConfig.durability.max[item];
            loserData = applyDurabilityLoss(loserData, item);
            const newDurability = loserData[item]?.durability;
            if (oldDurability > newDurability) durabilityLost = true;
        });
        if(durabilityLost) durabilityReport = `\n\n_Peralatan @${finalLoserJid.split('@')[0]} mengalami kerusakan akibat pertarungan sengit._`;
    }
    
    await handler.checkLevelUp(sock, { sender: finalWinnerJid, from: initialMessage.from }, winnerData);
    
    usersDb[finalWinnerJid] = winnerData;
    usersDb[finalLoserJid] = loserData;
    db.save('users', usersDb);

    await editMessage(`${header}\n${hpDisplay}\n\n${finalMessage}${durabilityReport}`);
}

module.exports = {
    command: 'duel',
    description: 'Menantang pemain lain untuk berduel dengan taruhan.',
    category: 'Ekonomi',
    run: async (sock, message, args, { handler, activeEvents }) => {
        const senderJid = message.sender;
        const action = args[0]?.toLowerCase();

        if (['terima', 'tolak'].includes(action)) {
            const duelKey = `${message.from}:${senderJid}`;
            const duelRequest = pendingDuels.get(duelKey);

            if (!duelRequest) {
                return message.reply('Tidak ada tantangan duel yang ditujukan untukmu saat ini.');
            }

            clearTimeout(duelRequest.timeout);
            pendingDuels.delete(duelKey);
            const { challengerJid, amount } = duelRequest;

            if (action === 'tolak') {
                return sock.sendMessage(message.from, { text: `@${senderJid.split('@')[0]} telah menolak tantangan duel dari @${challengerJid.split('@')[0]}.`, mentions: [senderJid, challengerJid] });
            }

            if (action === 'terima') {
                let usersDb = db.get('users');
                const challenger = { jid: challengerJid, data: usersDb[challengerJid] || {} };
                const target = { jid: senderJid, data: usersDb[senderJid] || {} };

                if ((challenger.data?.balance || 0) < amount || (target.data?.balance || 0) < amount) {
                    return message.reply('Salah satu pemain tidak memiliki cukup uang untuk taruhan ini lagi. Duel dibatalkan.');
                }
                
                const challengerLevel = challenger.data.level || 1;
                const targetLevel = target.data.level || 1;
                if(challengerLevel < gameConfig.requirements.duelLevel || targetLevel < gameConfig.requirements.duelLevel){
                    return message.reply(`Kedua pemain harus berada di *Level ${gameConfig.requirements.duelLevel}* atau lebih tinggi untuk berduel.`);
                }
                
                if (Math.abs(challengerLevel - targetLevel) > LEVEL_DIFFERENCE_LIMIT) {
                    return message.reply(`Duel tidak adil! Perbedaan level terlalu jauh (Maksimal ${LEVEL_DIFFERENCE_LIMIT} level).`);
                }

                const initialMsg = await sock.sendMessage(message.from, { text: 'Duel diterima! Mempersiapkan arena...', mentions: [challenger.jid, target.jid] });
                await runDuelAnimation(sock, { ...initialMsg, from: message.from }, challenger, target, amount, handler, activeEvents);
            }
            return;
        }

        const targetJid = message.msg?.contextInfo?.mentionedJid?.[0];
        const amount = parseInt(args[1]);

        if (!targetJid || isNaN(amount) || amount <= 0) {
            return message.reply('Gunakan format: *.duel @target <jumlah_taruhan>*\nContoh: .duel @user 5000');
        }

        if (targetJid === senderJid) {
            return message.reply('Anda tidak bisa berduel dengan diri sendiri!');
        }
        
        if (pendingDuels.has(`${message.from}:${targetJid}`)) {
            return message.reply('Pemain tersebut sudah memiliki tantangan duel yang aktif. Tunggu hingga selesai.');
        }

        let usersDb = db.get('users');
        const challengerUser = usersDb[senderJid] || {};
        const targetUser = usersDb[targetJid] || {};
        const challengerBalance = challengerUser.balance || 0;
        const targetBalance = targetUser.balance || 0;

        if (challengerBalance < amount || targetBalance < amount) {
            return message.reply('Saldo Anda atau target tidak cukup untuk taruhan ini.');
        }
        
        const challengerLevel = challengerUser.level || 1;
        const targetLevel = targetUser.level || 1;
        if(challengerLevel < gameConfig.requirements.duelLevel || targetLevel < gameConfig.requirements.duelLevel){
             return message.reply(`Kedua pemain harus berada di *Level ${gameConfig.requirements.duelLevel}* atau lebih tinggi untuk berduel.`);
        }
        
        if (Math.abs(challengerLevel - targetLevel) > LEVEL_DIFFERENCE_LIMIT) {
            return message.reply(`Tidak bisa menantang! Perbedaan level terlalu jauh (Maksimal ${LEVEL_DIFFERENCE_LIMIT} level).`);
        }

        const duelKey = `${message.from}:${targetJid}`;
        const timeout = setTimeout(() => {
            if (pendingDuels.has(duelKey)) {
                pendingDuels.delete(duelKey);
                sock.sendMessage(message.from, { text: `Tantangan duel dari @${senderJid.split('@')[0]} untuk @${targetJid.split('@')[0]} telah kedaluwarsa.`, mentions: [senderJid, targetJid] });
            }
        }, 60 * 1000);

        pendingDuels.set(duelKey, { challengerJid: senderJid, amount, timeout });
        
        await sock.sendMessage(message.from, { text: `⚔️ *TANTANGAN DUEL* ⚔️\n\n@${senderJid.split('@')[0]} menantang @${targetJid.split('@')[0]} untuk berduel dengan taruhan *Rp ${amount.toLocaleString()}*!\n\nKetik *.duel terima* untuk menerima atau *.duel tolak* untuk menolak. Waktu 60 detik.`, mentions: [senderJid, targetJid] });
    }
};