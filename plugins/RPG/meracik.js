const db = require('../../lib/database');
const gameConfig = require('../../gameConfig');

function formatCooldown(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes} menit ${seconds} detik`;
}

module.exports = {
    command: 'meracik',
    description: 'Meracik item baru dari bahan yang dimiliki.',
    category: 'Ekonomi',
    run: async (sock, message, args, { handler }) => {
        const cooldownTime = gameConfig.cooldowns.meracik;
        const senderJid = message.sender;
        const recipes = gameConfig.recipes;

        let cooldowns = db.get('cooldowns');
        const userCooldown = cooldowns[senderJid]?.meracik || 0;

        if (Date.now() - userCooldown < cooldownTime) {
            const timeLeft = cooldownTime - (Date.now() - userCooldown);
            return message.reply(`Tanganmu masih pegal karena meracik. Tunggu *${formatCooldown(timeLeft)}* lagi.`);
        }

        const recipeName = args[0]?.toLowerCase();
        let usersDb = db.get('users');
        const user = usersDb[senderJid] || { level: 1 };

        if (!recipeName) {
            let availableRecipes = '📜 *Buku Resep* 📜\n\n';
            availableRecipes += 'Gunakan: *.meracik <nama_resep>*\n\n';
            for (const name in recipes) {
                const recipe = recipes[name];
                const canCraft = user.level >= recipe.level;
                const status = canCraft ? `(Terbuka)` : `(Terkunci - Lv. ${recipe.level})`;
                availableRecipes += `* Rezept: *${name.charAt(0).toUpperCase() + name.slice(1)}* ${status}\n`;
                availableRecipes += `  - Hasil: ${recipe.result.amount} ${recipe.result.item}\n`;
                availableRecipes += `  - Bahan: ${Object.entries(recipe.ingredients).map(([item, amount]) => `${amount} ${item}`).join(', ')}\n\n`;
            }
            return message.reply(availableRecipes);
        }

        const recipe = recipes[recipeName];
        if (!recipe) {
            return message.reply(`Resep untuk *"${recipeName}"* tidak ditemukan. Cek buku resep dengan mengetik *.meracik*`);
        }
        
        if (user.level < recipe.level) {
            return message.reply(`Level Anda tidak cukup untuk meracik item ini. Butuh *Level ${recipe.level}*.`);
        }

        const hasAllIngredients = Object.keys(recipe.ingredients).every(item => {
            return (user[item]?.amount || 0) >= recipe.ingredients[item];
        });

        if (!hasAllIngredients) {
            let missingText = 'Bahan tidak cukup! Anda memerlukan:\n';
            for (const item in recipe.ingredients) {
                const required = recipe.ingredients[item];
                const owned = user[item]?.amount || 0;
                missingText += `- ${item}: ${owned}/${required} (${owned < required ? 'Kurang' : 'Cukup'})\n`;
            }
            return message.reply(missingText);
        }

        for (const item in recipe.ingredients) {
            user[item].amount -= recipe.ingredients[item];
            if (user[item].amount <= 0) {
                delete user[item];
            }
        }

        const { item: resultItem, amount: resultAmount, level: resultLevel } = recipe.result;
        let successText = '';
        
        const isUpgradable = ['pedanglegendaris', 'bajuzirahbaja', 'perisaiiron'].includes(resultItem);

        if (isUpgradable && user[resultItem] && user[resultItem].amount > 0) {
            user[resultItem].level = (user[resultItem].level || 1) + 1;
            successText = `*UPGRADE BERHASIL!* ✨\n\n@${senderJid.split('@')[0]} berhasil meningkatkan *${resultItem.charAt(0).toUpperCase() + resultItem.slice(1)}* ke *Level ${user[resultItem].level}* dan mendapatkan *${recipe.xp} XP*!`;
        } else {
            if (!user[resultItem]) {
                user[resultItem] = { amount: 0, level: 0 };
            }
            user[resultItem].amount += resultAmount;
            user[resultItem].level = user[resultItem].level > 0 ? user[resultItem].level : resultLevel;
            successText = `*Sukses Meracik!* ✨\n\n@${senderJid.split('@')[0]} berhasil menciptakan *${resultAmount} ${resultItem.charAt(0).toUpperCase() + resultItem.slice(1)}* dan mendapatkan *${recipe.xp} XP*!`;
        }
        
        user.xp = (user.xp || 0) + recipe.xp;
        await handler.checkLevelUp(sock, message, user);

        usersDb[senderJid] = user;
        if (!cooldowns[senderJid]) cooldowns[senderJid] = {};
        cooldowns[senderJid].meracik = Date.now();
        
        db.save('users', usersDb);
        db.save('cooldowns', cooldowns);
        
        await sock.sendMessage(message.from, { text: successText, mentions: [senderJid] });
    }
};