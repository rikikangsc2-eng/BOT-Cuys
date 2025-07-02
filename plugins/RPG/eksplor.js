const db = require('../../lib/database');
const config = require('../../config');
const gameConfig = require('../../gameConfig');
const { LRUCache } = require('lru-cache');
const axios = require('axios');

const activeExplorations = new LRUCache({ max: 500, ttl: 1000 * 60 * 60 });
const LUCK_COIN_BONUS = 0.25;

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

const scenarioPrompt = `Kamu adalah Dungeon Master. Buat skenario eksplorasi fantasi singkat dengan dua pilihan aksi. Balas HANYA dengan format JSON.
Contoh:
{
  "story": "Kamu menemukan peti bergetar di dasar gua.",
  "choices": {
    "buka": "Mencoba membuka peti yang bergetar.",
    "periksa": "Memeriksa peti dengan hati-hati."
  }
}`;

const outcomePrompt = `Kamu adalah Pencerita. Buat narasi singkat dan kreatif berdasarkan Aksi, Hasil, dan Jenis Hadiah/Hukuman yang diberikan. Balas HANYA dengan JSON berisi kunci "message".

Contoh Input: "Aksi: Membuka peti bergetar. Hasil: GAGAL. Hukuman: Uang."
Contoh Output:
{ "message": "Peti itu ternyata Mimic! Makhluk itu menggigitmu sebelum kabur, membuatmu menjatuhkan beberapa koin emas saat menghindar." }
`;

const itemTypes = Object.keys(gameConfig.rewards.eksplorasi.item);

