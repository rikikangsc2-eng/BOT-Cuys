const db = require('../../lib/database');
const axios = require('axios');
const gameConfig = require('../../gameConfig');

function formatCooldown(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes} menit ${seconds} detik`;
}

function cleanupAndParseJson(text) {
    const jsonRegex = /({[\s\S]*})/;
    const match = text.match(jsonRegex);
    if (match && match[1]) {
        return JSON.parse(match[1]);
    }
    throw new Error("Invalid or malformed JSON response from AI");
}

const getPlayerGuild = (playerJid, guildsDb) => {
    if (!guildsDb) return null;
    return Object.values(guildsDb).find(g => g.members && g.members[playerJid]);
};

const systemPrompt = `Kamu adalah Pencerita untuk bot RPG fantasi. Tugasmu adalah membuat skenario berburu singkat dan imersif berdasarkan JENIS HASIL dan HADIAH yang telah ditentukan. Balas HANYA dengan format JSON berisi satu kunci: "message".

Contoh Skenario:
- Jika diberi 'super_success-item-emas': Buat cerita tentang @{user} yang menemukan makhluk legendaris dan mendapatkan Emasnya.
- Jika diberi 'success-balance': Buat cerita tentang @{user} yang berhasil mengalahkan makhluk biasa dan menjual bagian tubuhnya untuk uang.
- Jika diberi 'success-item-iron': Buat cerita tentang @{user} yang berhasil mengalahkan golem dan mengambil bongkahan Iron dari tubuhnya.
- Jika diberi 'failure': Buat cerita tentang @{user} yang diserang dan kehilangan uang.
- Jika diberi 'nothing': Buat cerita tentang @{user} yang tidak menemukan apa-apa.
`;

module.exports = {
    command: 'berburu',
    description: 'Berburu makhluk fantasi di hutan untuk mendapatkan hadiah.',
    category: 'RPG',
    run: async (sock, message, args, { handler, activeEvents }) => {
        const cooldownTime = gameConfig.cooldowns.berburu;
        const senderJid = message.sender;

        let cooldowns = db.get('cooldowns');
        let usersDb = db.get('users');
        const user = usersDb[senderJid] || { balance: 0, level: 1, xp: 0 };
        const userCooldown = cooldowns[senderJid]?.berburu || 0;

        if (Date.now() - userCooldown < cooldownTime) {
            const timeLeft = cooldownTime - (Date.now() - userCooldown);
            return message.reply(`Hutan masih memulihkan diri dari perburuan terakhirmu. Tunggu *${formatCooldown(timeLeft)}* lagi.`);
        }
        
        await message.reply("Mencari jejak makhluk di hutan belantara...");

        try {
            let guildsDb = db.get('guilds');
            const userGuild = getPlayerGuild(senderJid, guildsDb);
            let buffBonus = 0;
            let buffActive = false;
            
            const berkahHutanKey = Object.keys(gameConfig.guildBuffs).find(k => k.toLowerCase() === 'berkahhutan');
            if (userGuild && userGuild.activeBuffs && berkahHutanKey && userGuild.activeBuffs[berkahHutanKey.toLowerCase()]?.expires > Date.now()) {
                const buffInfo = gameConfig.guildBuffs.berkahHutan;
                buffBonus = buffInfo.effect.value;
                buffActive = true;
            }

            let petBonus = 0;
            const userPet = user.pet;
            if (userPet && (userPet.lastFed + (24 * 60 * 60 * 1000)) > Date.now()) {
                const petEffect = gameConfig.petEffects[userPet.key];
                if (petEffect && petEffect.type === 'berburu_item_chance') {
                    petBonus = petEffect.value;
                }
            }

            let chosenOutcome;
            let potionUsed = false;
            let eventBonuses = { success: 0, xp: 1 };
            let eventMessages = [];

            if (activeEvents.meteorShower) {
                eventBonuses.success += activeEvents.meteorShower.successBonus;
                eventMessages.push(activeEvents.meteorShower.name);
            }
            if (activeEvents.doubleXp) {
                eventBonuses.xp *= activeEvents.doubleXp.multiplier;
                eventMessages.push(activeEvents.doubleXp.name);
            }

            if ((user.ramuanBerburuSuper || 0) > 0) {
                user.ramuanBerburuSuper -= 1;
                potionUsed = true;
                chosenOutcome = gameConfig.berburu.outcomes.find(o => o.type === 'super_success');
            } else {
                const rand = Math.random();
                let cumulativeProbability = 0;
                chosenOutcome = gameConfig.berburu.outcomes.find(o => {
                    let probability = o.probability;
                    if (o.type.includes('success')) {
                        probability += buffBonus + eventBonuses.success;
                    } else if (o.type === 'failure') {
                        probability -= (buffBonus + eventBonuses.success);
                    }
                    cumulativeProbability += probability;
                    return rand <= cumulativeProbability;
                }) || gameConfig.berburu.outcomes.find(o => o.type === 'nothing');
            }
            
            let rewardType = chosenOutcome.rewardType || (Math.random() < (0.7 - petBonus) ? 'balance' : 'item');
            let rewardItem = rewardType === 'item' ? gameConfig.berburu.item_types[Math.floor(Math.random() * gameConfig.berburu.item_types.length)] : '';
            
            const aiQuery = `${chosenOutcome.type}${rewardType === 'item' ? '-item-' + rewardItem : (rewardType === 'balance' ? '-balance' : '')}`;
            const aiResponse = await axios.get(`https://nirkyy-dev.hf.space/api/v1/writecream-gemini?system=${encodeURIComponent(systemPrompt)}&query=${encodeURIComponent(aiQuery)}`);
            const scenario = cleanupAndParseJson(aiResponse.data.data.mes);

            let header = '🏹 *PERBURUAN* 🏹';
            if (eventMessages.length > 0) {
                header = `✨ *EVENT: ${eventMessages.join(' & ')}* ✨\n` + header;
            }
            
            let details = '';
            let finalReply = '';
            const narrative = scenario.message.replace(/@\{user\}/g, `@${senderJid.split('@')[0]}`);
            
            const rewardConfig = gameConfig.rewards.berburu[chosenOutcome.type];
            let xpGained = Math.floor(Math.random() * (rewardConfig.xp[1] - rewardConfig.xp[0] + 1)) + rewardConfig.xp[0];
            xpGained = Math.floor(xpGained * eventBonuses.xp);

            if (chosenOutcome.type.includes('success')) {
                header += `\n*HASIL: BERHASIL*`;
                if(buffActive) header += `\n*(Buff Guild: Berkah Hutan Aktif!)*`;
                if(potionUsed) header += `\n*(Ramuan Berburu Super digunakan!)*`;
                details = `⭐ *XP Didapat:* +${xpGained}`;
                if (rewardType === 'balance') {
                    const amount = Math.floor(Math.random() * (rewardConfig.balance[1] - rewardConfig.balance[0] + 1)) + rewardConfig.balance[0];
                    user.balance = (user.balance || 0) + amount;
                    details += `\n💰 *Hadiah:* +Rp ${amount.toLocaleString()}`;
                    finalReply = `\n\n*💳 Saldo Baru:* Rp ${user.balance.toLocaleString()}`;
                } else if (rewardType === 'item') {
                    const isFoodItem = ['daging', 'ikan', 'tikus'].includes(rewardItem);
                    const amount = isFoodItem ? Math.floor(Math.random() * 3) + 1 : Math.floor(Math.random() * (rewardConfig.balance[1] / 1000 - 1 + 1)) + 1;
                    
                    if (typeof user[rewardItem] !== 'object' || user[rewardItem] === null) user[rewardItem] = { amount: 0 };
                    user[rewardItem].amount = (user[rewardItem].amount || 0) + amount;
                    const formattedItemName = rewardItem.charAt(0).toUpperCase() + rewardItem.slice(1);
                    
                    const itemUnits = { emas: 'gram', iron: 'gram', bara: 'gram', daging: 'potong', ikan: 'ekor', tikus: 'ekor' };
                    details += `\n✨ *Item Ditemukan:* +${amount} ${formattedItemName}`;
                    finalReply = `\n\n*📦 Total ${formattedItemName}:* ${user[rewardItem].amount} ${itemUnits[rewardItem] || 'buah'}`;
                }
            } else if (chosenOutcome.type === 'failure') {
                header += `\n*HASIL: GAGAL*`;
                const penaltyConfig = gameConfig.penalties.berburu;
                const penaltyAmount = Math.floor(Math.random() * (penaltyConfig.balance[1] - penaltyConfig.balance[0] + 1)) + penaltyConfig.balance[0];
                const finalPenalty = Math.min(user.balance || 0, penaltyAmount);
                user.balance -= finalPenalty;
                details = `💸 *Kerugian:* -Rp ${finalPenalty.toLocaleString()}\n⭐ *XP Didapat:* +${xpGained}`;
                finalReply = `\n\n*💳 Sisa Saldo:* Rp ${user.balance.toLocaleString()}`;
            } else {
                header += `\n*HASIL: NIHIL*`;
                details = `⭐ *XP Didapat:* +${xpGained}`;
            }

            user.xp = (user.xp || 0) + xpGained;
            await handler.checkLevelUp(sock, message, user);
            
            usersDb[senderJid] = user;
            if (!cooldowns[senderJid]) cooldowns[senderJid] = {};
            cooldowns[senderJid].berburu = Date.now();
            
            db.save('users', usersDb);
            db.save('cooldowns', cooldowns);
            
            const fullMessage = `${header}\n\n> _${narrative}_\n\n${details}${finalReply}`;
            await sock.sendMessage(message.from, { text: fullMessage, mentions: [senderJid] });

        } catch(e) {
            console.error(e);
            await message.reply("Terjadi kesalahan saat berkomunikasi dengan roh hutan (API). Coba lagi nanti.");
        }
    }
};