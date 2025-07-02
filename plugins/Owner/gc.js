const config = require('../../config');

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
  return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + ['Bytes', 'KB', 'MB', 'GB', 'TB'][i];
}

module.exports = {
  command: 'gc',
  description: 'Memaksa pembersihan memori (Garbage Collection).',
  run: async (sock, message, args) => {
    const ownerJid = `${config.ownerNumber}@s.whatsapp.net`;
    if (message.sender !== ownerJid) {
      return message.reply('Perintah ini hanya untuk Owner.');
    }
    
    if (!global.gc) {
      return message.reply('Jalankan bot dengan flag --expose-gc untuk menggunakan fitur ini.');
    }
    
    const before = process.memoryUsage();
    global.gc();
    const after = process.memoryUsage();
    
    const freed = before.heapUsed - after.heapUsed;
    
    const response =
      `*Garbage Collection Selesai*

*Memori Sebelum:*
- Heap: ${formatBytes(before.heapUsed)}
- RSS: ${formatBytes(before.rss)}

*Memori Sesudah:*
- Heap: ${formatBytes(after.heapUsed)}
- RSS: ${formatBytes(after.rss)}

*Memori Dilepaskan:* ${formatBytes(freed)}`;
    
    await message.reply(response);
  }
};