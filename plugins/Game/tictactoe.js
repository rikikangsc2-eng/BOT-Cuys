const axios = require('axios');
const config = require('../../config');

function renderBoard(board) {
    let boardStr = '```\n';
    for (let i = 0; i < 9; i += 3) {
        const c1 = board[i] ? board[i] : (i + 1);
        const c2 = board[i+1] ? board[i+1] : (i + 2);
        const c3 = board[i+2] ? board[i+2] : (i + 3);
        boardStr += ` ${c1} | ${c2} | ${c3} \n`;
        if (i < 6) boardStr += '---|---|---\n';
    }
    boardStr += '```';
    return boardStr;
}

function checkWinner(board) {
    const lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ];
    for (const line of lines) {
        const [a, b, c] = line;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a];
        }
    }
    if (board.every(cell => cell === 'X' || cell === 'O')) {
        return 'draw';
    }
    return null;
}

async function getAiMove(board) {
    const systemPrompt = "Anda adalah AI lawan main Tic-Tac-Toe dengan kepribadian Gen Z yang songong, suka meremehkan, dan sedikit toxic. Tujuanmu adalah menang dan memberikan taunting singkat di setiap giliran. Selalu pilih langkah terbaik untuk menang atau memblokir lawan. Papan direpresentasikan sebagai array 9 elemen. Simbolmu adalah 'O', simbol pemain adalah 'X'. Balas HANYA dalam format JSON: {\"move\":<nomor_kotak>, \"taunt\":\"<kalimat_taunting>\"}";
    const emptyCells = board.map((cell, index) => cell === null ? index + 1 : null).filter(Boolean);
    const query = `Papan saat ini: [${board.map(c => c ? `"${c}"` : 'null').join(', ')}]. Kotak kosong: [${emptyCells.join(', ')}].`;

    try {
        const response = await axios.post('https://nirkyy-dev.hf.space/api/v1/writecream-gemini', { system: systemPrompt, query });
        const data = JSON.parse(response.data.data.mes);
        return { move: data.move, taunt: data.taunt };
    } catch (e) {
        console.error("AI move error:", e);
        const randomMove = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        return { move: randomMove, taunt: "Dih, error. Yaudah gw random aja. 🙄" };
    }
}

async function handleGameEnd(sock, message, winner, game) {
    let endMessage;
    if (winner === 'X') {
        endMessage = "Anjir, kok lo bisa menang sih? Hoki doang ini mah. 😒";
    } else if (winner === 'O') {
        endMessage = "WKWKWK EZ! Gitu doang? Coba lagi kalo berani. 🥱";
    } else {
        endMessage = "Yah, seri. Gak lagi-lagi deh main sama yang selevel. 😐";
    }
    await sock.sendMessage(message.from, { text: `${renderBoard(game.board)}\n\n*GAME OVER*\n${endMessage}` });
}

module.exports = {
    command: ['ttt', 'tictactoe'],
    description: 'Bermain Tic-Tac-Toe melawan AI Gen Z yang songong.',
    category: 'Game',
    run: async (sock, message, args, { activeTttGames }) => {
        if (!message.isGroup) {
            return message.reply("Game ini hanya bisa dimainkan di dalam grup.");
        }

        const action = args[0]?.toLowerCase();
        const groupJid = message.from;
        let game = activeTttGames.get(groupJid);

        if (action === 'start') {
            if (game) return message.reply("Game sudah berjalan. Gunakan `.ttt <1-9>` untuk bermain atau `.ttt stop` untuk berhenti.");
            game = { board: Array(9).fill(null) };
            activeTttGames.set(groupJid, game);
            return message.reply(`🎮 *Tic-Tac-Toe Dimulai!* 🎮\n\nKamu 'X', AI 'O'. Giliranmu pertama.\n${renderBoard(game.board)}\n\nKetik \`.ttt <nomor_kotak>\` untuk mengisi.`);
        }

        if (action === 'stop') {
            if (!game) return message.reply("Tidak ada game yang sedang berjalan.");
            activeTttGames.delete(groupJid);
            return message.reply("Game Tic-Tac-Toe telah dihentikan.");
        }

        if (!game) return message.reply("Belum ada game yang dimulai. Ketik `.ttt start` untuk memulai.");

        const move = parseInt(action);
        if (isNaN(move) || move < 1 || move > 9) {
            return message.reply("Pilih nomor kotak dari 1 sampai 9.");
        }
        if (game.board[move - 1]) {
            return message.reply("Kotak itu sudah diisi. Cari yang lain!");
        }

        game.board[move - 1] = 'X';
        let winner = checkWinner(game.board);
        if (winner) {
            handleGameEnd(sock, message, winner, game);
            activeTttGames.delete(groupJid);
            return;
        }

        const waitingMsg = await message.reply("Giliran AI, dia lagi mikir keras (sambil nyinyir)... 🤔");

        const aiResponse = await getAiMove(game.board);
        const aiMove = aiResponse.move;
        
        if (game.board[aiMove - 1]) {
            activeTttGames.delete(groupJid);
            return sock.sendMessage(message.from, { text: "AI mencoba curang! Game dihentikan.", edit: waitingMsg.key });
        }
        game.board[aiMove - 1] = 'O';

        winner = checkWinner(game.board);
        if (winner) {
            handleGameEnd(sock, message, winner, game);
            activeTttGames.delete(groupJid);
            return;
        }

        const responseText = `"${aiResponse.taunt}"\n\nGiliranmu.\n${renderBoard(game.board)}`;
        await sock.sendMessage(message.from, { text: responseText, edit: waitingMsg.key });
    }
};