const { serialize } = require('./lib/serialize');
const db = require('./lib/database');
const logger = require('./lib/logger');
const config = require('./config');
const { plugins } = require('./lib/pluginManager');
const { LRUCache } = require('lru-cache');
const { getActiveEvents } = require('./lib/eventManager');
const { calculateNextLevelXp } = require('./lib/rpgUtils');

const activeGames = new LRUCache({ max: 500, ttl: 1000 * 60 * 60 });
const activeBombGames = new LRUCache({ max: 500, ttl: 1000 * 60 * 60 });
const groupMetadataCache = new LRUCache({ max: 100, ttl: 1000 * 60 * 5 });
const activeDungeons = new LRUCache({ max: 100, ttl: 1000 * 60 * 30 });
const activeSambungKataGames = new LRUCache({ max: 500, ttl: 1000 * 60 * 15 });

const checkLevelUp = async (sock, message, user) => {
    if (!user.level || !user.xp) {
        user.level = 1;
        user.xp = 0;
    }
    user.nextLevelXp = calculateNextLevelXp(user.level);

    let leveledUp = false;
    while (user.xp >= user.nextLevelXp) {
        user.xp -= user.nextLevelXp;
        user.level++;
        user.nextLevelXp = calculateNextLevelXp(user.level);
        leveledUp = true;
    }

    if (leveledUp) {
        const levelUpMessage = `🎉 *LEVEL UP!* 🎉\n\nSelamat, @${message.sender.split('@')[0]}! Anda telah mencapai *Level ${user.level}*!`;
        sock.sendMessage(message.from, { text: levelUpMessage, mentions: [message.sender] });
    }
};

const updateQuestProgress = async (userJid, questType) => {
    try {
        let questsDb = db.get('quests');
        const userQuestsData = questsDb[userJid];
        if (!userQuestsData || !userQuestsData.dailyQuests) return;

        let questUpdated = false;
        for (const quest of userQuestsData.dailyQuests) {
            if (quest.type === questType && !quest.claimed && quest.progress < quest.target) {
                quest.progress++;
                questUpdated = true;
            }
        }
        if (questUpdated) {
            db.save('quests', questsDb);
        }
    } catch (e) {
        logger.error(e, `Gagal memperbarui progres misi untuk ${userJid}`);
    }
};

const formatAfkDuration = (ms) => {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    const parts = [];
    if (days > 0) parts.push(`${days} hari`);
    if (hours > 0) parts.push(`${hours} jam`);
    if (minutes > 0) parts.push(`${minutes} menit`);
    if (seconds > 0) parts.push(`${seconds} detik`);
    return parts.join(', ') || 'beberapa saat';
};

const handleAfk = async (sock, message) => {
    const afkData = db.get('afk');
    if (afkData[message.sender]) {
        const afkInfo = afkData[message.sender];
        const duration = formatAfkDuration(Date.now() - afkInfo.time);
        message.reply(`👋 *Selamat datang kembali!*\nAnda telah AFK selama *${duration}*.`);
        delete afkData[message.sender];
        db.save('afk', afkData);
    }

    const jidsToCheck = [...new Set([...(message.msg?.contextInfo?.mentionedJid || []), message.msg?.contextInfo?.participant].filter(Boolean))];
    for (const jid of jidsToCheck) {
        if (jid !== message.sender && afkData[jid]) {
            const afkInfo = afkData[jid];
            const duration = formatAfkDuration(Date.now() - afkInfo.time);
            const response = `🤫 Jangan ganggu dia!\n\n*User:* @${jid.split('@')[0]}\n*Status:* AFK sejak *${duration}* lalu\n*Alasan:* ${afkInfo.reason}`;
            sock.sendMessage(message.from, { text: response, mentions: [jid] }, { quoted: message });
        }
    }
};

const generateBombBoard = (boxes) => {
    let board = '';
    for (let i = 0; i < boxes.length; i++) {
        board += boxes[i];
        if ((i + 1) % 3 === 0) {
            board += '\n';
        } else {
            board += ' ';
        }
    }
    return board;
};

