const db = require('../../lib/database');
const { calculateNextLevelXp, calculatePower, getPlayerGuild } = require('../../lib/rpgUtils');

const houseNames = ["Tanah Kosong", "Gubuk Reyot", "Rumah Kayu", "Rumah Batu", "Villa Mewah", "Istana Megah"];
const equipmentNames = {
    weapon: "Pedang Legendaris",
    armor: "Baju Zirah Baja",
    shield: "Perisai Iron",
    relic: "Cincin Kekuatan"
};
const equipmentKeys = {
    weapon: "pedanglegendaris",
    armor: "bajuzirahbaja",
    shield: "perisaiiron",
    relic: "cincinKekuatan"
};
const specialItems = {
    jimatAntiRampok: "Jimat Anti-Rampok",
    jimatPembalikTakdir: "Jimat Pembalik Takdir",
    ramuanBerburuSuper: "Ramuan Berburu Super",
    azimatDuelSakti: "Azimat Duel Sakti",
    koinKeberuntungan: "Koin Keberuntungan"
};

function getDurabilityText(user, slot) {
    const itemKey = equipmentKeys[slot];
    if (!user.equipment || !user.equipment[slot] || !user[itemKey]) return 'Kosong';
    
    const itemData = user[itemKey];
    const itemName = equipmentNames[slot];
    const itemLevel = itemData.level || 1;
    const levelText = itemLevel > 1 ? ` Lv.${itemLevel}` : '';

    const durability = itemData.durability === undefined ? 100 : itemData.durability;
    const maxDurability = require('../../gameConfig').durability.max[itemKey] || 100;
    const percentage = Math.round((durability / maxDurability) * 100);

    return `${itemName}${levelText} (${percentage}%)`;
}

module.exports = {
    command: ['profile', 'profil'],
    description: 'Melihat profil, saldo, dan aset Anda atau orang lain.',
    category: 'RPG',
    run: async (sock, message, args) => {
        const mentionedJid = message.msg?.contextInfo?.mentionedJid?.[0];
        const targetJid = mentionedJid || message.sender;

        let displayName;
        if (targetJid === message.sender) {
            displayName = message.pushName;
        } else {
            displayName = `@${targetJid.split('@')[0]}`;
        }
        
        const usersDb = db.get('users');
        const user = usersDb[targetJid] || {};

        const level = user.level || 1;
        const xp = user.xp || 0;
        const nextLevelXp = calculateNextLevelXp(level);
        const power = calculatePower(user);
        
        if (!user.house) user.house = { level: 0, lastClaim: Date.now() };
        if (!user.equipment) user.equipment = {};
        
        const houseLevel = user.house.level;
        const houseName = houseNames[houseLevel] || houseNames[0];
        const guildData = getPlayerGuild(targetJid);
        const guildName = guildData ? guildData.name : 'Tidak ada';

        let equipmentText = "┌─「 *Peralatan Dipakai* 」\n";
        equipmentText += `│ ⚔️ *Senjata:* ${getDurabilityText(user, 'weapon')}\n`;
        equipmentText += `│ 🛡️ *Baju Zirah:* ${getDurabilityText(user, 'armor')}\n`;
        equipmentText += `│ 🛡️ *Perisai:* ${getDurabilityText(user, 'shield')}\n`;
        equipmentText += `│ 💍 *Artifak:* ${user.equipment.relic ? equipmentNames.relic : 'Kosong'}\n`;
        equipmentText += "└─\n\n";
        
        let specialItemsText = "┌─「 *Item Spesial* 」\n";
        let hasSpecialItems = false;
        for (const key in specialItems) {
            const amount = user[key] || 0;
            if (amount > 0) {
                hasSpecialItems = true;
                specialItemsText += `│ ❖ *${specialItems[key]}:* ${amount} buah\n`;
            }
        }
        if (!hasSpecialItems) {
            specialItemsText += `│ _Tidak ada item spesial._\n`;
        }
        specialItemsText += "└─\n\n";

        const profileText = `👤 *Profil Pengguna*\n` +
            `*Nama:* ${displayName}\n` +
            `*Guild:* ${guildName}\n` +
            `*Level:* ${level}\n` +
            `*XP:* ${xp.toLocaleString()} / ${nextLevelXp.toLocaleString()}\n` +
            `*Kekuatan Tempur:* ${power}\n` +
            `*Rumah:* ${houseName} (Lv. ${houseLevel})\n\n` +
            
            equipmentText +
            specialItemsText +

            `*Aset:*\n` +
            `- *Saldo:* Rp ${(user.balance || 0).toLocaleString()}`;
            
        await sock.sendMessage(message.from, { text: profileText, mentions: [targetJid] });
    }
};