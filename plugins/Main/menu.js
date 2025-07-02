const process = require('process');
const config = require('../../config');
const { getBuffer } = require('../../lib/functions');
const { plugins } = require('../../lib/pluginManager');

function formatUptime(seconds) {
    function pad(s) {
        return (s < 10 ? '0' : '') + s;
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds % 3600 / 60);
    seconds = Math.floor(seconds % 60);
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

module.exports = {
    command: ['menu', 'help'],
    description: 'Menampilkan semua fitur yang tersedia.',
    run: async (sock, message, args) => {
        const usedMem = process.memoryUsage().heapUsed / 1024 / 1024;
        const uptime = process.uptime();

        const commandCategories = {};
        const uniqueCommands = new Set();

        plugins.forEach(plugin => {
            if (!plugin.command || !plugin.description) return;

            const mainCommand = Array.isArray(plugin.command) ? plugin.command[0] : plugin.command;
            if (uniqueCommands.has(mainCommand)) return;
            uniqueCommands.add(mainCommand);

            const category = plugin.category || 'Uncategorized';
            if (!commandCategories[category]) {
                commandCategories[category] = [];
            }
            commandCategories[category].push(mainCommand);
        });

        const priorityCategories = ['Owner', 'Group', 'Game', 'RPG'];
        const sortedCategories = Object.keys(commandCategories).sort((a, b) => {
            const indexA = priorityCategories.indexOf(a);
            const indexB = priorityCategories.indexOf(b);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return a.localeCompare(b);
        });

        let menuText = `*Hai, ${message.pushName || 'User'}!*
Bot ini siap membantu Anda.

┌─「 *BOT STATUS* 」
│ ❖ *Owner* : ${config.ownerName}
│ ❖ *Uptime* : ${formatUptime(uptime)}
│ ❖ *RAM* : ${usedMem.toFixed(2)} MB
└─\n\n`;

        for (const category of sortedCategories) {
            menuText += `┌─「 *${category}* 」\n`;
            commandCategories[category].forEach(command => {
                menuText += `│ ❖ ${config.prefix}${command}\n`;
            });
            menuText += `└─\n\n`;
        }

        menuText += `Ketik *.command* untuk menggunakan fitur.`;

        let userThumb;
        try {
            const ppUrl = await sock.profilePictureUrl(message.sender, 'image');
            userThumb = await getBuffer(ppUrl);
        } catch (e) {
            userThumb = null;
        }

        const menuMessage = {
            text: menuText,
            contextInfo: {
                externalAdReply: {
                    title: config.botName,
                    body: `© ${config.ownerName}`,
                    thumbnail: userThumb,
                    sourceUrl: `https://wa.me/${config.ownerNumber}`,
                    mediaType: 1
                }
            }
        };

        await sock.sendMessage(message.from, menuMessage, { quoted: message });
    }
};