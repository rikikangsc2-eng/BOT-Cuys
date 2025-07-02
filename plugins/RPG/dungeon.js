const db = require('../../lib/database');
const { LRUCache } = require('lru-cache');
const gameConfig = require('../../gameConfig');
const { calculatePower, applyDurabilityLoss } = require('../../lib/rpgUtils');
const config = require('../../config');

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;

const getPartyLeader = (playerJid, activeDungeons) => {
    if (!activeDungeons) return null;
    for (const [leaderJid, party] of activeDungeons.entries()) {
        if (party.members.includes(playerJid)) {
            return { leaderJid, party };
        }
    }
    return null;
};

module.exports = {
    command: 'dungeon',
    description: 'Bekerja sama dalam tim untuk menaklukkan dungeon dan mendapatkan loot langka.',
    category: 'RPG',
    run: async (sock, message, args, { activeDungeons }) => {
        const action = args[0]?.toLowerCase();
        const senderJid = message.sender;
        let usersDb = db.get('users');
        const user = usersDb[senderJid] || {};

        const partyInfo = getPartyLeader(senderJid, activeDungeons);

        switch (action) {
            case 'create':
                const dungeonType = args[1]?.toLowerCase();
                if (activeDungeons.has(senderJid)) return message.reply('Anda sudah membuat party. Bubarkan dulu jika ingin membuat yang baru.');
                if (partyInfo) return message.reply('Anda sudah bergabung di party lain.');
                if (!dungeonType || !gameConfig.dungeons[dungeonType]) {
                    let availableDungeons = 'Gunakan format `.dungeon create <tipe>`.\n\nTipe Dungeon Tersedia:\n';
                    for (const key in gameConfig.dungeons) {
                        availableDungeons += `- *${key}*\n`;
                    }
                    return message.reply(availableDungeons);
                }

                const entryCost = gameConfig.dungeons[dungeonType].entryCost;
                if ((user[entryCost.item]?.amount || 0) < entryCost.amount) {
                    return message.reply(`Anda tidak memiliki kunci untuk masuk! Butuh: *${entryCost.amount}x ${entryCost.item}*`);
                }
                user[entryCost.item].amount -= entryCost.amount;
                usersDb[senderJid] = user;
                db.save('users', usersDb);

                activeDungeons.set(senderJid, {
                    leader: senderJid,
                    dungeonType: dungeonType,
                    phase: 'lobby',
                    members: [senderJid],
                    groupId: message.from
                });
                return message.reply(`Party untuk *${gameConfig.dungeons[dungeonType].name}* telah dibuat!\nAnggota lain bisa bergabung dengan \`.dungeon join @${senderJid.split('@')[0]}\``);

            case 'join':
                const leaderJidToJoin = message.msg?.contextInfo?.mentionedJid?.[0];
                if (!leaderJidToJoin) return message.reply('Tag pemimpin party yang ingin kamu masuki.');
                if (partyInfo) return message.reply('Anda sudah berada di dalam party.');
                
                const partyToJoin = activeDungeons.get(leaderJidToJoin);
                if (!partyToJoin) return message.reply('Party tidak ditemukan atau sudah dibubarkan.');
                if (partyToJoin.phase !== 'lobby') return message.reply('Party ini sudah memulai petualangannya!');
                if (partyToJoin.members.length >= MAX_PLAYERS) return message.reply('Party sudah penuh.');

                partyToJoin.members.push(senderJid);
                activeDungeons.set(leaderJidToJoin, partyToJoin);
                return sock.sendMessage(message.from, { text: `@${senderJid.split('@')[0]} telah bergabung dengan party!`, mentions: [senderJid] });

            case 'start':
                const partyToStart = activeDungeons.get(senderJid);
                if (!partyToStart || partyToStart.leader !== senderJid) return message.reply('Hanya pemimpin party yang bisa memulai dungeon.');
                if (partyToStart.phase !== 'lobby') return message.reply('Pertarungan sudah dimulai!');
                if (partyToStart.members.length < MIN_PLAYERS) return message.reply(`Butuh minimal ${MIN_PLAYERS} pemain untuk memulai.`);
                
                const dungeonConfig = gameConfig.dungeons[partyToStart.dungeonType];
                partyToStart.phase = 'battle';
                partyToStart.turnIndex = 0;
                partyToStart.bossHP = dungeonConfig.bossHP;
                partyToStart.maxBossHP = dungeonConfig.bossHP;
                partyToStart.battleLog = ["Pertarungan dimulai!"];
                
                const firstPlayerJid = partyToStart.members[partyToStart.turnIndex];
                
                let startText = `⚔️ *${dungeonConfig.name}: Pertarungan Dimulai!* ⚔️\n\n` +
                    `Sesosok makhluk raksasa muncul dari kegelapan!\n\n` +
                    `*HP Boss:* ${partyToStart.bossHP.toLocaleString()} / ${partyToStart.maxBossHP.toLocaleString()}\n` +
                    `Giliran pertama: @${firstPlayerJid.split('@')[0]}\n\n` +
                    `Ketik \`${config.prefix}attack\` untuk menyerang!`;

                const sentMsg = await sock.sendMessage(message.from, { text: startText, mentions: partyToStart.members });
                partyToStart.lastMessageId = sentMsg.key.id;
                
                activeDungeons.set(senderJid, partyToStart);
                break;
            
            case 'leave':
            case 'disband':
                if (!partyInfo) return message.reply('Anda tidak sedang berada di dalam party.');

                const { leaderJid, party } = partyInfo;

                if (party.phase === 'battle') {
                    return message.reply('Tidak bisa meninggalkan party saat pertarungan sedang berlangsung!');
                }

                if (senderJid === leaderJid) {
                    const entryCostInfo = gameConfig.dungeons[party.dungeonType].entryCost;
                    const leaderUser = usersDb[leaderJid];
                    if (!leaderUser[entryCostInfo.item]) leaderUser[entryCostInfo.item] = { amount: 0 };
                    leaderUser[entryCostInfo.item].amount += entryCostInfo.amount;
                    usersDb[leaderJid] = leaderUser;
                    db.save('users', usersDb);
                    
                    activeDungeons.delete(leaderJid);
                    return message.reply(`Party dibubarkan oleh pemimpin. Kunci masuk telah dikembalikan.`);
                } else {
                    party.members = party.members.filter(jid => jid !== senderJid);
                    activeDungeons.set(leaderJid, party);
                    return message.reply(`Anda telah meninggalkan party.`);
                }

            default:
                if (partyInfo) {
                    const { party } = partyInfo;
                    const dungeonConf = gameConfig.dungeons[party.dungeonType];
                    let statusText;
                    if (party.phase === 'battle') {
                        const currentPlayerJid = party.members[party.turnIndex];
                        statusText = `*Status Pertarungan: ${dungeonConf.name}*\n\n` +
                            `*HP Boss:* ${party.bossHP.toLocaleString()} / ${party.maxBossHP.toLocaleString()}\n` +
                            `*Giliran Menyerang:* @${currentPlayerJid.split('@')[0]}\n\n` +
                            `*Log Terakhir:*\n_${party.battleLog[party.battleLog.length - 1]}_`;
                    } else {
                        statusText = `*Status Party Anda (Lobby):*\n\n` +
                            `*Dungeon:* ${dungeonConf.name}\n` +
                            `*Leader:* @${party.leader.split('@')[0]}\n` +
                            `*Anggota (${party.members.length}/${MAX_PLAYERS}):*\n` +
                            party.members.map(jid => `- @${jid.split('@')[0]}`).join('\n');
                    }
                    await sock.sendMessage(message.from, { text: statusText, mentions: party.members });
                } else {
                    let helpText = `*Sistem Dungeon & Party*\n\nBentuk tim untuk menaklukkan tantangan berat dan dapatkan hadiah eksklusif!\n\n` +
                    `*Perintah:*\n` +
                    `• \`.dungeon create <tipe>\` - Membuat party baru (butuh kunci).\n` +
                    `• \`.dungeon join @leader\` - Bergabung dengan party.\n` +
                    `• \`.dungeon start\` - Memulai ekspedisi (hanya leader).\n` +
                    `• \`.dungeon leave\` - Keluar dari party.\n` +
                    `• \`.dungeon disband\` - Membubarkan party (hanya leader).`;
                    await message.reply(helpText);
                }
        }
    }
};