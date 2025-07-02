module.exports = {
  command: 'sc',
  description: 'Menampilkan link source code dan channel resmi bot.',
  category: 'Info',
  run: async (sock, message, args) => {
    const responseText = `Berikut adalah source code dan channel resmi bot ini:\n\n` +
      `*Source Code (GitHub):*\n` +
      `https://github.com/rikikangsc2-eng/Simple-WaBOT\n\n` +
      `*Official Channel (WhatsApp):*\n` +
      `https://whatsapp.com/channel/0029Vb3qLJRDuMRdjacRwe2T\n\n` +
      `Jangan lupa berikan bintang (⭐) pada repositori jika Anda menyukainya!`;
      
    await message.reply(responseText);
  }
};