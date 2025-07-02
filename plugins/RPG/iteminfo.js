const db = require('../../lib/database');

const specialItemInfo = {
    jimatAntiRampok: { name: "Jimat Anti-Rampok", description: "Jimat sekali pakai yang akan membuat rampokan terhadapmu otomatis gagal." },
    jimatPembalikTakdir: { name: "Jimat Pembalik Takdir", description: "Jika kamu berhasil dirampok, jimat ini akan membalikkan efeknya. Perampok yang akan kehilangan uang!" },
    ramuanBerburuSuper: { name: "Ramuan Berburu Super", description: "Minum ini sebelum berburu untuk menjamin hasil 'Super Sukses' pada perburuan berikutnya." },
    azimatDuelSakti: { name: "Azimat Duel Sakti", description: "Aktifkan sebelum duel untuk mendapatkan tambahan kekuatan tempur secara signifikan." },
    koinKeberuntungan: { name: "Koin Keberuntungan", description: "Bawa koin ini saat bereksplorasi untuk meningkatkan peluang keberhasilanmu." }
};

module.exports = {
    command: ['iteminfo', 'cekitem'],
    description: 'Melihat informasi dan jumlah item spesial yang dimiliki.',
    category: 'RPG',
    run: async (sock, message, args) => {
        const usersDb = db.get('users');
        const user = usersDb[message.sender] || {};
        
        let infoText = `🔮 *Informasi Item Spesial Milikmu*\n\n`;
        let hasItems = false;

        for (const key in specialItemInfo) {
            const amount = user[key] || 0;
            if (amount > 0) {
                hasItems = true;
                const item = specialItemInfo[key];
                infoText += `*${item.name}*\n`;
                infoText += `  - Jumlah: *${amount} buah*\n`;
                infoText += `  - Fungsi: ${item.description}\n\n`;
            }
        }
        
        if (!hasItems) {
            infoText += `_Kamu tidak memiliki item spesial apapun. Kunjungi NPC untuk membeli._`;
        }
        
        await message.reply(infoText);
    }
};