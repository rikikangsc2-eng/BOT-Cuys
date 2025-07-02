const db = require('../../lib/database');

module.exports = {
    command: 'autoai',
    description: 'Memilih AI default untuk merespons di chat pribadi.',
    category: 'Tools',
    run: async (sock, message, args) => {
        const senderJid = message.sender;
        const choice = args[0];

        let usersDb = db.get('users');
        const user = usersDb[senderJid] || {};
        const caiPartner = usersDb.cai_partners?.[senderJid];
        
        if (!choice || !['1', '2'].includes(choice)) {
            let helpText = 'Silakan pilih AI mana yang akan menjadi asisten default di chat pribadimu:\n\n';
            helpText += '*1. NirKyy AI (Alicia)*\n   - Asisten AI serbaguna untuk menjawab pertanyaan dan menjalankan tugas.\n\n';
            helpText += '*2. Pasangan CAI (Chat AI)*\n   - Karakter AI yang kamu ciptakan untuk role-playing hubungan.\n\n';
            helpText += 'Gunakan format: `.autoai 1` atau `.autoai 2`';
            return message.reply(helpText);
        }

        if (choice === '2' && !caiPartner) {
            return message.reply('Kamu belum memiliki pasangan CAI. Buat dulu dengan `.cai setname <nama>` sebelum memilih opsi ini.');
        }
        
        user.auto_ai_preference = choice;
        usersDb[senderJid] = user;
        db.save('users', usersDb);
        
        const aiName = choice === '1' ? 'NirKyy AI (Alicia)' : caiPartner.name;
        await message.reply(`✅ Berhasil! Sekarang, *${aiName}* akan menjadi AI default untuk membalas pesanmu di chat pribadi.`);
    }
};