const handleGameReply = async (sock, message) => {
    if (!message.isGroup || !message.body) return false;

    if (activeGames.has(message.from)) {
        const game = activeGames.get(message.from);
        if (message.body.toLowerCase() !== game.jawaban.toLowerCase()) return false;
        
        clearTimeout(game.timeout);
        activeGames.delete(message.from);

        let usersDb = db.get('users');
        const user = usersDb[message.sender] || { balance: 0, name: message.pushName, level: 1, xp: 0 };
        
        user.balance += game.hadiah;
        user.name = message.pushName;
        user.xp = (user.xp || 0) + Math.floor(game.hadiah / 100);
        
        usersDb[message.sender] = user;
        db.save('users', usersDb);
        
        message.reply(`🎉 *Selamat, ${message.pushName}!* Jawaban Anda benar.\nAnda mendapatkan *Rp ${game.hadiah.toLocaleString()}* dan *${Math.floor(game.hadiah / 100)} XP*.`);
        await checkLevelUp(sock, message, user);
        
        return true;
    }
    
    if (activeBombGames.has(message.from) && message.msg?.contextInfo?.quotedMessage) {
        const game = activeBombGames.get(message.from);
        if (message.msg.contextInfo.participant !== config.botNumber + '@s.whatsapp.net') return false;
        if (message.sender !== game.turn) return false;

        const choice = parseInt(message.body.trim()) - 1;
        if (isNaN(choice) || choice < 0 || choice > 8) return true;
        
        const numberToEmoji = (n) => ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'][n] || `${n+1}️⃣`;

        if (game.boxes[choice] !== numberToEmoji(choice)) {
            message.reply('Kotak itu sudah dibuka, pilih yang lain!');
            return true;
        }

        clearTimeout(game.timeout);
        let usersDb = db.get('users');
        
        if (game.bombIndexes.includes(choice)) {
            const winnerJid = (message.sender === game.challengerJid) ? game.targetJid : game.challengerJid;
            const loserJid = message.sender;

            usersDb[winnerJid].balance += game.amount;
            usersDb[loserJid].balance -= game.amount;
            game.boxes[choice] = '💣';

            const endText = `*KABOOM!* 💣💥\n\n` +
                `@${loserJid.split('@')[0]} menginjak bom!\n` +
                `Pemenangnya adalah @${winnerJid.split('@')[0]} dan mendapatkan *Rp ${game.amount.toLocaleString()}*!\n\n` +
                `*Papan Terakhir:*\n${generateBombBoard(game.boxes)}`;

            sock.sendMessage(message.from, { text: endText, mentions: [winnerJid, loserJid] });
            activeBombGames.delete(message.from);
        } else {
            game.boxes[choice] = '✅';
            game.turn = (message.sender === game.challengerJid) ? game.targetJid : game.challengerJid;
            
            const turnText = `*TEBAK BOM* 💣\n` +
                `Taruhan: *Rp ${game.amount.toLocaleString()}*\n\n` +
                generateBombBoard(game.boxes) +
                `\nGiliran @${game.turn.split('@')[0]} untuk memilih kotak.\n\n` +
                `_Balas pesan ini dengan nomor kotak (Waktu 30 detik)._`;

            sock.sendMessage(message.from, { text: turnText, mentions: [game.turn] });
            
            game.timeout = setTimeout(() => {
                if (activeBombGames.has(message.from)) {
                    sock.sendMessage(message.from, {text: "Waktu Habis!"});
                    activeBombGames.delete(message.from);
                }
            }, 30000);
            
            activeBombGames.set(message.from, game);
        }
        db.save('users', usersDb);
        return true;
    }
    
    if (activeSambungKataGames.has(message.from) && message.msg?.contextInfo?.quotedMessage) {
        const game = activeSambungKataGames.get(message.from);
        if (game.phase !== 'playing') return false;
        if (message.msg.contextInfo.participant !== config.botNumber + '@s.whatsapp.net') return false;
        if (message.sender !== game.players[game.turnIndex]) return false;

        const plugin = plugins.get('sambungkata');
        if (plugin) {
            try {
                await plugin.run(sock, message, message.body.trim().split(/ +/), { activeSambungKataGames, isGameReply: true });
            } catch (e) {
                logger.error(e, 'Error saat merutekan balasan sambungkata ke plugin');
            }
        }
        return true;
    }
    
    return false;
};

