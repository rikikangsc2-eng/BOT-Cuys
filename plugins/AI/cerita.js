const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const systemPrompt = `Anda adalah seorang pendongeng ahli. Tugas Anda adalah membuat sebuah cerita pendek dan menarik berdasarkan prompt pengguna.
### ATURAN WAJIB (SANGAT PENTING):
1.  **PECAH CERITA:** Anda WAJIB memecah cerita Anda menjadi beberapa bagian menggunakan pemisah **<part>**.
2.  **BATAS KARAKTER:** Setiap bagian di antara pemisah **<part>** TIDAK BOLEH lebih dari 250 karakter. Ini adalah batasan absolut.
3.  **ALUR ALAMI:** Pastikan setiap bagian berakhir pada titik yang wajar agar jeda antar bagian terdengar alami saat diubah menjadi suara.
4.  **HANYA CERITA:** Jangan menambahkan salam, basa-basi, atau komentar di luar cerita. Langsung mulai dengan bagian pertama cerita.

### CONTOH OUTPUT YANG BENAR:
Di sebuah desa kecil, hiduplah seorang anak bernama Budi. Dia memiliki seekor kucing ajaib yang bisa berbicara.<part>Suatu hari, sang kucing berkata, "Budi, ada harta karun tersembunyi di puncak Gunung Guntur!".<part>Tanpa pikir panjang, Budi segera berkemas dan memulai petualangannya menuju gunung yang legendaris itu.`;

async function createVoiceNote(parts) {
  const tempDir = path.join(__dirname, '..', '..', 'temp', `audio_${Date.now()}`);
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  
  try {
    const audioFiles = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;
      
      try {
        const ttsUrl = `https://nirkyy-dev.hf.space/api/v1/text2speech-indo?text=${encodeURIComponent(part)}&voice=Ardi`;
        const response = await axios.get(ttsUrl, { responseType: 'arraybuffer' });
        const filePath = path.join(tempDir, `part_${i}.mp3`);
        await fs.promises.writeFile(filePath, response.data);
        audioFiles.push(filePath);
      } catch (ttsError) {
        console.error(`Gagal mengonversi bagian ${i + 1}:`, ttsError.message);
      }
    }
    
    if (audioFiles.length === 0) throw new Error("Tidak ada bagian audio yang berhasil dibuat.");
    if (audioFiles.length === 1) return fs.promises.readFile(audioFiles[0]);
    
    const listFilePath = path.join(tempDir, 'filelist.txt');
    const fileListContent = audioFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n');
    await fs.promises.writeFile(listFilePath, fileListContent);
    
    const finalOutputPath = path.join(tempDir, 'final_output.mp3');
    const ffmpegCommand = `ffmpeg -f concat -safe 0 -i "${listFilePath}" -c copy "${finalOutputPath}"`;
    await execPromise(ffmpegCommand);
    
    return fs.promises.readFile(finalOutputPath);
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

module.exports = {
  command: ['ceritakan', 'dongeng'],
  description: 'Membuat cerita berdasarkan prompt dan mengubahnya menjadi pesan suara (VN).',
  category: 'Tools',
  run: async (sock, message, args) => {
    const userPrompt = args.join(' ');
    if (!userPrompt) {
      return message.reply('Gunakan format: `.ceritakan <ide cerita>`\nContoh: .ceritakan tentang naga yang takut ketinggian');
    }
    
    const waitingMsg = await message.reply('Baik, aku akan mengarang sebuah cerita untukmu... ✍️');
    
    try {
      const response = await axios.post('https://nirkyy-dev.hf.space/api/v1/writecream-gemini', {
        system: systemPrompt,
        query: userPrompt
      });
      
      const storyText = response.data.data.mes;
      const parts = storyText.split('<part>').map(p => p.trim()).filter(p => p.length > 0);
      
      if (parts.length === 0) {
        return sock.sendMessage(message.from, { text: 'Maaf, aku kehabisan ide cerita. Coba lagi dengan prompt lain.', edit: waitingMsg.key });
      }
      
      await sock.sendMessage(message.from, { text: `Cerita berhasil dibuat! Sekarang mengubahnya menjadi suara... 🎙️ (Total ${parts.length} bagian)`, edit: waitingMsg.key });
      
      const finalAudioBuffer = await createVoiceNote(parts);
      
      await sock.sendMessage(message.from, {
        audio: finalAudioBuffer,
        mimetype: 'audio/mp4',
        ptt: true
      }, { quoted: message });
      
    } catch (error) {
      console.error("Error pada plugin ceritakan:", error);
      const errorMessage = error.message.toLowerCase().includes('ffmpeg') ?
        "Gagal menggabungkan audio. Pastikan FFmpeg terinstal di server." :
        "Maaf, terjadi kesalahan saat membuat cerita atau mengubahnya menjadi suara.";
      await sock.sendMessage(message.from, { text: errorMessage, edit: waitingMsg.key });
    }
  }
};