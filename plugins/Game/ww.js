const { LRUCache } = require('lru-cache');
const config = require('../../config');

const activeWWGames = new LRUCache({ max: 100, ttl: 1000 * 60 * 60 * 3 });
const MIN_PLAYERS = 5;

function getPlayerList(game) {
    let list = '👥 *Daftar Pemain:*\n';
    const mentions = [];
    const sortedPlayers = Object.entries(game.players).sort(([, a], [, b]) => a.number - b.number);

    for (const [jid, player] of sortedPlayers) {
        mentions.push(jid);
        const name = `@${jid.split('@')[0]}`;
        if (player.status === 'dead') {
            list += `*${player.number}.* ~${name}~ (Tewas)\n`;
        } else {
            list += `*${player.number}.* ${name}\n`;
        }
    }
    return { text: list, mentions };
}

function assignRoles(playerJids) {
    const roles = [];
    const numPlayers = playerJids.length;
    
    let numWerewolves = 1;
    if (numPlayers >= 8) numWerewolves = 2;
    if (numPlayers >= 14) numWerewolves = 3;
    
    const specialRoles = [];
    if (numPlayers >= 5) specialRoles.push('Seer');
    if (numPlayers >= 6) specialRoles.push('Guardian');
    if (numPlayers >= 7) specialRoles.push('Healer');

    for (let i = 0; i < numWerewolves; i++) roles.push('Werewolf');
    specialRoles.forEach(role => roles.push(role));
    while (roles.length < numPlayers) roles.push('Villager');

    for (let i = roles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [roles[i], roles[j]] = [roles[j], roles[i]];
    }

    const playerRoles = {};
    playerJids.forEach((jid, index) => {
        playerRoles[jid] = roles[index];
    });
    return playerRoles;
}

async function checkWinCondition(sock, game) {
    const alivePlayers = Object.values(game.players).filter(p => p.status === 'alive');
    const aliveWerewolves = alivePlayers.filter(p => p.role === 'Werewolf');
    const aliveVillagers = alivePlayers.filter(p => p.role !== 'Werewolf');

    let winner = null;
    if (aliveWerewolves.length === 0) {
        winner = 'Tim Warga Desa';
    } else if (aliveWerewolves.length >= aliveVillagers.length) {
        winner = 'Tim Werewolf';
    }

    if (winner) {
        if (game.phaseTimeout) clearTimeout(game.phaseTimeout);
        let endMessage = `🎊 *PERMAINAN BERAKHIR* 🎊\n\nPemenangnya adalah *${winner}*!\n\n`;
        endMessage += '📜 *Daftar Peran Akhir:*\n';
        for (const jid in game.players) {
            const p = game.players[jid];
            const roleEmoji = p.role === 'Werewolf' ? '🐺' : p.role === 'Seer' ? '👁️' : p.role === 'Guardian' ? '🛡️' : p.role === 'Healer' ? '❤️‍🩹' : '🧑‍🌾';
            const status = p.status === 'alive' ? '' : '_(Tewas)_';
            endMessage += `${roleEmoji} @${jid.split('@')[0]} sebagai *${p.role}* ${status}\n`;
        }
        await sock.sendMessage(game.groupId, { text: endMessage, mentions: Object.keys(game.players) });
        activeWWGames.delete(game.groupId);
        return true;
    }
    return false;
}

