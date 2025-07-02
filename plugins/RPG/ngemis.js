const db = require('../../lib/database');
const crypto = require('crypto');
const config = require('../../config');
const { LRUCache } = require('lru-cache');

const activeBeggars = new LRUCache({ max: 500, ttl: 1000 * 60 * 60 });

function formatCooldown(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes} menit ${seconds} detik`;
}

module.exports = {
    command: ['ngemis', 'kasih'],
    description: 'Memulai sesi mengemis atau memberi sedekah kepada pengemis.',
    category: 'RPG',
    run: async (sock, message, args) => {
        const command = message.body.trim().split(/ +/)[0].slice(config.prefix.length).toLowerCase();

        if (!message.isGroup) {
            return message.reply('Fitur ini hanya bisa digunakan di dalam grup.');
        }

        if (command === 'ngemis') {
            const senderJid = message.sender;
            const cooldownTime = 30 * 60 * 1000;
            let cooldowns = db.get('cooldowns');
            const userCooldown = cooldowns[senderJid]?.ngemis || 0;

            if (Date.now() - userCooldown < cooldownTime) {
                const timeLeft = cooldownTime - (Date.now() - userCooldown);
                return message.reply(`Kamu baru saja mengemis. Istirahatkan dulu tenggorokanmu. Tunggu *${formatCooldown(timeLeft)}* lagi.`);
            }

            if (activeBeggars.has(message.from)) {
                const currentBeggar = activeBeggars.get(message.from);
                const text = `Sabar, masih ada @${currentBeggar.beggarJid.split('@')[0]} yang lagi mangkal di sini.`;
                return sock.sendMessage(message.from, { text: text, mentions: [currentBeggar.beggarJid] });
            }

            const begId = crypto.randomBytes(3).toString('hex');
            const sessionTimeout = 5 * 60 * 1000;

            const timeoutId = setTimeout(() => {
                if (activeBeggars.has(message.from)) {
                    const session = activeBeggars.get(message.from);
                    if (session.beggarJid === senderJid) {
                        sock.sendMessage(message.from, {
                            text: `Yah, belum ada yang ngasih. @${senderJid.split('@')[0]} berhenti ngemis karena tenggorokannya kering.`,
                            mentions: [senderJid]
                        });
                        activeBeggars.delete(message.from);
                    }
                }
            }, sessionTimeout);

            activeBeggars.set(message.from, { beggarJid: senderJid, begId, timeout: timeoutId });

            if (!cooldowns[senderJid]) cooldowns[senderJid] = {};
            cooldowns[senderJid].ngemis = Date.now();
            db.save('cooldowns', cooldowns);

            const begMessage = `Aaaa kasian Aaaa, teeeh kasian teehh...\n\n@${senderJid.split('@')[0]} lagi butuh uang nih.\n\nBantu dia dengan ketik:\n*.kasih ${begId} <jumlah>*`;
            await sock.sendMessage(message.from, { text: begMessage, mentions: [senderJid] });

        } else if (command === 'kasih') {
            const begSession = activeBeggars.get(message.from);
            if (!begSession) {
                return message.reply('Tidak ada yang sedang mengemis di sini saat ini.');
            }

            const inputId = args[0];
            const amount = parseInt(args[1]);

            if (!inputId || isNaN(amount) || amount <= 0) {
                return message.reply(`Gunakan format yang benar:\n*.kasih ${begSession.begId} <jumlah>*`);
            }

            if (inputId.toLowerCase() !== begSession.begId) {
                return message.reply(`ID tidak valid. Gunakan ID yang benar untuk memberi: *${begSession.begId}*`);
            }

            const senderJid = message.sender;
            const { beggarJid, timeout } = begSession;

            if (senderJid === beggarJid) {
                return message.reply('Anda tidak bisa memberi kepada diri sendiri, aneh.');
            }

            let usersDb = db.get('users');
            const donator = usersDb[senderJid] || { balance: 0 };

            if (donator.balance < amount) {
                return message.reply(`Uangmu tidak cukup untuk beramal. Saldo Anda: Rp ${donator.balance.toLocaleString()}`);
            }

            const beggar = usersDb[beggarJid] || { balance: 0 };

            donator.balance -= amount;
            beggar.balance += amount;

            usersDb[senderJid] = donator;
            usersDb[beggarJid] = beggar;
            db.save('users', usersDb);

            clearTimeout(timeout);
            activeBeggars.delete(message.from);

            const replyText = `✨ Terimakasih orang baik! @${beggarJid.split('@')[0]} telah menerima sedekah sebesar *Rp ${amount.toLocaleString()}* dari @${senderJid.split('@')[0]}. Sehat selalu ya!`;
            await sock.sendMessage(message.from, { text: replyText, mentions: [beggarJid, senderJid] });
        }
    }
};