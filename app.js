const express = require('express');
const path = require('path');
const fs = require('fs');
const logger = require('./lib/logger');

const app = express();
const PORT = process.env.PORT || 3000;

const sessionPath = path.resolve(__dirname, 'session');
const dbFilePath = path.resolve(__dirname, 'database', 'storage.db');

app.get('/sinkronsesi', (req, res) => {
  const credsPath = path.resolve(sessionPath, 'creds.json');
  if (fs.existsSync(credsPath)) {
    res.setHeader('Content-Type', 'application/json');
    res.sendFile(credsPath);
  } else {
    logger.error('[HTTP] Permintaan /sinkronsesi gagal: creds.json tidak ditemukan.');
    res.status(404).send('File creds.json tidak ditemukan.');
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