async function advanceToDay(sock, game) {
    if (game.phaseTimeout) clearTimeout(game.phaseTimeout);
    game.phase = 'day';
    game.dayVotes = {};

    let victimJid = null;
    if (game.day > 0) {
        const voteCounts = {};
        for (const voterJid in game.werewolf.votes) {
            const votedJid = game.werewolf.votes[voterJid];
            voteCounts[votedJid] = (voteCounts[votedJid] || 0) + 1;
        }

        let maxVotes = 0;
        let tiedVictims = [];
        for (const jid in voteCounts) {
            if (voteCounts[jid] > maxVotes) {
                maxVotes = voteCounts[jid];
                tiedVictims = [jid];
            } else if (voteCounts[jid] === maxVotes) {
                tiedVictims.push(jid);
            }
        }
        if (tiedVictims.length === 1) {
            victimJid = tiedVictims[0];
        }
    }

    let dayMessage = `☀️ *Fajar Hari ke-${game.day}*\n\n`;
    let isSavedByGuardian = victimJid === game.guardian.protected;
    let isSavedByHealer = victimJid === game.healer.healed;
    let mentions = [];

    if (victimJid && !isSavedByGuardian && !isSavedByHealer) {
        game.players[victimJid].status = 'dead';
        dayMessage += `Tragedi terjadi di keheningan malam. @${victimJid.split('@')[0]} ditemukan tewas.\nBeliau adalah seorang *${game.players[victimJid].role}*.`;
        mentions.push(victimJid);
    } else {
        dayMessage += `Malam berlalu dengan tenang. `;
        if (isSavedByGuardian) dayMessage += `Sebuah serangan berhasil digagalkan oleh sang Penjaga! `;
        if (isSavedByHealer) dayMessage += `Seseorang yang terluka parah berhasil disembuhkan!`;
        if (game.day > 0 && !victimJid) {
            dayMessage += `Para werewolf tampaknya tidak sepakat, tidak ada serangan malam ini.`;
        }
    }
    
    await sock.sendMessage(game.groupId, { text: dayMessage, mentions: mentions });

    game.seer.canSee = true;
    game.guardian.canProtect = true;
    game.guardian.lastProtected = game.guardian.protected;
    game.guardian.protected = null;
    game.healer.canHeal = true;
    game.healer.healed = null;

    if (await checkWinCondition(sock, game)) return;
    
    let { text: playerListText, mentions: playerMentions } = getPlayerList(game);
    let discussionMessage = `\n\n🔎 *Waktunya Diskusi & Voting!*\nKalian punya waktu untuk berdebat dan menemukan serigala berbulu domba.\n\n${playerListText}\n\nGunakan \`${config.prefix}vote <nomor>\` untuk memilih siapa yang akan dieksekusi.\n\n*Waktu: 60 detik*`;
    
    await sock.sendMessage(game.groupId, { text: discussionMessage, mentions: playerMentions });
    
    game.phaseTimeout = setTimeout(() => {
        const currentGame = activeWWGames.get(game.groupId);
        if (currentGame && currentGame.phase === 'day' && currentGame.day === game.day) {
            advanceToNight(sock, currentGame);
        }
    }, 60 * 1000); 
}

