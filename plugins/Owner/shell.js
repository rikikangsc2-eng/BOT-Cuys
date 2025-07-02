const { exec } = require('child_process');
const config = require('../../config');

module.exports = {
  command: ['sh', 'shell'],
  description: 'Menjalankan perintah shell di terminal server (Owner only).',
  run: async (sock, message, args) => {
    const ownerJid = `${config.ownerNumber}@s.whatsapp.net`;
    const botJid = `${config.botNumber}@s.whatsapp.net`;
    
    if (message.sender !== ownerJid && message.sender !== botJid) {
      return message.reply('Perintah ini hanya untuk Owner.');
    }
    
    if (args.length === 0) {
      return message.reply('Gunakan format: *.shell <perintah>*\nContoh: .shell ls -la');
    }
    
    const command = args.join(' ');
    
    await message.reply(`Menjalankan: $ ${command}`);
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        const errorMessage = `*Error:*\n\`\`\`${error.message}\`\`\``;
        return message.reply(errorMessage);
      }
      if (stderr) {
        const stderrMessage = `*Stderr:*\n\`\`\`${stderr}\`\`\``;
        return message.reply(stderrMessage);
      }
      
      const outputMessage = `*Output:*\n\`\`\`${stdout || 'Perintah berhasil dieksekusi tanpa output.'}\`\`\``;
      message.reply(outputMessage);
    });
  }
};