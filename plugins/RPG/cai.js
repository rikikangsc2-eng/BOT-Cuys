const axios = require('axios');
const db = require('../../lib/database');
const config = require('../../config');

module.exports = {
    command: ['cai', 'chat-ai'],
    description: 'Berinteraksi dengan karakter AI yang Anda ciptakan sendiri.',
    category: 'Fun',
    run: async (sock, message, args, { isAuto } = {}) => {
        const senderJid = message.sender;
        let usersDb = db.get('users');
        if (!usersDb.cai_partners) usersDb.cai_partners = {};
        let partnerData = usersDb.cai_partners[senderJid];

        if (partnerData && !partnerData.characterId) {
            partnerData.characterId = `char_${Date.now().toString(36)}${Math.random().toString(36).substring(2)}`;
        }

        if (!isAuto) {
            const subCommand = args[0]?.toLowerCase();
            if (subCommand === 'set') {
                const newPrompt = args.slice(1).join(' ');
                if (!newPrompt) {
                    return message.reply(
`Gunakan format: \`.cai set <deskripsi_karakter>\`
Contoh: \`.cai set Kamu adalah kucing oren bar-bar yang suka ngegas tapi lucu.\`

Setelah di-set, kamu bisa langsung chat dengan karaktermu.`
                    );
                }
                
                const characterId = `char_${Date.now().toString(36)}${Math.random().toString(36).substring(2)}`;
                
                usersDb.cai_partners[senderJid] = { 
                    systemPrompt: newPrompt,
                    characterId: characterId
                };
                db.save('users', usersDb);
                return message.reply(`✅ Persona AI berhasil diatur! Karakter barumu siap untuk diajak ngobrol.`);
            }
            if (subCommand === 'reset') {
                if (!partnerData) return message.reply('Kamu belum mengatur persona AI.');
                delete usersDb.cai_partners[senderJid];
                db.save('users', usersDb);
                return message.reply(`Persona AI telah di-reset. Kamu bisa membuat karakter baru dengan \`.cai set\`.`);
            }
        }

        if (!partnerData) {
            if (isAuto) return;
            return message.reply(`👋 *Selamat Datang di Chat AI Kreatif!*\n\nBuat karakter AI versimu sendiri dan ngobrol dengannya!\n\n*Cara Mengatur Karakter:*\nKetik perintah di bawah ini untuk mendeskripsikan persona AI-mu:\n\`\`\`.cai set <deskripsi_karakter>\`\`\`\n\n*Contoh:*\n- \`.cai set Kamu adalah detektif sinis dari era 1940-an.\`\n- \`.cai set Kamu adalah naga bijaksana yang menjaga gunung.\`\n- \`.cai set Kamu adalah asisten pribadi yang sarkastik.\`\n\nSetelah itu, semua pesanmu akan dibalas oleh karakter yang kamu buat!`);
        }

        const prompt = args.join(' ');
        if (!prompt) {
            return message.reply(`Persona AI saat ini aktif. Kirim pesan apa saja untuk berinteraksi dengannya.\n\n*Persona Aktif:*\n_"${partnerData.systemPrompt}"_\n\nUntuk mereset, gunakan \`.cai reset\`.`);
        }
        
        const waitingMessages = [`AI sedang berpikir...`, `Karaktermu sedang mengetik...`, `Memproses imajinasimu...`];
        const waitingMsg = await message.reply(waitingMessages[Math.floor(Math.random() * waitingMessages.length)]);
        
        try {
            const apiUrl = `https://nirkyy-dev.hf.space/api/v1/gemmachat?user=${partnerData.characterId}&system=${encodeURIComponent(partnerData.systemPrompt)}&prompt=${encodeURIComponent(prompt)}`;
            const apiResponse = await axios.get(apiUrl);
            
            if (!apiResponse.data?.success || !apiResponse.data.data.response) throw new Error("Respons API tidak valid.");
            
            let responseText = apiResponse.data.data.response;
            
            db.save('users', usersDb);
            await sock.sendMessage(message.from, { text: responseText, edit: waitingMsg.key });

        } catch (error) {
            console.error('Error pada plugin CAI:', error);
            await sock.sendMessage(message.from, { text: `Duh, AI-nya lagi istirahat. Coba lagi nanti, ya.`, edit: waitingMsg.key });
        }
    }
};