const db = require('../../lib/database');

module.exports = {
    command: 'terkuat',
    description: 'Melihat papan peringkat pengguna terkuat berdasarkan level.',
    category: 'RPG',
    run: async (sock, message, args) => {
        const usersDb = db.get('users');
        
        const sortedUsers = Object.entries(usersDb)
            .filter(([, user]) => user.level && user.xp)
            .sort(([, a], [, b]) => (b.level || 0) - (a.level || 0) || (b.xp || 0) - (a.xp || 0))
            .slice(0, 10);

        if (sortedUsers.length === 0) {
            return message.reply('Belum ada ksatria di papan peringkat.');
        }

        let leaderboardText = '💪 *Papan Peringkat Terkuat*\n\n';
        const mentionedJids = [];

        sortedUsers.forEach(([jid, user], index) => {
            const rank = index + 1;
            const emoji = ['🥇', '🥈', '🥉'][index] || `${rank}.`;
            leaderboardText += `${emoji} @${jid.split('@')[0]}\n   Level: ${user.level} (XP: ${user.xp.toLocaleString()})\n\n`;
            mentionedJids.push(jid);
        });
        
        await sock.sendMessage(message.from, { text: leaderboardText, mentions: mentionedJids }, { quoted: message });
    }
};