const config = require('../../config');

const tutorialText = `
👋 *Hai! Selamat Datang di Dunia RPG ${config.botName}!*

Bingung mulai dari mana? Tenang, aku bakal pandu kamu dari nol sampai jadi sultan di sini. Simak baik-baik ya!

---

*BAGIAN 1: DASAR-DASAR SURVIVAL (Untuk Pemula)*

*1. Cek Profil Dulu Dong!*
Langkah pertama, kenali dirimu sendiri. Ketik:
\`\`\`.profile\`\`\`
Di situ kamu bisa lihat Level, XP, Saldo, dan aset-aset berhargamu.

*2. Cari Duit & XP!*
Modal utama adalah duit dan pengalaman. Ini cara gampangnya:
- \`\`\`.berburu\`\`\`: Masuk ke hutan, kalahkan monster, dan dapatkan hadiah. Ada cooldown, jadi sabar ya!
- \`\`\`.ngemis\`\`\`: Kalau lagi bokek banget, coba aja peruntunganmu. Siapa tahu ada sultan lewat.
- \`\`\`.klaim harian\`\`\`: Jangan lupa klaim hadiah harianmu!

*3. Main Game Biar Gak Bosen*
Sambil nunggu cooldown, main game aja! Hadiahnya lumayan buat nambah-nambah.
- \`\`\`.siapaaku\`\`\`
- \`\`\`.susunkata\`\`\`

*4. Naik Level Itu Penting!*
Setiap kali kamu dapat XP (dari berburu, duel, meracik, dll.), bar XP-mu akan terisi. Kalau penuh, kamu bakal *LEVEL UP!* Level tinggi membuka akses ke fitur-fitur keren.

---

*BAGIAN 2: JADI PENGRAJIN & PEBISNIS (Untuk Player Menengah)*

*1. Dari Sampah Jadi Harta Karun (Meracik)*
Udah punya banyak material dari berburu? Jangan dijual semua! Coba deh kamu racik jadi barang yang lebih mahal.
- Cek resep: \`\`\`.meracik\`\`\`
- Buat barang: \`\`\`.meracik baja\`\`\` (Contoh)
Meracik juga ngasih XP gede, lho!

*2. Jadi Trader Handal (Pasar)*
Lihat harga pasar lagi naik atau turun? Manfaatin momen!
- Cek harga & grafik: \`\`\`.harga emas\`\`\`
- Beli pas murah: \`\`\`.trading buy emas 10\`\`\`
- Jual pas mahal: \`\`\`.trading sell emas 10\`\`\`
Ini cara jadi kaya tanpa harus kotor-kotoran di hutan.

*3. Bangun Rumah Impian*
Udah punya duit dan material? Investasiin ke rumah!
- Cek status & biaya upgrade: \`\`\`.rumah\`\`\`
- Upgrade rumahmu: \`\`\`.rumah upgrade\`\`\`
- Jangan lupa ambil duitnya: \`\`\`.rumah klaim\`\`\`
Rumah ngasih kamu duit pasif tiap jam. Enak, kan? Tidur aja dibayar!

---

*BAGIAN 3: JALAN NINJA SANG MASTER (Untuk Para Ahli)*

*1. Saatnya Duel!*
Udah ngerasa kuat? Waktunya buktiin di arena!
- Bikin peralatan tempurmu: \`\`\`.meracik pedanglegendaris\`\`\`
- Pakai senjatamu: \`\`\`.pakai pedanglegendaris\`\`\`
- Tantang orang: \`\`\`.duel @user 10000\`\`\`
Duel adalah cara tercepat buat dapet duit banyak (atau kehilangan banyak 🤣). *High risk, high return!*

*2. Misi Harian, Cuan Tambahan*
Tiap hari ada misi baru yang bisa kamu selesaikan.
- Cek daftar misi: \`\`\`.quest\`\`\`
- Kalau udah selesai, klaim hadiahnya: \`\`\`.quest klaim Q1\`\`\`

*3. Jadi Preman (Opsional!)*
Kalau kamu suka tantangan dan... sedikit nakal.
- Intip target: \`\`\`.profile @user\`\`\`
- Gasak hartanya: \`\`\`.rampok @user\`\`\`
Hati-hati, kalau gagal bisa apes!

---

*BAGIAN 4: MANAJEMEN GUILD TINGKAT LANJUT*

Udah punya guild? Keren! Sekarang saatnya bikin guild-mu jadi yang terkuat.

*1. Kumpulkan Dana Perang (Bank Guild)*
Setiap anggota bisa menyumbang ke guild.
- \`\`\`.gdep 100000\`\`\` (Menyetor Rp 100.000 ke bank guild)
Setiap setoran juga akan menambah XP untuk guild-mu!

*2. Aktifkan Buff Guild!*
Owner guild bisa menggunakan uang dari bank untuk membeli *buff* (peningkatan sementara) yang menguntungkan SEMUA ANGGOTA.
- Cek status buff di: \`\`\`.guild info\`\`\`
- Beli buff (khusus Owner): \`\`\`.guild buybuff <nama_buff>\`\`\`
Contoh: \`\`\`.guild buybuff berkahHutan\`\`\`
Buff ini bisa meningkatkan peluang sukses berburu, bonus XP duel, dan banyak lagi! Gunakan secara strategis!

---

*TIPS PRO:*
- **Manfaatkan Cooldown:** Lakukan aktivitas lain (main game, trading) saat perintah utama seperti \`.berburu\` atau \`.duel\` sedang cooldown.
- **Diversifikasi:** Jangan cuma fokus di satu hal. Kombinasikan berburu, meracik, dan trading untuk hasil maksimal.
- **Kerja Sama Guild:** Koordinasi dengan anggota guild untuk mengumpulkan dana dan mengaktifkan buff pada waktu yang tepat!

Udah siap jadi legenda? *Gas!* 🔥
`;

module.exports = {
    command: ['tutorial', 'guide'],
    description: 'Menampilkan panduan lengkap cara bermain game RPG di bot ini.',
    category: 'RPG',
    run: async (sock, message, args) => {
        await message.reply(tutorialText);
    }
};