module.exports = {
    command: 'eksplor',
    description: 'Memulai petualangan fantasi yang dihasilkan oleh AI.',
    category: 'RPG',
    run: async (sock, message, args, { handler, activeEvents }) => {
        const senderJid = message.sender;
        const action = args[0]?.toLowerCase();
        let usersDb = db.get('users');
        let cooldowns = db.get('cooldowns');
        const user = usersDb[senderJid] || { balance: 0, level: 1, xp: 0, nextLevelXp: handler.calculateNextLevelXp(1) };
        
        if (action) {
            const exploration = activeExplorations.get(senderJid);
            if (!exploration) return message.reply('Kamu tidak sedang dalam petualangan. Ketik `.eksplor` untuk memulai.');

            const choice = exploration.choices[action];
            if (!choice) {
                const availableChoices = Object.keys(exploration.choices).map(c => `\`${c}\``).join(' / ');
                return message.reply(`Pilihan tidak valid. Coba: \`${config.prefix}eksplor ${availableChoices}\``);
            }

            clearTimeout(exploration.timeout);
            activeExplorations.delete(senderJid);
            
            let successBonus = 0;
            let coinUsed = false;
            let eventBonus = 0;
            let eventActive = false;

            if ((user.koinKeberuntungan || 0) > 0) {
                user.koinKeberuntungan -= 1;
                successBonus = LUCK_COIN_BONUS;
                coinUsed = true;
            }

            if (activeEvents.meteorShower) {
                eventBonus = activeEvents.meteorShower.successBonus;
                eventActive = true;
            }
            
            const isSuccess = Math.random() < (choice.successChance + successBonus + eventBonus);
            await message.reply("Menentukan nasib dari pilihanmu...");

            try {
                const outcomeType = isSuccess ? "SUKSES" : "GAGAL";
                const rewardOrPenaltyType = isSuccess ? choice.rewardType : choice.penaltyType;
                let itemInfo = "";
                if (rewardOrPenaltyType === 'item') {
                    itemInfo = isSuccess ? ` (${choice.rewardItem})` : ``;
                }
                const query = `Aksi: ${choice.description}. Hasil: ${outcomeType}. Hadiah/Hukuman: ${rewardOrPenaltyType}${itemInfo}`;

                const outcomeResponse = await axios.get(`https://nirkyy-dev.hf.space/api/v1/writecream-gemini?system=${encodeURIComponent(outcomePrompt)}&query=${encodeURIComponent(query)}`);
                const outcome = cleanupAndParseJson(outcomeResponse.data.data.mes);

                let header = '';
                let details = '';
                let finalReply = '';
                const rewardRanges = gameConfig.rewards.eksplorasi;
                const xpGained = Math.floor(Math.random() * (rewardRanges.xp.max - rewardRanges.xp.min + 1)) + rewardRanges.xp.min;
                const itemUnits = { emas: 'gram', iron: 'gram', bara: 'gram', baja: 'batang', pedanglegendaris: 'buah' };

                if (isSuccess) {
                    header = '⚔️ *PETUALANGAN BERHASIL* ⚔️';
                    if (coinUsed) header += '\n*(Koin Keberuntungan digunakan!)*';
                    if (eventActive) header += `\n*(Event ${activeEvents.meteorShower.name} aktif!)*`;
                    details = `⭐ *XP Didapat:* +${xpGained}`;
                    if (rewardOrPenaltyType === 'balance') {
                        const amount = Math.floor(Math.random() * (rewardRanges.balance.max - rewardRanges.balance.min + 1)) + rewardRanges.balance.min;
                        user.balance = (user.balance || 0) + amount;
                        details += `\n💰 *Hadiah:* +Rp ${amount.toLocaleString()}`;
                        finalReply = `\n\n*💳 Saldo Baru:* Rp ${user.balance.toLocaleString()}`;
                    } else if (rewardOrPenaltyType === 'item') {
                        const itemName = choice.rewardItem;
                        const range = rewardRanges.item[itemName];
                        const amount = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
                        if (typeof user[itemName] !== 'object' || user[itemName] === null) user[itemName] = { amount: 0 };
                        user[itemName].amount = (user[itemName].amount || 0) + amount;
                        const formattedItemName = itemName.charAt(0).toUpperCase() + itemName.slice(1);
                        details += `\n✨ *Item Ditemukan:* +${amount} ${formattedItemName}`;
                        finalReply = `\n\n*📦 Total ${formattedItemName}:* ${user[itemName].amount} ${itemUnits[itemName]}`;
                    }
                } else {
                    header = '☠️ *PETUALANGAN GAGAL* ☠️';
                    details = `⭐ *XP Didapat:* +${xpGained}`;
                    if (rewardOrPenaltyType === 'balance') {
                        const amount = Math.floor(Math.random() * (rewardRanges.balance.max / 2 - rewardRanges.balance.min / 2 + 1)) + rewardRanges.balance.min / 2;
                        const finalPenalty = Math.min(user.balance || 0, amount);
                        user.balance -= finalPenalty;
                        details += `\n💸 *Kerugian:* -Rp ${finalPenalty.toLocaleString()}`;
                        finalReply = `\n\n*💳 Sisa Saldo:* Rp ${user.balance.toLocaleString()}`;
                    } else { 
                       details += `\nKamu berhasil lolos tanpa kerugian materiil.`;
                    }
                }
                
                user.xp = (user.xp || 0) + xpGained;
                await handler.checkLevelUp(sock, message, user);
                usersDb[senderJid] = user;
                db.save('users', usersDb);
                
                const fullMessage = `${header}\n\n> _${outcome.message}_\n\n${details}${finalReply}`;
                await message.reply(fullMessage);

            } catch (e) {
                console.error(e);
                await message.reply("Petualanganmu berakhir dengan aneh, takdir gagal ditentukan (API Error).");
            }

        } else {
            const userCooldowns = cooldowns[senderJid] || {};
            const cooldownTime = gameConfig.cooldowns.eksplor; 
            if (Date.now() - (userCooldowns.eksplor || 0) < cooldownTime) {
                const timeLeft = cooldownTime - (Date.now() - userCooldowns.eksplor);
                return message.reply(`Kamu baru saja selesai berpetualang. Istirahat dulu, ksatria. Tunggu *${formatCooldown(timeLeft)}* lagi.`);
            }
            if (activeExplorations.has(senderJid)) {
                return message.reply('Selesaikan dulu petualanganmu yang sekarang sebelum memulai yang baru!');
            }

            await message.reply("Membuat skenario petualangan baru dari gulungan takdir...");
            try {
                const response = await axios.get(`https://nirkyy-dev.hf.space/api/v1/writecream-gemini?system=${encodeURIComponent(scenarioPrompt)}&query=generate`);
                const scenario = cleanupAndParseJson(response.data.data.mes);

                for (const key in scenario.choices) {
                    const choice = scenario.choices[key];
                    scenario.choices[key] = {
                        description: choice,
                        successChance: Math.random() * 0.5 + 0.3,
                        rewardType: Math.random() < 0.5 ? 'balance' : 'item',
                        rewardItem: itemTypes[Math.floor(Math.random() * itemTypes.length)],
                        penaltyType: Math.random() < 0.7 ? 'balance' : 'xp'
                    };
                }

                const explorationTimeout = setTimeout(() => {
                    if (activeExplorations.has(senderJid)) {
                        activeExplorations.delete(senderJid);
                        message.reply('Kamu terlalu lama melamun, kesempatan petualangan pun hilang ditelan waktu.');
                    }
                }, 2 * 60 * 1000);

                scenario.timeout = explorationTimeout;
                activeExplorations.set(senderJid, scenario);

                if (!cooldowns[senderJid]) cooldowns[senderJid] = {};
                cooldowns[senderJid].eksplor = Date.now();
                db.save('cooldowns', cooldowns);

                const availableChoices = Object.keys(scenario.choices).map(c => `\`${c}\``).join(' / ');
                const storyText = `⚔️ *PETUALANGAN BARU MENANTI...*\n\n${scenario.story}\n\nKetik \`${config.prefix}eksplor <pilihan>\`\nPilihan: ${availableChoices}. Waktu 2 menit!`;
                await message.reply(storyText);
            } catch (e) {
                 console.error(e);
                 await message.reply("Gulungan takdir kosong, gagal membuat skenario (API Error).");
            }
        }
    }
};