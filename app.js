const express = require('express');
const path = require('path');
const fs = require('fs');
const logger = require('./lib/logger');

const app = express();
const PORT = process.env.PORT || 3000;

const sessionPath = path.resolve(__dirname, 'session');
const dbFilePath = path.resolve(__dirname, 'database', 'storage.db');
const credsPath = path.resolve(sessionPath, 'creds.json');

const readAndValidateCreds = async () => {
  const MAX_READ_ATTEMPTS = 3;
  const RETRY_DELAY_MS = 200;
  
  for (let i = 0; i < MAX_READ_ATTEMPTS; i++) {
    try {
      if (!fs.existsSync(credsPath)) throw new Error("File creds.json tidak ada.");
      const fileContent = fs.readFileSync(credsPath, 'utf-8');
      JSON.parse(fileContent);
      return fileContent;
    } catch (error) {
      if (i === MAX_READ_ATTEMPTS - 1) {
        logger.error(`Gagal membaca/mem-parse creds.json setelah ${MAX_READ_ATTEMPTS} percobaan.`);
        throw error;
      }
      logger.warn(`Gagal membaca creds.json (percobaan ${i + 1}), mungkin sedang ditulis. Mencoba lagi...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
};

app.get('/sinkronsesi', async (req, res) => {
  try {
    const credsString = await readAndValidateCreds();
    res.setHeader('Content-Type', 'application/json');
    res.send(credsString);
  } catch (error) {
    logger.error(error, '[HTTP] Permintaan /sinkronsesi gagal total.');
    res.status(500).send(`Gagal memproses creds.json: ${error.message}`);
  }
});

app.get('/sinkrondb', (req, res) => {
  if (fs.existsSync(dbFilePath)) {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.sendFile(dbFilePath);
  } else {
    logger.error('[HTTP] Permintaan /sinkrondb gagal: storage.db tidak ditemukan.');
    res.status(404).send('File storage.db tidak ditemukan.');
  }
});

app.get('/removesesi', (req, res) => {
  try {
    logger.info('[HTTP] Menerima permintaan /removesesi...');
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
      logger.info('[HTTP] Folder sesi berhasil dihapus via endpoint.');
      res.status(200).send('Sesi berhasil dihapus.');
    } else {
      logger.warn('[HTTP] Folder sesi tidak ditemukan untuk dihapus via endpoint.');
      res.status(404).send('Folder sesi tidak ditemukan.');
    }
  } catch (e) {
    logger.error(e, '[HTTP] Gagal menghapus folder sesi via endpoint.');
    res.status(500).send(`Gagal menghapus sesi: ${e.message}`);
  }
});

app.use((req, res) => {
  res.redirect('https://nirkyy-dev.hf.space');
});

app.listen(PORT, () => {
  logger.info(`Server HTTP untuk sinkronisasi berjalan di port ${PORT}`);
});