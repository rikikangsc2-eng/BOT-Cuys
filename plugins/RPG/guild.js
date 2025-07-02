const db = require('../../lib/database');
const config = require('../../config');
const gameConfig = require('../../gameConfig');

const GUILD_CREATION_COST = 2500000;
const MAX_MEMBERS = 20;

const ROLES = ['Member', 'Officer', 'Co-Owner', 'Owner'];

const getGuild = (guildName) => {
    const guilds = db.get('guilds') || {};
    return Object.values(guilds).find(g => g.name.toLowerCase() === guildName.toLowerCase());
};

const getPlayerGuild = (playerJid) => {
    const guilds = db.get('guilds') || {};
    return Object.values(guilds).find(g => g.members && g.members[playerJid]);
};

module.exports = {
    command: ['guild', 'g'],
    description: 'Mengelola Guild atau Clan.',
    category: 'RPG',
    run: async (sock, message, args) => {
        const action = args[0]?.toLowerCase();
        const senderJid = message.sender;

        let usersDb = db.get('users');
        let guildsDb = db.get('guilds') || {};
        const user = usersDb[senderJid] || { balance: 0 };
        const userGuild = getPlayerGuild(senderJid);

        if (userGuild && typeof userGuild.activeBuffs === 'undefined') {
            userGuild.activeBuffs = {};
        }

        const senderRole = userGuild ? userGuild.members[senderJid]?.role : null;
        const senderRoleLevel = ROLES.indexOf(senderRole);

        switch (action) {
            case 'create': {
                const guildName = args.slice(1).join(' ');
                if (userGuild) return message.reply(`Anda sudah berada di guild *${userGuild.name}*. Keluar dulu untuk membuat yang baru.`);
                if (!guildName || guildName.length < 3 || guildName.length > 20) return message.reply('Nama guild harus antara 3-20 karakter.');
                if (getGuild(guildName)) return message.reply(`Guild dengan nama *${guildName}* sudah ada.`);
                if (user.balance < GUILD_CREATION_COST) return message.reply(`Butuh *Rp ${GUILD_CREATION_COST.toLocaleString()}* untuk membuat guild.`);

                user.balance -= GUILD_CREATION_COST;
                const guildId = `guild_${Date.now()}`;
                guildsDb[guildId] = {
                    id: guildId,
                    name: guildName,
                    level: 1,
                    xp: 0,
                    owner: senderJid,
                    bank: 0,
                    members: {
                        [senderJid]: { role: 'Owner', joinedAt: Date.now() }
                    },
                    invites: [],
                    activeBuffs: {}
                };

                db.save('users', usersDb);
                db.save('guilds', guildsDb);
                return message.reply(`Selamat! Guild *${guildName}* berhasil didirikan!`);
            }

            case 'invite': {
                if (!userGuild || senderRoleLevel < ROLES.indexOf('Officer')) return message.reply('Hanya Officer atau jabatan di atasnya yang bisa mengundang anggota baru.');
                if (Object.keys(userGuild.members).length >= MAX_MEMBERS) return message.reply('Guild Anda sudah penuh.');
                const targetJid = message.msg?.contextInfo?.mentionedJid?.[0];
                if (!targetJid) return message.reply('Sebutkan (tag) pemain yang ingin Anda undang.');
                if (getPlayerGuild(targetJid)) return message.reply('Pemain tersebut sudah berada di guild lain.');
                if (userGuild.invites.includes(targetJid)) return message.reply('Anda sudah mengirim undangan ke pemain ini.');

                userGuild.invites.push(targetJid);
                guildsDb[userGuild.id] = userGuild;
                db.save('guilds', guildsDb);

                const inviteText = `@${targetJid.split('@')[0]}, Anda telah diundang untuk bergabung dengan guild *${userGuild.name}*.\n\nKetik \`.guild join ${userGuild.name}\` untuk menerima.`;
                return sock.sendMessage(message.from, { text: inviteText, mentions: [targetJid] });
            }

            case 'join': {
                const guildNameToJoin = args.slice(1).join(' ');
                if (userGuild) return message.reply(`Anda sudah berada di guild *${userGuild.name}*.`);
                if (!guildNameToJoin) return message.reply('Sebutkan nama guild yang ingin Anda masuki.');
                const targetGuild = getGuild(guildNameToJoin);
                if (!targetGuild) return message.reply(`Guild *${guildNameToJoin}* tidak ditemukan.`);
                if (!targetGuild.invites.includes(senderJid)) return message.reply('Anda tidak memiliki undangan untuk guild ini.');

                targetGuild.members[senderJid] = { role: 'Member', joinedAt: Date.now() };
                targetGuild.invites = targetGuild.invites.filter(id => id !== senderJid);
                guildsDb[targetGuild.id] = targetGuild;
                db.save('guilds', guildsDb);
                return message.reply(`Selamat datang di guild *${targetGuild.name}*!`);
            }

            case 'leave': {
                if (!userGuild) return message.reply('Anda tidak berada di guild manapun.');
                if (userGuild.owner === senderJid && Object.keys(userGuild.members).length > 1) {
                    return message.reply('Anda adalah Owner. Pindahkan kepemilikan atau keluarkan semua anggota sebelum meninggalkan guild.');
                }

                if (userGuild.owner === senderJid) {
                    delete guildsDb[userGuild.id];
                } else {
                    delete userGuild.members[senderJid];
                    guildsDb[userGuild.id] = userGuild;
                }
                db.save('guilds', guildsDb);
                return message.reply(`Anda telah meninggalkan guild *${userGuild.name}*.`);
            }

            case 'info': {
                const guildToShow = userGuild;
                if (!guildToShow) return message.reply('Anda tidak berada di guild manapun. Ketik `.guild info <nama_guild>` untuk melihat guild lain.');

                let infoText = `📜 *Profil Guild: ${guildToShow.name}*\n\n` +
                    `👑 *Owner:* @${guildToShow.owner.split('@')[0]}\n` +
                    `👥 *Anggota:* ${Object.keys(guildToShow.members).length}/${MAX_MEMBERS}\n` +
                    `🏦 *Bank Guild:* Rp ${guildToShow.bank.toLocaleString()}\n` +
                    `🎖️ *Level Guild:* ${guildToShow.level} (*${guildToShow.xp} XP*)\n\n`;

                let activeBuffsText = "*Buff Aktif:*\n";
                let hasActiveBuffs = false;
                const now = Date.now();
                if (guildToShow.activeBuffs) {
                    for (const buffKey in guildToShow.activeBuffs) {
                        const buff = guildToShow.activeBuffs[buffKey];
                        const originalBuffKey = Object.keys(gameConfig.guildBuffs).find(k => k.toLowerCase() === buffKey.toLowerCase());
                        
                        if (buff && originalBuffKey && buff.expires > now) {
                            hasActiveBuffs = true;
                            const buffInfo = gameConfig.guildBuffs[originalBuffKey];
                            const timeLeftMs = buff.expires - now;
                            const hours = Math.floor(timeLeftMs / 3600000);
                            const minutes = Math.floor((timeLeftMs % 3600000) / 60000);
                            activeBuffsText += `- *${buffInfo.name}* (Sisa waktu: ${hours}j ${minutes}m)\n`;
                        }
                    }
                }
                if (!hasActiveBuffs) {
                    activeBuffsText += "_Tidak ada buff aktif._\n";
                }
                infoText += activeBuffsText + '\n';
                
                infoText += `*Anggota:*\n`;
                let mentions = [guildToShow.owner];
                for (const jid in guildToShow.members) {
                    const member = guildToShow.members[jid];
                    infoText += `- @${jid.split('@')[0]} (${member.role})\n`;
                    if (!mentions.includes(jid)) mentions.push(jid);
                }
                return sock.sendMessage(message.from, { text: infoText, mentions });
            }

            case 'kick': {
                if (!userGuild || senderRoleLevel < ROLES.indexOf('Co-Owner')) return message.reply('Hanya Co-Owner atau Owner yang bisa mengeluarkan anggota.');
                const targetJid = message.msg?.contextInfo?.mentionedJid?.[0];
                if (!targetJid || targetJid === senderJid) return message.reply('Sebutkan anggota yang ingin dikeluarkan.');
                if (!userGuild.members[targetJid]) return message.reply('Pemain tersebut bukan anggota guild Anda.');

                const targetRoleLevel = ROLES.indexOf(userGuild.members[targetJid].role);
                if(senderRoleLevel <= targetRoleLevel) return message.reply('Anda tidak bisa mengeluarkan anggota dengan jabatan setara atau lebih tinggi.');

                delete userGuild.members[targetJid];
                guildsDb[userGuild.id] = userGuild;
                db.save('guilds', guildsDb);
                return sock.sendMessage(message.from, { text: `@${targetJid.split('@')[0]} telah dikeluarkan dari guild.`, mentions: [targetJid] });
            }

            case 'buybuff': {
                if (!userGuild || senderRoleLevel < ROLES.indexOf('Co-Owner')) return message.reply('Hanya Co-Owner atau Owner yang bisa membeli buff.');
                const userInputKey = args[1]?.toLowerCase();
                if (!userInputKey) {
                    let availableBuffs = 'Gunakan format `.guild buybuff <nama_buff>`.\n\nBuff yang tersedia:\n';
                    for (const key in gameConfig.guildBuffs) {
                        const b = gameConfig.guildBuffs[key];
                        availableBuffs += `\n- *${key}*: ${b.name} (Biaya: Rp ${b.cost.toLocaleString()})`;
                    }
                    return message.reply(availableBuffs);
                }

                const originalBuffKey = Object.keys(gameConfig.guildBuffs).find(k => k.toLowerCase() === userInputKey);
                
                if (!originalBuffKey) {
                    return message.reply(`Buff dengan nama "${userInputKey}" tidak ditemukan. Cek kembali nama buff yang tersedia.`);
                }
                
                const buffInfo = gameConfig.guildBuffs[originalBuffKey];
                const activeBuffKey = originalBuffKey.toLowerCase();

                if ((userGuild.activeBuffs[activeBuffKey]?.expires || 0) > Date.now()) {
                    return message.reply(`Buff *${buffInfo.name}* sudah aktif.`);
                }
                if (userGuild.bank < buffInfo.cost) {
                    return message.reply(`Bank guild tidak cukup. Butuh Rp ${buffInfo.cost.toLocaleString()}, tersedia Rp ${userGuild.bank.toLocaleString()}.`);
                }

                userGuild.bank -= buffInfo.cost;
                userGuild.activeBuffs[activeBuffKey] = { expires: Date.now() + buffInfo.duration };

                guildsDb[userGuild.id] = userGuild;
                db.save('guilds', guildsDb);
                
                return message.reply(`✅ Buff *${buffInfo.name}* berhasil diaktifkan untuk semua anggota selama 24 jam!`);
            }
            
            case 'promote':
            case 'demote': {
                if (!userGuild || senderRoleLevel < ROLES.indexOf('Co-Owner')) return message.reply('Hanya Co-Owner atau Owner yang dapat mengatur jabatan.');
                const targetJid = message.msg?.contextInfo?.mentionedJid?.[0];
                if (!targetJid || !userGuild.members[targetJid]) return message.reply('Tag anggota guild yang valid untuk diatur jabatannya.');
                if (targetJid === senderJid) return message.reply('Anda tidak bisa mengatur jabatan diri sendiri.');

                let targetMember = userGuild.members[targetJid];
                let targetRoleLevel = ROLES.indexOf(targetMember.role);
                
                if (senderRoleLevel <= targetRoleLevel) return message.reply('Jabatan Anda tidak cukup tinggi untuk mengatur pengguna ini.');

                if (action === 'promote') {
                    if (targetRoleLevel >= ROLES.indexOf('Co-Owner')) return message.reply(`Jabatan *${targetMember.role}* adalah yang tertinggi yang bisa dicapai melalui promosi.`);
                    targetMember.role = ROLES[targetRoleLevel + 1];
                } else {
                    if (targetRoleLevel <= ROLES.indexOf('Member')) return message.reply(`*${targetMember.role}* adalah jabatan terendah.`);
                    targetMember.role = ROLES[targetRoleLevel - 1];
                }
                
                guildsDb[userGuild.id] = userGuild;
                db.save('guilds', guildsDb);
                
                const responseText = `✅ Berhasil! Jabatan @${targetJid.split('@')[0]} sekarang adalah *${targetMember.role}*.`;
                return sock.sendMessage(message.from, { text: responseText, mentions: [targetJid] });
            }

            default:
                let helpText = `*Sistem Guild ${config.botName}*\n\n` +
                    `Bergabunglah dengan teman-temanmu untuk menjadi yang terkuat!\n\n` +
                    `*Perintah Dasar:*\n` +
                    `• \`.guild create <nama>\` - Membuat guild baru\n` +
                    `• \`.guild info\` - Melihat info guild Anda saat ini\n` +
                    `• \`.guild join <nama>\` - Menerima undangan guild\n` +
                    `• \`.guild leave\` - Keluar dari guild\n\n` +
                    `*Perintah Manajemen (Officer+):*\n` +
                    `• \`.guild invite @user\` - Mengundang pemain\n\n` +
                    `*Perintah Manajemen (Co-Owner+):*\n` +
                    `• \`.guild kick @user\` - Mengeluarkan anggota\n` +
                    `• \`.gdep <jumlah>\` - Menyetor uang ke bank guild\n` +
                    `• \`.guild buybuff <nama_buff>\` - Membeli keuntungan untuk guild\n` +
                    `• \`.guild promote @user\` - Menaikkan jabatan anggota\n` +
                    `• \`.guild demote @user\` - Menurunkan jabatan anggota`;
                return message.reply(helpText);
        }
    }
};