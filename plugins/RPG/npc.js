const db = require('../../lib/database');
const config = require('../../config');
const gameConfig = require('../../gameConfig');
const axios = require('axios');
const { LRUCache } = require('lru-cache');

const npcSessions = new LRUCache({ max: 100, ttl: 1000 * 60 * 5 });

async function handleNpcInteraction(sock, message, args, npcKey) {
    const senderJid = message.sender;
    const npc = gameConfig.npcData[npcKey];
    const userInput = args.join(' ');
    const sessionKey = `${senderJid}:${npcKey}`;
    
    let session = npcSessions.get(sessionKey) || { history: [], pendingOffer: null };
    
    if (!userInput) {
        const greeting = `👋 Halo! Saya *${npc.name}*. Ada yang bisa saya bantu?\n\n` +
            `Kamu bisa bertanya tentang barang, menawar harga, atau langsung mengobrol biasa saja.\n\n` +
            `Contoh:\n- \`.${npcKey} punya jimat anti rampok? 150rb boleh ga?\`\n` +
            `- \`.${npcKey} hari yang cerah ya ☀️\`\n\n` +
            `Ketik \`.${npcKey} list\` untuk melihat daftar barang lengkap.`;
        return message.reply(greeting);
    }
    
    const waitingMsg = await message.reply(`*${npc.name}* sedang berpikir... 🤔`);
    
    try {
        let availableItems = Object.entries(npc.items).map(([key, item]) =>
            `- ${item.name} (key: ${key}, harga: ${item.price})`
        ).join('\n');
        
        const systemPrompt = `Kamu adalah NPC RPG bernama ${npc.name}.
        ### KEPRIBADIAN & GAYA BAHASA
        - **Persona Utama:** "${npc.promptDesc}". Selalu balas sesuai karakter ini.
        - **Ekspresif & Natural:** Gunakan emoji yang sesuai dan buat percakapan terasa lebih hidup dan tidak kaku. Berikan sedikit alasan di balik jawabanmu.
        
        ### BARANG JUALAN
        Kamu hanya menjual barang berikut. JANGAN mengarang item/harga lain.
        ${availableItems}

        ### ATURAN TRANSAKSI (SANGAT PENTING!)
        1. **PENANDA TRANSAKSI TUNGGAL:** Jika pengguna ingin membeli, kamu WAJIB menyertakan HANYA SATU penanda di akhir balasanmu: \`[OFFER:{...}]\`.
        2. **STRUKTUR PENANDA:** Strukturnya harus \`{"items": [...], "totalCost": ...}\`.
           - \`items\`: sebuah ARRAY yang berisi SEMUA item yang dibeli, masing-masing sebagai objek \`{"itemKey": "...", "itemName": "...", "amount": ...}\`.
           - \`totalCost\`: harga KESELURUHAN untuk SEMUA item.
        3. **ATURAN UTAMA:** Jika pengguna membeli *beberapa item sekaligus*, gabungkan SEMUANYA ke dalam satu array \`items\` di dalam SATU marker \`[OFFER]\`. **JANGAN PERNAH** membuat lebih dari satu marker \`[OFFER]\`.
        4. **CONTOH MULTI-ITEM:** Pengguna: "Beli 2 daging dan 1 ikan". Kamu harus hitung totalnya (misal 2*750 + 1*500 = 2000), lalu buat marker: \`[OFFER:{"items":[{"itemKey":"daging","amount":2},{"itemKey":"ikan","amount":1}],"totalCost":2000}]\`.
        5. **TAWAR-MENAWAR:** Jika kamu memberi diskon, PASTIKAN \`totalCost\` di marker adalah harga AKHIR setelah diskon.
        6. **Hanya Mengobrol:** Jika hanya ngobrol, balas seperti biasa tanpa marker.
        7. **Ajakan Konfirmasi:** Selalu sertakan ajakan konfirmasi seperti "_Deal? Ketik \`.${npcKey} ya\` untuk lanjut._" setelah membuat penawaran.`;
        
        let historyForAI = session.history.map(h => `${h.role}: ${h.content}`).join('\n');
        const query = `Riwayat Percakapan:\n${historyForAI}\n\nPesan Pengguna: "${userInput}"`;
        
        const response = await axios.post('https://nirkyy-dev.hf.space/api/v1/writecream-gemini', { system: systemPrompt, query });
        let aiReply = response.data.data.mes;
        
        const offerRegex = /\[OFFER:({.*})\]/g;
        const allOffers = [...aiReply.matchAll(offerRegex)];
        let aggregatedOffer = { items: [], totalCost: 0 };
        let hasValidOffer = false;
        
        if (allOffers.length > 0) {
            for (const offerMatch of allOffers) {
                try {
                    const offerData = JSON.parse(offerMatch[1]);
                    if (offerData.items && Array.isArray(offerData.items) && typeof offerData.totalCost === 'number') {
                        aggregatedOffer.items.push(...offerData.items);
                        aggregatedOffer.totalCost += offerData.totalCost;
                        hasValidOffer = true;
                    } else if (offerData.itemKey && typeof offerData.totalCost === 'number') {
                        aggregatedOffer.items.push({ itemKey: offerData.itemKey, itemName: offerData.itemName, amount: offerData.amount });
                        aggregatedOffer.totalCost += offerData.totalCost;
                        hasValidOffer = true;
                    }
                } catch (e) {
                    console.error("Gagal mem-parsing offer JSON dari AI:", offerMatch[1]);
                }
            }
        }
        
        let finalReply = aiReply.replace(offerRegex, '').trim();
        
        if (hasValidOffer) {
            session.pendingOffer = aggregatedOffer;
        } else {
            session.pendingOffer = null;
        }
        
        session.history.push({ role: 'user', content: userInput });
        session.history.push({ role: 'assistant', content: finalReply });
        if (session.history.length > 6) session.history.splice(0, 2);
        
        npcSessions.set(sessionKey, session);
        await sock.sendMessage(message.from, { text: finalReply, edit: waitingMsg.key });
        
    } catch (e) {
        console.error("Error di NPC AI:", e);
        await sock.sendMessage(message.from, { text: "Duh, saya lagi pusing. Nanti ngobrol lagi ya.", edit: waitingMsg.key });
    }
}

