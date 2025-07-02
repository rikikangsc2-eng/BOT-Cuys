const axios = require('axios');
const db = require('../../lib/database');
const config = require('../../config');
const gameConfig = require('../../gameConfig');
const logger = require('../../lib/logger');

const MIN_PLAYERS = 2;
const TURN_TIMEOUT = 30000;

async function checkKBBI(word) {
    if (!word || word.length < 3) return false;
    const lowerCaseWord = word.toLowerCase();
    let kbbiCache = db.get('kbbi_cache') || {};
    
    const cachedResult = kbbiCache[lowerCaseWord];
    if (cachedResult === true) {
        return true;
    }
    
    try {
        const url = `https://express-vercel-ytdl.vercel.app/cekata?text=${encodeURIComponent(lowerCaseWord)}`;
        const response = await axios.get(url);

        const isValid = response.data?.valid === true;
        
        kbbiCache[lowerCaseWord] = isValid;
        db.save('kbbi_cache', kbbiCache);
        
        return isValid;
    } catch (error) {
        logger.error(error, `Gagal memvalidasi kata "${lowerCaseWord}" menggunakan API cekata.`);
        return false;
    }
}

function getStartingLetters(word) {
    return word.slice(-2).toLowerCase();
}

function getRandomWord() {
    const words = ['rumah', 'buku', 'apel', 'meja', 'kursi', 'pintu', 'kaca', 'awan', 'bumi', 'air', 'api', 'tanah'];
    return words[Math.floor(Math.random() * words.length)];
}

async function endGame(sock, groupJid, game, loserJid, reason, activeSambungKataGames) {
    clearTimeout(game.timeout);
    let usersDb = db.get('users');
    const { winner: winnerReward, loser: loserReward } = gameConfig.rewards.sambungkata;

    const winners = game.players.filter(p => p !== loserJid);
    let mentions = [loserJid];
    let resultText = `❌ *Permainan Selesai!* ❌\n\n@${loserJid.split('@')[0]} telah kalah karena *${reason}*.\n\n`;

    const loserUser = usersDb[loserJid] || { xp: 0 };
    loserUser.xp = (loserUser.xp || 0) + loserReward.xp;
    usersDb[loserJid] = loserUser;

    if (winners.length > 0) {
        resultText += '🏆 *Para Pemenang:*\n';
        winners.forEach(winnerJid => {
            const winnerUser = usersDb[winnerJid] || { balance: 0, xp: 0 };
            winnerUser.balance = (winnerUser.balance || 0) + winnerReward.balance;
            winnerUser.xp = (winnerUser.xp || 0) + winnerReward.xp;
            usersDb[winnerJid] = winnerUser;
            resultText += `- @${winnerJid.split('@')[0]}\n`;
            mentions.push(winnerJid);
        });
        resultText += `\nSetiap pemenang mendapatkan *Rp ${winnerReward.balance.toLocaleString()}* dan *${winnerReward.xp} XP*!`;
    } else {
        resultText += `Tidak ada pemenang dalam permainan ini.`;
    }

    await sock.sendMessage(groupJid, { text: resultText, mentions });
    db.save('users', usersDb);
    activeSambungKataGames.delete(groupJid);
}

async function nextTurn(sock, groupJid, game, activeSambungKataGames) {
    clearTimeout(game.timeout);
    const currentPlayerJid = game.players[game.turnIndex];
    const startingLetters = getStartingLetters(game.currentWord);

    const turnMessage = `🗣️ Giliran @${currentPlayerJid.split('@')[0]}!\n\n` +
                        `Kata terakhir: *${game.currentWord}*\n` +
                        `Sambung kata dari: *"${startingLetters}"*\n\n` +
                        `Balas pesan ini dengan jawabanmu.\n` +
                        `⏳ *Waktu: 30 detik*`;

    await sock.sendMessage(groupJid, { text: turnMessage, mentions: [currentPlayerJid] });

    game.timeout = setTimeout(() => {
        const currentGame = activeSambungKataGames.get(groupJid);
        if (currentGame && currentGame.phase === 'playing' && currentGame.players[currentGame.turnIndex] === currentPlayerJid) {
            endGame(sock, groupJid, currentGame, currentPlayerJid, "kehabisan waktu", activeSambungKataGames);
        }
    }, TURN_TIMEOUT);

    activeSambungKataGames.set(groupJid, game);
}

