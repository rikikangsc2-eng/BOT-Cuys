const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
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
    command: 'tozip',
    description: 'Mengarsipkan file .js bot dengan nama file yang menyertakan path (Owner only).',
    category: 'Owner',
    run: async (sock, message, args) => {
        const ownerJid = `${config.ownerNumber}@s.whatsapp.net`;
        if (message.sender !== ownerJid) {
            return message.reply('Perintah ini hanya untuk Owner.');
        }

        await message.reply('Mengumpulkan file .js dan membuat arsip dengan nama file yang dimodifikasi...');

        try {
            const zip = new JSZip();
            const rootDir = path.join(__dirname, '..', '..');
            const jsFiles = getAllJsFiles(rootDir);

            if (jsFiles.length === 0) {
                return message.reply('Tidak ada file .js yang ditemukan untuk diarsipkan.');
            }

            for (const filePath of jsFiles) {
                const fileContent = fs.readFileSync(filePath, 'utf-8');
                const relativePath = path.relative(rootDir, filePath);
                const newFileName = relativePath.replace(/[\\\/]/g, '#');
                
                zip.file(newFileName, fileContent);
            }

            const zipBuffer = await zip.generateAsync({
                type: 'nodebuffer',
                compression: 'DEFLATE',
                compressionOptions: {
                    level: 9
                }
            });

            await sock.sendMessage(
                message.from, {
                    document: zipBuffer,
                    mimetype: 'application/zip',
                    fileName: `source-code-${config.botName}-js-flat-hash.zip`,
                    caption: `✅ Berhasil mengarsipkan ${jsFiles.length} file .js ke dalam arsip datar.`
                }, {
                    quoted: message
                }
            );

        } catch (e) {
            console.error('Error pada plugin tozip:', e);
            await message.reply(`Gagal membuat arsip zip. Error: ${e.message}`);
        }
    }
};