module.exports = {
    command: ['npc', 'pakpurpur', 'nengnirsa', 'mangujang'],
    description: 'Berinteraksi dengan NPC menggunakan AI dan perintah langsung.',
    category: 'RPG',
    run: async (sock, message, args) => {
        const command = message.body.trim().split(/ +/)[0].slice(config.prefix.length).toLowerCase();
        
        if (command === 'npc') {
            let npcList = "👥 *Daftar NPC di Dunia Ini*\n\nKetuk perintah untuk mulai berinteraksi.\n\n";
            for (const key in gameConfig.npcData) {
                const npc = gameConfig.npcData[key];
                npcList += `*${npc.name}*\n- ${npc.promptDesc}\n- Perintah: \`.${key}\`\n\n`;
            }
            return message.reply(npcList);
        }
        
        const npcKey = Object.keys(gameConfig.npcData).find(k => k === command);
        if (!npcKey) return;
        
        const senderJid = message.sender;
        const action = args[0]?.toLowerCase();
        const sessionKey = `${senderJid}:${npcKey}`;
        let session = npcSessions.get(sessionKey) || { history: [], pendingOffer: null };
        const tx = session.pendingOffer;
        
        if (action === 'ya' || action === 'ok' || action === 'gas') {
            if (!tx || !tx.items || tx.items.length === 0) return message.reply("Tidak ada penawaran yang perlu dikonfirmasi.");
            
            let usersDb = db.get('users');
            let user = usersDb[senderJid] || { balance: 0 };
            
            if (user.balance >= tx.totalCost) {
                user.balance -= tx.totalCost;
                
                const specialItems = ['jimatAntiRampok', 'jimatPembalikTakdir', 'ramuanBerburuSuper', 'azimatDuelSakti', 'koinKeberuntungan', 'dungeonTicket'];
                let purchasedItemsText = '';
                
                for (const item of tx.items) {
                    if (specialItems.includes(item.itemKey)) {
                        user[item.itemKey] = (user[item.itemKey] || 0) + item.amount;
                    } else {
                        if (!user[item.itemKey]) user[item.itemKey] = { amount: 0 };
                        user[item.itemKey].amount = (user[item.itemKey].amount || 0) + item.amount;
                    }
                    purchasedItemsText += `- ${item.amount}x ${item.itemName}\n`;
                }
                
                usersDb[senderJid] = user;
                db.save('users', usersDb);
                
                session.pendingOffer = null;
                npcSessions.set(sessionKey, session);
                
                const successMessage = `✅ Transaksi berhasil! Anda membeli:\n${purchasedItemsText}\nTotal belanja: *Rp ${tx.totalCost.toLocaleString()}*.`;
                return message.reply(successMessage);
            } else {
                return message.reply(`Duitmu kurang, bro. Butuh Rp ${tx.totalCost.toLocaleString()}, kamu cuma punya Rp ${user.balance.toLocaleString()}.`);
            }
        }
        
        if (action === 'batal' || action === 'ga' || action === 'no') {
            if (!tx) return message.reply("Tidak ada penawaran yang bisa dibatalkan.");
            session.pendingOffer = null;
            npcSessions.set(sessionKey, session);
            return message.reply("Oke, transaksi dibatalkan.");
        }
        
        if (action === 'list' || action === 'shop') {
            const npc = gameConfig.npcData[npcKey];
            let listText = `🏪 *Toko Milik ${npc.name}*\n\n`;
            Object.values(npc.items).forEach((item, index) => {
                listText += `*${index + 1}. ${item.name}*\n`;
                listText += `   - Harga: Rp ${item.price.toLocaleString()}\n\n`;
            });
            listText += `_Untuk membeli, cukup bilang ke saya apa yang kamu mau. Contoh: ".${npcKey} mau beli jimat 1"_`;
            return message.reply(listText);
        }
        
        const npcArgs = message.body.trim().split(/ +/).slice(1);
        return handleNpcInteraction(sock, message, npcArgs, npcKey);
    }
};