async function advanceToNight(sock, game) {
    if (game.phaseTimeout) clearTimeout(game.phaseTimeout);
    game.phase = 'night';
    game.day++;
    
    let victimJid = null;
    let isTie = false;
    
    const voteCounts = {};
    for (const voterJid in game.dayVotes) {
        const votedNumber = game.dayVotes[voterJid];
        voteCounts[votedNumber] = (voteCounts[votedNumber] || 0) + 1;
    }

    const sortedVotes = Object.entries(voteCounts).sort(([, a], [, b]) => b - a);

    if (sortedVotes.length > 0) {
        const maxVotes = sortedVotes[0][1];
        isTie = sortedVotes.length > 1 && sortedVotes[1][1] === maxVotes;

        if (!isTie) {
            const targetNumber = parseInt(sortedVotes[0][0]);
            const targetPlayer = Object.values(game.players).find(p => p.number === targetNumber && p.status === 'alive');
            if (targetPlayer) {
                victimJid = Object.keys(game.players).find(jid => game.players[jid] === targetPlayer);
            }
        }
    }

    let nightMessage = '';
    let mentions = [];

    if (victimJid) {
        game.players[victimJid].status = 'dead';
        nightMessage = `⚖️ *Hasil Voting* ⚖️\nWarga desa telah memutuskan! @${victimJid.split('@')[0]} dieksekusi.\nTerungkap bahwa dia adalah seorang *${game.players[victimJid].role}*.`;
        mentions.push(victimJid);
    } else if (isTie) {
        nightMessage = 'Hasil voting seimbang! Tidak ada yang dieksekusi hari ini.';
    } else {
        nightMessage = 'Warga desa memilih untuk tidak melakukan voting. Tidak ada yang dieksekusi hari ini.';
    }
    
    game.dayVotes = {};
    await sock.sendMessage(game.groupId, { text: nightMessage, mentions });

    if (await checkWinCondition(sock, game)) return;

    let transitionMessage = `\n\n🌙 *Malam Hari ke-${game.day}*\n\nDesa kembali diselimuti kegelapan. Semua warga tertidur, saatnya para pemilik kekuatan beraksi.`;
    await sock.sendMessage(game.groupId, { text: transitionMessage });

    const { text: playerListText, mentions: playerMentions } = getPlayerList(game);
    const roles = ['Werewolf', 'Seer', 'Guardian', 'Healer'];
    const roleInstructions = {
        'Werewolf': '🐺 Tentukan mangsa kalian bersama-sama.',
        'Seer': '👁️ Gunakan penglihatanmu untuk mengungkap peran seseorang.',
        'Guardian': '🛡️ Lindungi satu nyawa dari ancaman malam ini.',
        'Healer': '❤️‍🩹 Siapkan ramuan penyembuh untuk seseorang.'
    };
    const roleCommands = {
        'Werewolf': 'vote', 'Seer': 'lihat', 'Guardian': 'lindungi', 'Healer': 'sembuhkan'
    };

    game.werewolf.votes = {};
    for (const jid in game.players) {
        const player = game.players[jid];
        if (player.status === 'alive' && roles.includes(player.role)) {
            const instruction = `${roleInstructions[player.role]}\n\n${playerListText}\nPM saya dengan \`.${roleCommands[player.role]} <nomor>\``;
            await sock.sendMessage(jid, { text: instruction, mentions: playerMentions });
        }
    }

    game.phaseTimeout = setTimeout(() => {
        const currentGame = activeWWGames.get(game.groupId);
        if (currentGame && currentGame.phase === 'night' && currentGame.day === game.day) {
            advanceToDay(sock, currentGame);
        }
    }, 60 * 1000); 
}

