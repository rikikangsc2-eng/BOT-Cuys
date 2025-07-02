const config = require('../../config');

module.exports = {
  command: 'owner',
  description: 'Menampilkan kontak pemilik bot.',
  run: async (sock, message, args) => {
    const vcard = `BEGIN:VCARD\n` +
      `VERSION:3.0\n` +
      `FN:${config.ownerName}\n` +
      `ORG:Bot Developer;\n` +
      `TEL;type=CELL;type=VOICE;waid=${config.ownerNumber}:${config.ownerNumber}\n` +
      `END:VCARD`;
    
    const contact = {
      contacts: {
        displayName: config.ownerName,
        contacts: [{ vcard }]
      }
    };
    
    await sock.sendMessage(message.from, contact);
  }
};