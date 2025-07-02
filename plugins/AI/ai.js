const axios = require('axios');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { uploadToImgbb } = require('../../lib/functions');
const config =require('../../config');
const { LRUCache } = require('lru-cache');

const conversationHistoryCache = new LRUCache({ max: 6, ttl: 1000 * 60 * 60 });

function formatToWhatsApp(text) {
    if (!text) return '';
    return text
        .replace(/^#\s(.+)/gm, '*$1*')
        .replace(/\*{3}(.+?)\*{3}/g, '*_$1_*')
        .replace(/\*{2}(.+?)\*{2}/g, '*$1*')
        .replace(/\*(.+?)\*/g, '_$1_')
        .replace(/~~(.+?)~~/g, '~$1~')
        .replace(/^[\s]*-\s/gm, '• ')
        .replace(/^[\s]*\*\s/gm, '• ');
}

function formatHistory(history) {
    if (!history || history.length === 0) return "";
    return `Ini adalah 3 riwayat percakapan terakhirmu:\n${history.map(turn => `${turn.role}: ${turn.content}`).join('\n')}`;
}

module.exports = {
    command: ['ai'],
    description: 'Berinteraksi dengan Alicia, AI asistenmu yang cerdas.',
    category: 'Tools',
    run: async (sock, message, args, { isAuto } = {}) => {
        if (!isAuto && !message.isGroup) {
            return message.reply('Perintah `.ai` hanya bisa digunakan di dalam grup.\n\nDi chat pribadi, aku akan merespons semua pesanmu secara otomatis (kecuali perintah).');
        }

        let prompt = args.join(' ');
        const senderJid = message.sender;
        const quotedMessage = message.msg?.contextInfo?.quotedMessage;
        
        let userHistory = conversationHistoryCache.get(senderJid) || [];

        if (!prompt && !quotedMessage && !isAuto) {
            return message.reply(
`*🤖 Hai, Aku Alicia, Asisten AI-mu!*

Senang bertemu denganmu! 😊 Aku siap membantu apa pun yang kamu butuhkan.
Aku bisa melakukan banyak hal dalam satu perintah, jadi katakan saja semuanya sekaligus.

*PENGGUNAAN DASAR (Hanya di Grup)*
- \`.ai <pertanyaan>\`
  _(Tanya apa saja, aku akan coba jawab!_ 👍*)*
- \`.ai buatkan gambar kucing yang lucu\`
  _(Membuat gambar dari imajinasimu)_

*FITUR MULTI-TUGAS*
Gabungkan beberapa perintah, biar praktis.
*Contoh:* \`.ai buatkan gambar pemandangan, putar lagu DJ Ya Odna, dan cari info presiden Indonesia terkini\`

*RIWAYAT PERCAKAPAN*
Aku mengingat 3 percakapan terakhir kita untuk menjaga obrolan tetap nyambung! 😉`
            );
        }

        if (isAuto && !prompt && !quotedMessage) return;

        let waitingMessage;
        let context = [];
        let tasksExecuted = false;

        try {
            waitingMessage = await message.reply('Tentu, serahkan padaku! Sedang kupikirkan... 🤔');
            const currentDateString = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
            context.push(`(Waktu Saat Ini: ${currentDateString})`);

            if (quotedMessage) {
                if (/imageMessage/.test(Object.keys(quotedMessage)[0])) {
                    await sock.sendMessage(message.from, { text: 'Asyik, ada gambar! Aku cek isinya dulu ya... 👀', edit: waitingMessage.key });
                    const buffer = await downloadMediaMessage({ message: quotedMessage }, 'buffer', {});
                    const imageUrl = await uploadToImgbb(buffer);
                    if (imageUrl) {
                        const ocrResponse = await axios.get(`https://nirkyy-dev.hf.space/api/v1/ocr-img?url=${encodeURIComponent(imageUrl)}`);
                        const ocrText = ocrResponse.data?.data?.text;
                        if (ocrText) context.push(`(Konteks dari gambar yang dibalas: "${ocrText}")`);
                    }
                } else {
                    const repliedText = quotedMessage.conversation || quotedMessage.extendedTextMessage?.text || '';
                    if (repliedText) context.push(`(Konteks dari pesan yang dibalas: "${repliedText}")`);
                }
            }
            
            const conversationHistoryText = formatHistory(userHistory);
            const initialQueryForProcessing = `${conversationHistoryText}\n\n${context.join('\n')}\n\nPertanyaan pengguna saat ini: ${prompt || "(merespons pesan sebelumnya)"}`.trim();
            
            const unifiedTaskRouterPrompt = `Anda adalah perute tugas AI yang sangat cerdas. Tugas Anda adalah mengurai permintaan pengguna DAN RIWAYAT PERCAKAPAN untuk mengidentifikasi SEMUA tugas yang bisa dieksekusi. Tugas yang didukung: [IMAGE], [PLAY], [SEARCH].\n\nATURAN:\n1. Balas HANYA dengan daftar tugas berformat \`[TUGAS:argumen]\`, dipisahkan koma.\n2. Untuk [IMAGE]: Ambil permintaan sederhana pengguna dan UBAH menjadi deskripsi gambar yang detail dan sinematik dalam BAHASA INGGRIS.\n3. Untuk [PLAY] dan [SEARCH]: Ekstrak argumen dalam BAHASA INDONESIA. Jika ada beberapa topik pencarian, PISAHKAN menjadi beberapa tugas [SEARCH].\n4. Jika permintaan adalah pertanyaan umum, sapaan, atau tidak ada tugas, balas dengan \`[ANSWER_DIRECTLY]\`.`;
            let routerResponse = await axios.post('https://nirkyy-dev.hf.space/api/v1/writecream-gemini', { system: unifiedTaskRouterPrompt, query: initialQueryForProcessing });
            let toolResponse = routerResponse.data.data.mes;
            
            if (toolResponse && !toolResponse.includes('ANSWER_DIRECTLY')) {
                tasksExecuted = true;
                const taskRegex = /\[(IMAGE|PLAY|SEARCH):(.*?)\]/g;
                const tasks = [...toolResponse.matchAll(taskRegex)];
                
                for (const task of tasks) {
                    const [_, taskType, taskArg] = task;
                    const argument = taskArg.trim();
                    switch (taskType) {
                        case 'IMAGE':
                            await sock.sendMessage(message.from, { text: `Oke, aku mulai menggambar "*${argument}*"! 🎨`, edit: waitingMessage.key });
                            await message.media(`Ini dia gambarnya, semoga kamu suka! ✨`, `https://nirkyy-dev.hf.space/api/v1/writecream-text2image?prompt=${encodeURIComponent(argument)}`);
                            break;
                        case 'PLAY':
                            await sock.sendMessage(message.from, { text: `Sip, lagu "*${argument}*" sedang disiapkan! 🎶`, edit: waitingMessage.key });
                            await message.media(`Selamat menikmati lagunya!\n*${argument}*`, `https://nirkyy-dev.hf.space/api/v1/ytplay-mp3?q=${encodeURIComponent(argument)}`);
                            break;
                        case 'SEARCH':
                            await sock.sendMessage(message.from, { text: `Oke, aku cari info tentang "*${argument}*" dulu ya... 🔍`, edit: waitingMessage.key });
                            const searchApiUrl = `https://nirkyy-dev.hf.space/api/v1/yahoo-search?q=${encodeURIComponent(argument)}`;
                            const searchResult = await axios.get(searchApiUrl);
                            const searchData = searchResult.data?.data?.results.slice(0, 3).map((res) => `- ${res.description}`).join('\n');
                            if (searchData) context.push(`(Aku sudah mencari informasi tentang "${argument}" dan ini hasilnya: "${searchData}")`);
                            break;
                    }
                }
            }
            
            let finalSystemPrompt = `Kamu adalah "Alicia AI", seorang asisten AI yang ramah, cerdas, dan to-the-point.\n\nATURAN PALING PENTING:\n- **TUGAS SUDAH SELESAI:** Semua tugas seperti [IMAGE], [PLAY], [SEARCH] sudah dieksekusi oleh sistem lain sebelum prompt ini. Peranmu adalah memberikan komentar penutup yang ramah ATAU menjawab pertanyaan umum yang tersisa dalam prompt pengguna.\n- **JANGAN MENGULANGI TUGAS:** Jangan pernah membahas tugas seolah-olah kamu yang akan melakukannya. JANGAN meminta detail lebih lanjut untuk tugas yang sudah selesai.\n- **LANGSUNG KE JAWABAN:** Jangan gunakan sapaan atau basa-basi pembuka. Langsung berikan jawaban yang diminta.\n- **JAWABAN RINGKAS & PADAT:** Gunakan bahasa "aku-kamu" yang santai. Berikan jawaban yang informatif tapi tidak bertele-tele. Hindari paragraf panjang.\n- **JANGAN MENGAKU AI:** Anggap dirimu adalah partner percakapan yang cerdas.\n- **Internalisasi Info:** Jika ada hasil pencarian dalam konteks, anggap itu sebagai pengetahuan internalmu. JANGAN PERNAH menyebutkan bahwa kamu 'mencari di internet'.\n\nRIWAYAT PERCAKAPAN TERAKHIR:\n${conversationHistoryText}`;

            const finalCombinedPrompt = `KONTEKS SAAT INI (termasuk hasil tugas yang sudah selesai):\n${context.join('\n')}\n\nPERMINTAAN ASLI PENGGUNA: ${prompt || "(merespons pesan sebelumnya)"}`.trim();
            
            let finalAiResponse = await axios.post('https://nirkyy-dev.hf.space/api/v1/writecream-gemini', { system: finalSystemPrompt, query: finalCombinedPrompt });
            let finalResponseText = finalAiResponse.data.data.mes;

            if (!finalResponseText && tasksExecuted) {
                finalResponseText = "Semua tugasmu sudah kuselesaikan! ✨ Ada lagi yang bisa kubantu?";
            } else if (!finalResponseText) {
                finalResponseText = "Hmm, sepertinya aku butuh sedikit waktu untuk memikirkannya. Coba tanya lagi dengan cara lain, ya? 🤔";
            }
            
            if (userHistory.length >= 6) userHistory.splice(0, 2);
            userHistory.push({ role: 'User', content: prompt || "(merespons pesan sebelumnya)" });
            userHistory.push({ role: 'Alicia', content: finalResponseText });
            conversationHistoryCache.set(senderJid, userHistory);
            
            await sock.sendMessage(message.from, { text: formatToWhatsApp(finalResponseText), edit: waitingMessage.key });

        } catch (error) {
            console.error('Error pada plugin AI:', error);
            const errorMessage = "Aduh, maaf sekali! Sepertinya ada sedikit masalah teknis di pihakku. 😥 Boleh coba lagi sebentar?";
            if (waitingMessage && waitingMessage.key) {
                await sock.sendMessage(message.from, { text: errorMessage, edit: waitingMessage.key });
            } else {
                await message.reply(errorMessage);
            }
        }
    }
};