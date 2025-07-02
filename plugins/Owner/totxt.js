const fs = require('fs');
const path = require('path');
const config = require('../../config');

function getAllJsFiles(dirPath, arrayOfFiles = []) {
    const files = fs.readdirSync(dirPath);
    const excludedDirs = ['node_modules', '.git', 'session', 'database', '.npm'];

    files.forEach(file => {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (!excludedDirs.includes(path.basename(fullPath))) {
                arrayOfFiles = getAllJsFiles(fullPath, arrayOfFiles);
            }
        } else if (path.extname(file) === '.js') {
            arrayOfFiles.push(fullPath);
        }
    });

    return arrayOfFiles;
}

module.exports = {
    command: 'totxt',
    description: 'Menggabungkan semua file .js bot ke dalam satu file .txt.',
    category: 'Owner',
    run: async (sock, message, args) => {
        const ownerJid = `${config.ownerNumber}@s.whatsapp.net`;
        if (message.sender !== ownerJid) {
            return message.reply('Perintah ini hanya untuk Owner.');
        }

        await message.reply('Mengumpulkan dan menggabungkan file .js...');

        try {
            const rootDir = path.join(__dirname, '..', '..');
            const jsFiles = getAllJsFiles(rootDir);

            if (jsFiles.length === 0) {
                return message.reply('Tidak ada file .js yang ditemukan.');
            }

            let combinedContent = '';
            for (const filePath of jsFiles) {
                const fileContent = fs.readFileSync(filePath, 'utf-8');
                const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');
                combinedContent += `--- START FILE: ${relativePath} ---\n${fileContent}\n--- END FILE: ${relativePath} ---\n\n`;
            }

            const txtBuffer = Buffer.from(combinedContent, 'utf-8');

            await sock.sendMessage(
                message.from, {
                    document: txtBuffer,
                    mimetype: 'text/plain',
                    fileName: `source-code-js.txt`,
                    caption: `✅ Berhasil menggabungkan ${jsFiles.length} file .js.`
                }, {
                    quoted: message
                }
            );

        } catch (e) {
            await message.reply(`Gagal memproses file. Error: ${e.message}`);
        }
    }
};