module.exports = {
  command: ['sambungkata'],
  description: 'Bermain game sambung kata.',
  category: 'Game',
  run: async (sock, message, args, { activeSambungKataGames, isGameReply }) => {
    const groupJid = message.from;
    const senderJid = message.sender;
    let game = activeSambungKataGames.get(groupJid);
    
    if (isGameReply) {
        if (!game || game.phase !== 'playing') return;

        clearTimeout(game.timeout);
        const answer = args[0]?.toLowerCase();
        
        if (!answer) {
            await sock.sendMessage(groupJid, { text: 'Jawaban tidak boleh kosong!' });
            await nextTurn(sock, groupJid, game, activeSambungKataGames);
            return;
        }

        if (!answer.startsWith(getStartingLetters(game.currentWord))) {
            return endGame(sock, groupJid, game, senderJid, `jawaban tidak dimulai dengan suku kata yang benar`, activeSambungKataGames);
        }
        if (game.usedWords.has(answer)) {
            return endGame(sock, groupJid, game, senderJid, 'kata sudah pernah digunakan', activeSambungKataGames);
        }
        
        await sock.sendMessage(message.from, { react: { text: '🔎', key: message.key } });

        const isValid = await checkKBBI(answer);

        if (!isValid) {
            return endGame(sock, groupJid, game, senderJid, `kata "${answer}" tidak ditemukan di KBBI`, activeSambungKataGames);
        }
        
        await sock.sendMessage(message.from, { react: { text: '✅', key: message.key } });
        
        game.currentWord = answer;
        game.usedWords.add(answer);
        game.turnIndex = (game.turnIndex + 1) % game.players.length;
        await nextTurn(sock, groupJid, game, activeSambungKataGames);
        return;
    }

    const subCommand = args[0]?.toLowerCase();
    switch (subCommand) {
        case 'join':
            if (game && game.phase === 'playing') return message.reply('Permainan sudah dimulai, tidak bisa bergabung.');
            if (!game) {
                game = { players: [senderJid], phase: 'joining', host: senderJid, usedWords: new Set() };
                activeSambungKataGames.set(groupJid, game);
                return sock.sendMessage(groupJid, { text: `📝 Lobi *Sambung Kata* dibuat oleh @${senderJid.split('@')[0]}!\nKetik \`.sambungkata join\` untuk bergabung.`, mentions: [senderJid] });
            }
            if (game.players.includes(senderJid)) return message.reply('Anda sudah di dalam lobi.');
            game.players.push(senderJid);
            activeSambungKataGames.set(groupJid, game);
            return sock.sendMessage(groupJid, { text: `✅ @${senderJid.split('@')[0]} berhasil bergabung! (${game.players.length} pemain)`, mentions: [senderJid] });
        
        case 'start':
            if (!game || game.phase !== 'joining') return message.reply('Tidak ada lobi yang aktif.');
            if (game.host !== senderJid) return sock.sendMessage(groupJid, { text: `Hanya host (@${game.host.split('@')[0]}) yang bisa memulai.`, mentions: [game.host] });
            if (game.players.length < MIN_PLAYERS) return message.reply(`Butuh minimal ${MIN_PLAYERS} pemain.`);
            
            game.phase = 'playing';
            game.currentWord = getRandomWord();
            game.usedWords.add(game.currentWord);
            game.turnIndex = 0;
            await message.reply(`🎉 *Permainan Sambung Kata Dimulai!* 🎉`);
            await nextTurn(sock, groupJid, game, activeSambungKataGames);
            break;

        case 'stop':
            if (!game) return message.reply('Tidak ada permainan untuk dihentikan.');
            if (game.host !== senderJid) return message.reply('Hanya host yang bisa menghentikan permainan.');
            clearTimeout(game.timeout);
            activeSambungKataGames.delete(groupJid);
            return message.reply('Permainan Sambung Kata telah dihentikan oleh host.');

        default:
            if (activeSambungKataGames.has(groupJid)) {
                return message.reply(`Permainan Sambung Kata sedang berlangsung. Balas pesan giliran untuk menjawab atau ketik \`.sambungkata stop\` untuk menghentikan (khusus host).`);
            }
            return message.reply(
                `*🎮 Game Sambung Kata 🎮*\n\n` +
                `Sebuah permainan kata di mana pemain harus menyambung kata dari dua huruf terakhir kata sebelumnya.\n\n` +
                `*Perintah:*\n` +
                `- \`${config.prefix}sambungkata join\`: Membuat atau bergabung ke lobi permainan.\n` +
                `- \`${config.prefix}sambungkata start\`: Memulai permainan dari lobi (hanya host).\n` +
                `- \`${config.prefix}sambungkata stop\`: Menghentikan permainan (hanya host).\n\n` +
                `_Setelah permainan dimulai, cukup balas pesan dari bot untuk menjawab._`
            );
    }
  }
};