async function handleAntiLink(sock, message, groupMetadata) {
    if (!message.isGroup || !message.body) return false;
    
    const groupSettingsDb = db.get('groupSettings') || {};
    const groupSettings = groupSettingsDb[message.from];
    if (!groupSettings || !groupSettings.isAntilinkEnabled) return false;

    const linkRegex = /https:\/\/chat\.whatsapp\.com\/[a-zA-Z0-9]{22}/g;
    if (linkRegex.test(message.body)) {
        const sender = groupMetadata.participants.find(p => p.id === message.sender);
        if (sender && sender.admin) return false;

        const bot = groupMetadata.participants.find(p => p.id === sock.user.id.split(':')[0] + '@s.whatsapp.net');
        if (!bot || !bot.admin) return false;

        sock.sendMessage(message.from, { delete: message.key });
        message.reply('Terdeteksi link grup WhatsApp! Anda akan dikeluarkan.');
        await new Promise(resolve => setTimeout(resolve, 1000));
        await sock.groupParticipantsUpdate(message.from, [message.sender], 'remove');
        return true;
    }
    return false;
}

const handler = async (sock, m) => {
    const message = await serialize(sock, m);
    if (!message.body) return;

    let groupMetadata;
    if (message.isGroup) {
        groupMetadata = groupMetadataCache.get(message.from);
        if (!groupMetadata) {
            groupMetadata = await sock.groupMetadata(message.from);
            groupMetadataCache.set(message.from, groupMetadata);
        }
    }
    
    if (await handleGameReply(sock, message)) return;
    if (await handleAntiLink(sock, message, groupMetadata)) return;
    
    await handleAfk(sock, message);
    
    const isOwner = message.sender.startsWith(config.ownerNumber);
    if (!config.isPublic && !isOwner) return;

    if (config.autoRead) await sock.readMessages([message.key]);
    
    if (!message.isGroup && !message.body.startsWith(config.prefix) && !/Balas pesan ini/.test(message.msg?.contextInfo?.quotedMessage?.conversation || '')) {
        const usersDb = db.get('users');
        const user = usersDb[message.sender] || {};
        const caiPartner = usersDb.cai_partners?.[message.sender];
        const preference = user.auto_ai_preference || '1';

        let autoAiPlugin;
        if (preference === '2' && caiPartner) {
            autoAiPlugin = plugins.get('cai');
        } else {
            autoAiPlugin = plugins.get('ai');
        }
        
        if (autoAiPlugin) {
            try {
                autoAiPlugin.run(sock, message, message.body.trim().split(/ +/), { isAuto: true });
                return;
            } catch (e) {
                logger.error(e, 'Error pada Auto AI Handler');
            }
        }
    }

    if (!message.body.startsWith(config.prefix)) return;
    
    const args = message.body.slice(config.prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const plugin = plugins.get(command);

    if (plugin) {
        if (plugin.ownerOnly && !isOwner) return message.reply('Perintah ini hanya untuk Owner.');
        if (plugin.groupOnly && !message.isGroup) return message.reply('Perintah ini hanya bisa digunakan di dalam grup.');
        
        try {
            const activeEvents = getActiveEvents();
            const handlerUtils = { checkLevelUp };
            plugin.run(sock, message, args, { activeGames, groupMetadata, activeBombGames, activeDungeons, activeSambungKataGames, activeEvents, handler: handlerUtils });
            
            const questType = Array.isArray(plugin.command) ? plugin.command[0] : plugin.command;
            const trackableQuests = ['berburu', 'duel', 'meracik', 'rampok', 'ngemis'];
            if (trackableQuests.includes(questType)) {
                updateQuestProgress(message.sender, questType);
            }
        } catch (e) {
            logger.error(e, `Error saat menjalankan plugin ${command}`);
            message.reply(`Terjadi kesalahan: ${e.message}`);
        }
    }
};

module.exports = handler;