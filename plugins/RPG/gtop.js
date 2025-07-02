const db = require('../../lib/database');

module.exports = {
    command: ['gtop', 'guildtop'],
    description: 'Menampilkan papan peringkat guild teratas.',
    category: 'RPG',
    run: async (sock, message, args) => {
        const guildsDb = db.get('guilds') || {};
        
        const sortedGuilds = Object.values(guildsDb)
            .sort((a, b) => (b.level - a.level) || (b.xp - a.xp) || (b.bank - a.bank))
            .slice(0, 10);

        if (sortedGuilds.length === 0) {
            return message.reply('Belum ada guild di papan peringkat.');
        }

        let leaderboardText = '🏆 *Papan Peringkat Guild Teratas*\n\n';
        const mentionedJids = [];

        sortedGuilds.forEach((guild, index) => {
            const rank = index + 1;
            const emoji = ['🥇', '🥈', '🥉'][index] || `${rank}.`;
            leaderboardText += `${emoji} *${guild.name}* (Lv. ${guild.level})\n` +
                `   ├─ Owner: @${guild.owner.split('@')[0]}\n` +
                `   └─ Bank: Rp ${guild.bank.toLocaleString()}\n\n`;
            if (!mentionedJids.includes(guild.owner)) {
                mentionedJids.push(guild.owner);
            }
        });
        
        await sock.sendMessage(message.from, { text: leaderboardText, mentions: mentionedJids }, { quoted: message });
    }
};