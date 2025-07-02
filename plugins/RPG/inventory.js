const db = require('../../lib/database');

module.exports = {
    command: ['inv', 'inventory', 'tas'],
    description: 'Melihat daftar item dan material yang kamu miliki.',
    category: 'RPG',
    run: async (sock, message, args) => {
        const usersDb = db.get('users');
        const user = usersDb[message.sender] || {};
        
        const materials = {
            emas: 'gram',
            iron: 'gram',
            bara: 'gram',
            slimegel: 'gumpal'
        };

        const foods = {
            daging: 'potong',
            ikan: 'ekor',
            tikus: 'ekor'
        };
        
        const equipments = {
            baja: 'batang',
            pedanglegendaris: 'buah',
            perisaiKayu: 'buah'
        };

        const consumables = {
            salepLuka: 'buah'
        };

        const specialItems = {
            jimatAntiRampok: "Jimat Anti-Rampok",
            jimatPembalikTakdir: "Jimat Pembalik Takdir",
            ramuanBerburuSuper: "Ramuan Berburu Super",
            azimatDuelSakti: "Azimat Duel Sakti",
            koinKeberuntungan: "Koin Keberuntungan"
        };

        let inventoryText = `🎒 *Tas Inventaris*\n\n` +
            `*Pemilik:* ${message.pushName}\n\n`;

        let hasItems = false;
        
        let materialText = "┌─「 *Material* 」\n";
        let hasMaterials = false;
        for (const [item, unit] of Object.entries(materials)) {
            const amount = user[item]?.amount || 0;
            if (amount > 0) {
                hasMaterials = true;
                hasItems = true;
                materialText += `│ ❖ *${item.charAt(0).toUpperCase() + item.slice(1)}:* ${amount.toFixed(3)} ${unit}\n`;
            }
        }
        if (!hasMaterials) {
            materialText += `│ _Tidak ada material._\n`;
        }
        materialText += "└─\n\n";
        inventoryText += materialText;
        
        let foodText = "┌─「 *Makanan* 」\n";
        let hasFoods = false;
        for (const [item, unit] of Object.entries(foods)) {
            const amount = user[item]?.amount || 0;
            if (amount > 0) {
                hasFoods = true;
                hasItems = true;
                foodText += `│ ❖ *${item.charAt(0).toUpperCase() + item.slice(1)}:* ${amount} ${unit}\n`;
            }
        }
        if (!hasFoods) {
            foodText += `│ _Tidak ada makanan._\n`;
        }
        foodText += "└─\n\n";
        inventoryText += foodText;

        let equipmentText = "┌─「 *Peralatan* 」\n";
        let hasEquipments = false;
        for (const [item, unit] of Object.entries(equipments)) {
            const amount = user[item]?.amount || 0;
            if (amount > 0) {
                hasEquipments = true;
                hasItems = true;
                equipmentText += `│ ❖ *${item.charAt(0).toUpperCase() + item.slice(1)}:* ${amount} ${unit}\n`;
            }
        }
        if (!hasEquipments) {
            equipmentText += `│ _Tidak ada peralatan._\n`;
        }
        equipmentText += "└─\n\n";
        inventoryText += equipmentText;

        let consumableText = "┌─「 *Konsumsi* 」\n";
        let hasConsumables = false;
        for (const [item, unit] of Object.entries(consumables)) {
            const amount = user[item]?.amount || 0;
            if (amount > 0) {
                hasConsumables = true;
                hasItems = true;
                consumableText += `│ ❖ *${item.charAt(0).toUpperCase() + item.slice(1)}:* ${amount} ${unit}\n`;
            }
        }
        if (!hasConsumables) {
            consumableText += `│ _Tidak ada item konsumsi._\n`;
        }
        consumableText += "└─\n\n";
        inventoryText += consumableText;

        let specialItemsText = "┌─「 *Item Spesial* 」\n";
        let hasSpecialItems = false;
        for (const [key, name] of Object.entries(specialItems)) {
            const amount = user[key] || 0;
            if (amount > 0) {
                hasSpecialItems = true;
                hasItems = true;
                specialItemsText += `│ ❖ *${name}:* ${amount} buah\n`;
            }
        }
        if (!hasSpecialItems) {
            specialItemsText += `│ _Tidak ada item spesial._\n`;
        }
        specialItemsText += "└─\n\n";
        inventoryText += specialItemsText;

        if (!hasItems) {
            inventoryText = `🎒 *Tas Inventaris*\n\n*Pemilik:* ${message.pushName}\n\n_Tasmu kosong melompong._`;
        }

        inventoryText += `_Gunakan .profile untuk melihat statistik lengkap._`;

        await message.reply(inventoryText);
    }
};