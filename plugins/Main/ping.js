const os = require('os');
const process = require('process');

function formatUptime(seconds) {
    function pad(s) {
        return (s < 10 ? '0' : '') + s;
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds % 3600 / 60);
    seconds = Math.floor(seconds % 60);
    return `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
}

module.exports = {
    command: 'ping',
    description: 'Mengecek kecepatan respon dan status bot.',
    run: async (sock, message, args) =>  {
        const startTime = Date.now();

        const memUsage = process.memoryUsage();
        const latency = Date.now() - startTime;
        const uptime = process.uptime();

        const responseText = 
`\`\`\`
PONG! 🏓
- Speed    : ${latency} ms
- Uptime   : ${formatUptime(uptime)}
- RAM      : ${(memUsage.rss / 1024 / 1024).toFixed(2)} MB
- Heap     : ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB
\`\`\``;

        await message.reply(responseText);
    }
};