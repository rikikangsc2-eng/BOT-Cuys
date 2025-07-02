const util = require('util');
const config = require('../../config');

module.exports = {
    command: 'exec',
    description: 'Menjalankan kode server (Owner only).',
    run: async (sock, message, args) =>  {
        const ownerJid = `${config.ownerNumber}@s.whatsapp.net`;
        if (message.sender !== ownerJid) {
            return message.reply('Perintah ini hanya untuk Owner.');
        }

        if (!args.length) {
            return message.reply('Masukkan kode yang ingin dijalankan.');
        }

        const code = args.join(' ');
        try {
            const result = await eval(`(async () => { ${code} })()`);
            const output = util.inspect(result, { depth: null });
            await message.reply(output);
        } catch (e) {
            await message.reply(`Error: ${e.message}`);
        }
    }
};