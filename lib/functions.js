const axios = require('axios');
const fs = require('fs');

const getBuffer = async (url) => {
    try {
        if (Buffer.isBuffer(url)) {
            return url;
        }
        if (fs.existsSync(url)) {
            return fs.readFileSync(url);
        }
        
        const response = await axios({
            method: 'get',
            url,
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; RMX2185 Build/QP1A.190711.020) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.7103.127 Mobile Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': url,
                'DNT': '1'
            }
        });
        
        return response.data;
    } catch (e) {
        console.error('Gagal mengambil buffer dari URL/Path:', e.message);
        throw new Error('Gagal mengambil buffer dari URL/Path.');
    }
};

const uploadToImgbb = async (buffer) => {
    try {
        const bytes = Array.from(new Uint8Array(buffer));
        const endpoint = "https://nirkyy-dev.hf.space/api/v1/toimgbb";

        const response = await axios.post(endpoint, {
            file: { data: bytes }
        }, {
            headers: { "Content-Type": "application/json" }
        });

        if (response.data && response.data.data && response.data.data.url) {
            return response.data.data.url;
        } else {
            throw new Error('Struktur respons API tidak valid.');
        }
    } catch (error) {
        const errorMessage = error.response ? error.response.data : error.message;
        console.error("Error saat mengunggah:", errorMessage);
        throw new Error('Gagal mengunggah media ke server.');
    }
};

module.exports = { getBuffer, uploadToImgbb };