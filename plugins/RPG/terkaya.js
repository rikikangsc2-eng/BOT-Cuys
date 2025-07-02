const db = require('../../lib/database');

module.exports = {
    command: 'terkaya',
    description: 'Melihat papan peringkat pengguna terkaya.',
    run: async (sock, message, args) => {
        const usersDb = db.get('users');
        
        const sortedUsers = Object.entries(usersDb)
            .filter(([, user]) => user && typeof user.balance === 'number')
            .sort(([, a], [, b]) => (b.balance || 0) - (a.balance || 0))
            .slice(0, 10);

        if (sortedUsers.length === 0) {
            return message.reply('Belum ada pengguna di papan peringkat.');
        }

        let leaderboardText = '🏆 *Papan Peringkat Terkaya*\n\n';
        const mentionedJids = [];

        sortedUsers.forEach(([jid, user], index) => {
            const rank = index + 1;
            const emoji = ['🥇', '🥈', '🥉'][index] || `${rank}.`;
            leaderboardText += `${emoji} @${jid.split('@')[0]}\n   Rp ${user.balance.toLocaleString()}\n\n`;
            mentionedJids.push(jid);
        });
        
        await sock.sendMessage(message.from, { text: leaderboardText, mentions: mentionedJids }, { quoted: message });
    }
};