module.exports = {
    command: ['werewolf', 'ww', 'vote', 'lihat', 'lindungi', 'sembuhkan'],
    description: 'Bermain game Werewolf dengan sistem ID.',
    category: 'Game',
    run: async (sock, message, args) => {
        const command = message.body.slice(config.prefix.length).trim().split(/ +/)[0].toLowerCase();
        const senderJid = message.sender;
        
        let game, gameId;
        if (message.isGroup) {
            gameId = message.from;
            game = activeWWGames.get(gameId);
        } else {
            for (const [key, g] of activeWWGames.entries()) {
                if (g.players[senderJid]) {
                    game = g;
                    gameId = key;
                    break;
                }
            }
        }
        
        if (command === 'werewolf' || command === 'ww') {
            const subCommand = args[0]?.toLowerCase();
            switch (subCommand) {
                case 'join':
                    if (game && game.phase !== 'joining') return message.reply('⏳ Game sudah dimulai, tidak bisa bergabung.');
                    if (!game) {
                        game = {
                            groupId: message.from, host: senderJid, phase: 'joining', players: {}, day: 0,
                            werewolf: {}, seer: { canSee: true }, guardian: { canProtect: true, protected: null, lastProtected: null }, healer: { canHeal: true, healed: null },
                            dayVotes: {}, phaseTimeout: null
                        };
                        activeWWGames.set(message.from, game);
                        await sock.sendMessage(message.from, { text: `Sebuah permainan Werewolf baru telah dibuat oleh @${senderJid.split('@')[0]}!\n\nKetik \`${config.prefix}ww join\` untuk bergabung.`, mentions: [senderJid] });
                    }
                    if (game.players[senderJid]) return message.reply('✅ Anda sudah bergabung dalam permainan ini.');
                    
                    game.players[senderJid] = { name: message.pushName, status: 'alive' };
                    const currentPlayerCount = Object.keys(game.players).length;
                    const joinMessage = `✅ @${senderJid.split('@')[0]} berhasil bergabung! (*${currentPlayerCount}/${MIN_PLAYERS}*)`;
                    
                    const allPlayerJids = Object.keys(game.players);
                    await sock.sendMessage(game.groupId, { text: joinMessage, mentions: allPlayerJids });
                    break;

                case 'start':
                    if (!game || game.phase !== 'joining') return message.reply('⚠️ Tidak ada game yang sedang menunggu pemain.');
                    if (game.host !== senderJid) return sock.sendMessage(message.from, { text: '⚠️ Hanya host (@' + game.host.split('@')[0] + ') yang bisa memulai game.', mentions: [game.host]});
                    if (Object.keys(game.players).length < MIN_PLAYERS) return message.reply(`⚠️ Minimal butuh ${MIN_PLAYERS} pemain untuk memulai permainan yang seru.`);
                    
                    const pJids = Object.keys(game.players);
                    const roles = assignRoles(pJids);
                    let playerNumber = 1;

                    for (const jid of pJids) {
                        game.players[jid].role = roles[jid];
                        game.players[jid].number = playerNumber++;
                        
                        let roleDesc = 'Tugasmu adalah bertahan hidup, menemukan, dan mengeksekusi semua Werewolf.';
                        if (roles[jid] === 'Werewolf') roleDesc = 'Tugasmu adalah menyamar dan membunuh semua warga desa hingga jumlah kalian seimbang.';
                        if (roles[jid] === 'Seer') roleDesc = 'Setiap malam, gunakan penglihatanmu untuk mengungkap peran satu pemain.';
                        if (roles[jid] === 'Guardian') roleDesc = 'Setiap malam, lindungi satu nyawa dari terkaman Werewolf.';
                        if (roles[jid] === 'Healer') roleDesc = 'Setiap malam, siapkan ramuan penyembuh untuk satu pemain yang mungkin diserang.';
                        await sock.sendMessage(jid, { text: `🤫 Peran rahasiamu adalah: *${roles[jid]}*\nNomor permanenmu adalah *${game.players[jid].number}*.\n\n${roleDesc}`});
                    }

                    game.phase = 'setup';
                    await message.reply('⚔️ Game telah dimulai! Peran rahasia dan nomor permanen telah dibagikan melalui PM. Bersiaplah, malam pertama akan segera tiba...');
                    game.phaseTimeout = setTimeout(() => advanceToNight(sock, game), 5000);
                    break;
                
                case 'list':
                     if (!game || game.phase === 'joining') return message.reply('Game belum dimulai. Gunakan `.ww join` untuk bergabung.');
                     const { text: playerListText, mentions } = getPlayerList(game);
                     return sock.sendMessage(message.from, { text: playerListText, mentions });
                
                case 'quit':
                case 'stop':
                    if (!game) return message.reply('Tidak ada game yang sedang berjalan.');
                    if (game.host !== senderJid) return message.reply('Hanya host yang bisa menghentikan game.');
                    if (game.phaseTimeout) clearTimeout(game.phaseTimeout);
                    activeWWGames.delete(gameId);
                    return message.reply('🛑 Game telah dihentikan paksa oleh host.');
                    
                default:
                    return message.reply(`🐺 *WEREWOLF GAME* 🐺\n\nSelamat datang di desa yang penuh misteri!\n\n*Perintah Dasar:*\n- \`${config.prefix}ww join\`: Bergabung ke sesi game.\n- \`${config.prefix}ww start\`: Memulai game (hanya host).\n- \`${config.prefix}ww list\`: Melihat daftar pemain.\n- \`${config.prefix}ww quit\`: Menghentikan game (hanya host).`);
            }
            return;
        }

        if (!game) return;
        if (!game.players[senderJid] || game.players[senderJid].status !== 'alive') return message.reply('Anda tidak sedang bermain atau sudah tewas.');
        
        const playerNumber = parseInt(args[0]);
        if (isNaN(playerNumber)) return message.reply('Gunakan format yang benar, contoh: `.' + command + ' 5`');

        const target = Object.values(game.players).find(p => p.number === playerNumber);
        if (!target) return message.reply('Nomor pemain tidak valid.');
        if (target.status === 'dead') {
             return message.reply('❌ Kamu tidak bisa menargetkan pemain yang sudah tewas!');
        }

        const targetJid = Object.keys(game.players).find(jid => game.players[jid] === target);

        if (game.phase === 'day') {
            if (!message.isGroup) return;
            if (command !== 'vote') return;
            if (game.dayVotes[senderJid]) return message.reply('Anda sudah memberikan suara hari ini.');
            game.dayVotes[senderJid] = playerNumber;
            return sock.sendMessage(gameId, { text: `🗳️ @${senderJid.split('@')[0]} telah memberikan suara untuk mengeksekusi no. ${playerNumber} (@${targetJid.split('@')[0]}).`, mentions: [senderJid, targetJid]});
        }
        
        if (game.phase === 'night') {
            if (message.isGroup) return message.reply('🤫 Aksi malam hari harus dilakukan melalui PM ke bot.');
            if (targetJid === senderJid && command !== 'lindungi' && command !== 'sembuhkan') return message.reply('❌ Anda tidak bisa menargetkan diri sendiri untuk aksi ini.');

            const playerRole = game.players[senderJid].role;
            switch(command) {
                case 'vote':
                    if (playerRole === 'Werewolf') {
                        if (game.werewolf.votes[senderJid]) return message.reply('Anda sudah memilih target malam ini.');
                        game.werewolf.votes[senderJid] = targetJid;
                        await message.reply(`👍 Pilihanmu untuk membunuh no. ${playerNumber} telah dicatat.`);
                    }
                    break;
                case 'lihat':
                    if (playerRole === 'Seer' && game.seer.canSee) {
                        game.seer.canSee = false;
                        await message.reply(`🔮 Penglihatanmu menembus kegelapan...\nPeran dari pemain no. ${playerNumber} adalah... *${target.role}*!`);
                    } else if (playerRole === 'Seer') {
                        await message.reply('💤 Kekuatanmu butuh istirahat, hanya bisa digunakan sekali semalam.');
                    }
                    break;
                case 'lindungi':
                    if (playerRole === 'Guardian' && game.guardian.canProtect) {
                        if (targetJid === game.guardian.lastProtected) return message.reply('🛡️ Anda tidak bisa melindungi orang yang sama dua malam berturut-turut.');
                        game.guardian.protected = targetJid;
                        game.guardian.canProtect = false;
                        await message.reply(`🛡️ Anda mengerahkan kekuatan untuk melindungi no. ${playerNumber} malam ini.`);
                    } else if (playerRole === 'Guardian') {
                        await message.reply('💤 Kekuatanmu butuh istirahat, hanya bisa digunakan sekali semalam.');
                    }
                    break;
                case 'sembuhkan':
                    if (playerRole === 'Healer' && game.healer.canHeal) {
                        game.healer.healed = targetJid;
                        game.healer.canHeal = false;
                        await message.reply(`❤️‍🩹 Anda menyiapkan ramuan penyembuh untuk no. ${playerNumber} malam ini.`);
                    } else if (playerRole === 'Healer') {
                        await message.reply('💤 Ramuanmu sudah habis, hanya bisa digunakan sekali semalam.');
                    }
                    break;
            }
        }
    }
};