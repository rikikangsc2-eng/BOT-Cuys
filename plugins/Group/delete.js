module.exports = {
    command: ['d', 'delete'],
    description: 'Menghapus pesan di grup.',
    run: async (sock, message, args) => {
        if (!message.isGroup) {
            return message.reply('Perintah ini hanya bisa digunakan di dalam grup.');
        }

        if (!message.msg?.contextInfo?.quotedMessage) {
            return message.reply('Silakan reply pesan yang ingin dihapus.');
        }

        const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const quotedKey = {
            remoteJid: message.from,
            id: message.msg.contextInfo.stanzaId,
            participant: message.msg.contextInfo.participant
        };

        const groupMeta = await sock.groupMetadata(message.from);
        const bot = groupMeta.participants.find(p => p.id === botJid);
        const isBotAdmin = bot && (bot.admin === 'admin' || bot.admin === 'superadmin');

        if (quotedKey.participant === botJid) {
            if (!isBotAdmin) {
                return message.reply('Saya tidak bisa menghapus pesan saya sendiri karena saya bukan admin di grup ini.');
            }
            try {
                await sock.sendMessage(message.from, { delete: quotedKey });
            } catch (e) {
                console.error(e);
                await message.reply('Gagal menghapus pesan bot. Mungkin pesan sudah terlalu lama.');
            }
        } else {
            const sender = groupMeta.participants.find(p => p.id === message.sender);
            const isAdmin = sender && (sender.admin === 'admin' || sender.admin === 'superadmin');

            if (!isAdmin) {
                return message.reply('Hanya admin yang bisa menghapus pesan pengguna lain.');
            }
            if (!isBotAdmin) {
                return message.reply('Jadikan bot sebagai admin terlebih dahulu untuk menghapus pesan pengguna lain.');
            }

            try {
                await sock.sendMessage(message.from, { delete: quotedKey });
            } catch (e) {
                console.error(e);
                await message.reply('Gagal menghapus pesan pengguna. Mungkin pesan sudah terlalu lama.');
            }
        }
    }
};