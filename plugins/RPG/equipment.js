const db = require('../../lib/database');

const equipmentSlots = {
    pedanglegendaris: 'weapon',
    bajuzirahbaja: 'armor',
    perisaiiron: 'shield',
    perisaiKayu: 'shield',
    cincinkekuatan: 'relic'
};

const itemNames = {
    pedanglegendaris: "Pedang Legendaris",
    bajuzirahbaja: "Baju Zirah Baja",
    perisaiiron: "Perisai Iron",
    perisaiKayu: "Perisai Kayu",
    cincinkekuatan: "Cincin Kekuatan"
};

module.exports = {
    command: ['pakai', 'lepas'],
    description: 'Mengelola peralatan yang dikenakan.',
    category: 'RPG',
    run: async (sock, message, args) => {
        const command = message.body.trim().split(/ +/)[0].slice(1).toLowerCase();
        const itemKey = args[0]?.toLowerCase();

        if (!itemKey || !equipmentSlots[itemKey]) {
            return message.reply(`Item tidak valid. Contoh: \`.pakai pedanglegendaris\``);
        }

        let usersDb = db.get('users');
        const user = usersDb[message.sender];
        if (!user) return message.reply('Profil Anda tidak ditemukan.');

        if (!user.equipment) {
            user.equipment = {};
        }

        if (command === 'pakai') {
            if ((user[itemKey]?.amount || 0) < 1) {
                return message.reply(`Anda tidak memiliki *${itemNames[itemKey]}* di tas Anda.`);
            }

            const slot = equipmentSlots[itemKey];
            if (user.equipment[slot] === itemKey) {
                return message.reply(`Anda sudah memakai *${itemNames[itemKey]}*.`);
            }
            
            user.equipment[slot] = itemKey;
            usersDb[message.sender] = user;
            db.save('users', usersDb);

            return message.reply(`✅ Anda berhasil memakai *${itemNames[itemKey]}*.`);
        }

        if (command === 'lepas') {
            const slot = equipmentSlots[itemKey];
            if (!user.equipment[slot] || user.equipment[slot] !== itemKey) {
                return message.reply(`Anda tidak sedang memakai *${itemNames[itemKey]}*.`);
            }

            delete user.equipment[slot];
            usersDb[message.sender] = user;
            db.save('users', usersDb);

            return message.reply(`✅ Anda berhasil melepas *${itemNames[itemKey]}*.`);
        }
    }
};