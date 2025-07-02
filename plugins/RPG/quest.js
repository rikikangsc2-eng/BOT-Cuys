const db = require('../../lib/database');
const config = require('../../config');

const QUEST_CYCLE_DURATION = 24 * 60 * 60 * 1000;

const questPool = [
    () => ({
        id: 'Q1',
        type: 'berburu',
        description: 'Pergi berburu di hutan belantara.',
        target: 5 + Math.floor(Math.random() * 6),
        reward: { xp: 500 + Math.floor(Math.random() * 501), balance: 10000 + Math.floor(Math.random() * 10001) }
    }),
    () => ({
        id: 'Q2',
        type: 'duel',
        description: 'Menangkan duel melawan pemain lain.',
        target: 1 + Math.floor(Math.random() * 2),
        reward: { xp: 1000 + Math.floor(Math.random() * 1001), balance: 25000 + Math.floor(Math.random() * 25001) }
    }),
    () => ({
        id: 'Q3',
        type: 'meracik',
        description: 'Gunakan keahlianmu untuk meracik sebuah item.',
        target: 1,
        reward: { xp: 750 + Math.floor(Math.random() * 751), balance: 15000 + Math.floor(Math.random() * 10001) }
    }),
    () => ({
        id: 'Q4',
        type: 'rampok',
        description: 'Uji nyalimu dengan merampok pemain lain.',
        target: 2 + Math.floor(Math.random() * 2),
        reward: { xp: 1200 + Math.floor(Math.random() * 801), balance: 30000 + Math.floor(Math.random() * 20001) }
    }),
    () => ({
        id: 'Q5',
        type: 'ngemis',
        description: 'Rendahkan dirimu dan mengemis di depan umum.',
        target: 1,
        reward: { xp: 200 + Math.floor(Math.random() * 201), balance: 5000 + Math.floor(Math.random() * 5001) }
    })
];

function generateDailyQuests() {
    const shuffled = questPool.sort(() => 0.5 - Math.random());
    const selectedQuests = shuffled.slice(0, 3);
    return selectedQuests.map(questFn => {
        const quest = questFn();
        quest.progress = 0;
        quest.claimed = false;
        return quest;
    });
}

function ensureQuests(userJid) {
    let questsDb = db.get('quests') || {};
    const now = Date.now();
    const userQuests = questsDb[userJid];

    if (!userQuests || (now - userQuests.lastGenerated) > QUEST_CYCLE_DURATION) {
        questsDb[userJid] = {
            lastGenerated: now,
            dailyQuests: generateDailyQuests()
        };
        db.save('quests', questsDb);
    }
    return questsDb[userJid].dailyQuests;
}

module.exports = {
    command: ['quest', 'misi'],
    description: 'Melihat dan mengklaim misi harian.',
    category: 'RPG',
    run: async (sock, message, args, { handler }) => {
        const senderJid = message.sender;
        const subCommand = args[0]?.toLowerCase();

        let questsDb = db.get('quests') || {};
        const userQuestsData = questsDb[senderJid];
        
        if (subCommand === 'klaim' || subCommand === 'claim') {
            const questIdToClaim = args[1]?.toUpperCase();
            if (!questIdToClaim) {
                return message.reply(`Gunakan format: \`${config.prefix}quest klaim <ID_MISI>\`\nContoh: .quest klaim Q1`);
            }

            const dailyQuests = ensureQuests(senderJid);
            const questToClaim = dailyQuests.find(q => q.id === questIdToClaim);

            if (!questToClaim) {
                return message.reply(`Misi dengan ID \`${questIdToClaim}\` tidak ditemukan.`);
            }
            if (questToClaim.claimed) {
                return message.reply(`Anda sudah mengklaim hadiah untuk misi ini.`);
            }
            if (questToClaim.progress < questToClaim.target) {
                return message.reply(`Misi belum selesai. Selesaikan dulu tugasnya.`);
            }

            let usersDb = db.get('users');
            const user = usersDb[senderJid];
            
            const reward = questToClaim.reward;
            user.balance = (user.balance || 0) + reward.balance;
            user.xp = (user.xp || 0) + reward.xp;
            questToClaim.claimed = true;
            
            await handler.checkLevelUp(sock, message, user);
            
            usersDb[senderJid] = user;
            questsDb[senderJid].dailyQuests = dailyQuests;
            
            db.save('users', usersDb);
            db.save('quests', questsDb);

            return message.reply(
`🎉 *Hadiah Misi Diklaim!* 🎉

Anda telah menyelesaikan: *${questToClaim.description}*
+ *Rp ${reward.balance.toLocaleString()}*
+ *${reward.xp} XP*

Selamat! Teruslah berpetualang!`
            );
        }

        const dailyQuests = ensureQuests(senderJid);
        
        let questListText = `📜 *Misi Harian Anda*\n\nBerikut adalah tugas yang bisa Anda selesaikan hari ini untuk mendapatkan hadiah:\n\n`;

        dailyQuests.forEach(quest => {
            const progress = Math.min(quest.progress, quest.target);
            const isComplete = progress >= quest.target;
            const statusEmoji = quest.claimed ? '✅' : (isComplete ? '🎁' : '⏳');

            questListText += `*${statusEmoji} [${quest.id}] ${quest.description}*\n`;
            questListText += `   - Kemajuan: ${progress} / ${quest.target}\n`;
            questListText += `   - Hadiah: Rp ${quest.reward.balance.toLocaleString()} & ${quest.reward.xp} XP\n\n`;
        });
        
        questListText += `Gunakan \`${config.prefix}quest klaim <ID>\` untuk mengambil hadiah misi yang sudah selesai (🎁).`;

        const timeLeft = QUEST_CYCLE_DURATION - (Date.now() - (userQuestsData?.lastGenerated || Date.now()));
        const hours = Math.floor(timeLeft / (1000 * 60 * 60));
        const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
        questListText += `\n\n_Misi baru akan tersedia dalam: ${hours} jam ${minutes} menit._`;

        await message.reply(questListText);
    }
};