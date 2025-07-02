const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const config =require('../../config');

function getAllFiles(dirPath, arrayOfFiles = []) {
    const files = fs.readdirSync(dirPath);

    const excludedDirs = ['node_modules', '.git', 'session', 'database', '.npm','.pm2'];

    files.forEach(file => {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (!excludedDirs.includes(path.basename(fullPath))) {
                arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
            }
        } else {
            arrayOfFiles.push(fullPath);
        }
    });

    return arrayOfFiles;
}

module.exports = {
    command: 'createsc',
    description: 'Mengarsipkan semua file sumber bot ke dalam file ZIP (Owner only).',
    category: 'Owner',
    run: async (sock, message, args) => {
        const ownerJid = `${config.ownerNumber}@s.whatsapp.net`;

        await message.reply('Mengumpulkan file sumber dan membuat arsip... Ini mungkin memerlukan beberapa saat.');

        try {
            const zip = new JSZip();
            const rootDir = path.join(__dirname, '..', '..');
            const filesToZip = getAllFiles(rootDir);

            if (filesToZip.length === 0) {
                return message.reply('Tidak ada file yang ditemukan untuk diarsipkan.');
            }
            
            for (const filePath of filesToZip) {
                const fileContent = fs.readFileSync(filePath);
                const relativePath = path.relative(rootDir, filePath);
                zip.file(relativePath, fileContent);
            }
            
            const zipBuffer = await zip.generateAsync({
                type: 'nodebuffer',
                compression: 'DEFLATE',
                compressionOptions: {
                    level: 9
                }
            });

            await sock.sendMessage(
                message.from, 
                {
                    document: zipBuffer,
                    mimetype: 'application/zip',
                    fileName: `source-code-${config.botName}.zip`,
                    caption: `✅ Berhasil mengarsipkan ${filesToZip.length} file sumber bot.`
                }, 
                { quoted: message }
            );

        } catch (e) {
            console.error('Error pada plugin createsc:', e);
            await message.reply(`Gagal membuat arsip ZIP. Error: ${e.message}`);
        }
    }
};