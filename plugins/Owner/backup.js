const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const axios = require('axios');
const FormData = require('form-data');
const config = require('../../config');

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);
  
  files.forEach(file => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });
  
  return arrayOfFiles;
}

module.exports = {
  command: 'backupdb',
  description: 'Membuat dan mengunggah backup dari folder session dan database.',
  category: 'Owner',
  run: async (sock, message, args) => {
    const ownerJid = `${config.ownerNumber}@s.whatsapp.net`;
    if (message.sender !== ownerJid) {
      return message.reply('Perintah ini hanya untuk Owner.');
    }
    
    await message.reply('Memulai proses backup data sesi dan database...');
    
    try {
      const zip = new JSZip();
      const rootDir = path.join(__dirname, '..', '..');
      
      const sessionDir = path.join(rootDir, 'session');
      const databaseDir = path.join(rootDir, 'database');
      
      const filesToZip = [];
      if (fs.existsSync(sessionDir)) {
        filesToZip.push(...getAllFiles(sessionDir));
      }
      if (fs.existsSync(databaseDir)) {
        filesToZip.push(...getAllFiles(databaseDir));
      }
      
      if (filesToZip.length === 0) {
        return message.reply('Tidak ada file di folder session atau database untuk dibackup.');
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
      
      await message.reply('Backup berhasil dibuat, sedang mengunggah...');
      
      const form = new FormData();
      form.append('file', zipBuffer, { filename: `backup-${config.botName}-${Date.now()}.zip` });
      
      const response = await axios.post('https://temp.sh/upload', form, {
        headers: {
          ...form.getHeaders()
        }
      });
      
      if (response.data) {
        await message.reply(`✅ Backup berhasil diunggah!\n\nLink unduh (berlaku 3 hari):\n${response.data}`);
      } else {
        throw new Error('Respons dari server upload kosong.');
      }
      
    } catch (e) {
      console.error('Error pada plugin backupdb:', e);
      await message.reply(`Gagal membuat atau mengunggah backup. Error: ${e.message}`);
    }
  }
};