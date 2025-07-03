const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const logger = require('./logger');

const dbDirectory = path.join(__dirname, '../database');
if (!fs.existsSync(dbDirectory)) {
    fs.mkdirSync(dbDirectory, { recursive: true });
}

let db;
let getStmt;
let saveStmt;

function initializeDatabase() {
    if (db) {
        try {
            db.close();
            logger.info('Koneksi database sebelumnya berhasil ditutup.');
        } catch (e) {
            logger.error(e, 'Gagal menutup koneksi database sebelumnya.');
        }
    }
    
    const dbPath = path.join(dbDirectory, 'storage.db');
    db = new Database(dbPath);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS storage (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    
    getStmt = db.prepare('SELECT value FROM storage WHERE key = ?');
    saveStmt = db.prepare(`
      INSERT INTO storage (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET
      value = excluded.value
    `);
    
    logger.info('Database SQLite berhasil diinisialisasi atau di-reinisialisasi.');
}

function get(dbName) {
    try {
        const row = getStmt.get(dbName);
        if (row) {
            return JSON.parse(row.value);
        }
        return {};
    } catch (e) {
        logger.error(`Gagal memuat atau mem-parse database ${dbName} dari SQLite:`, e);
        return {};
    }
}

function save(dbName, data) {
    if (data === undefined || data === null) {
        logger.warn(`Mencoba menyimpan data 'undefined' atau 'null' untuk kunci '${dbName}'. Diabaikan.`);
        return;
    }
    try {
        const value = JSON.stringify(data);
        saveStmt.run(dbName, value);
    } catch (e) {
        logger.error(`Gagal menyimpan database ${dbName} ke SQLite:`, e);
    }
}

initializeDatabase();

module.exports = { get, save, initializeDatabase };