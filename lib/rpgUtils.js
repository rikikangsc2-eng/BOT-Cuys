const gameConfig = require('../gameConfig');
const db = require('./database');

const calculateNextLevelXp = (level) => {
    const { base, multiplier, xp_per_level } = gameConfig.leveling;
    return base * (level ** multiplier) * xp_per_level;
};

const getPlayerGuild = (playerJid) => {
    const guilds = db.get('guilds') || {};
    return Object.values(guilds).find(g => g.members && g.members[playerJid]);
};

const calculatePower = (user) => {
    if (!user) return 1;
    let power = (user.level || 1) * 10;
    
    if (user.equipment) {
        for (const slot in user.equipment) {
            const itemKey = user.equipment[slot];
            const itemData = user[itemKey];
            if (itemData && gameConfig.equipmentStats[itemKey] && (itemData.durability || 0) > 0) {
                const itemLevel = itemData.level || 1;
                power += gameConfig.equipmentStats[itemKey] * itemLevel;
            }
        }
    }
    return Math.round(power);
};

const applyDurabilityLoss = (user, itemKey, lossAmount = null) => {
    if (!user || !itemKey || !user[itemKey]) return user;
    
    if (typeof user[itemKey].durability === 'undefined') {
        user[itemKey].durability = gameConfig.durability.max[itemKey] || 100;
    }
    
    const loss = lossAmount !== null ? lossAmount : (gameConfig.durability.loss_per_use[itemKey] || 1);
    user[itemKey].durability = Math.max(0, user[itemKey].durability - loss);
    
    return user;
};

const getRepairCost = (itemKey) => {
    return gameConfig.durability.repair_cost[itemKey] || null;
};

const createHealthBar = (currentHP, maxHP) => {
    const totalBars = 10;
    const percentage = Math.max(0, currentHP) / maxHP;
    const filledBars = Math.round(percentage * totalBars);
    const emptyBars = totalBars - filledBars;
    return `[${'█'.repeat(filledBars)}${'░'.repeat(emptyBars)}] ${currentHP.toLocaleString()}/${maxHP.toLocaleString()}`;
};

module.exports = {
    calculateNextLevelXp,
    getPlayerGuild,
    calculatePower,
    applyDurabilityLoss,
    getRepairCost,
    createHealthBar
};