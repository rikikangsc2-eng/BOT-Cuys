const db = require('../../lib/database');
const gameConfig = require('../../gameConfig');
const axios =require('axios');
const config = require('../../config');

function generateSingleItemChartHtml(itemName, itemSymbol, historyData, colors) {
    const numDataPoints = gameConfig.marketSettings.max_history;
    const data = (historyData || [])
        .filter(d => d && typeof d.open === 'number' && typeof d.high === 'number' && typeof d.low === 'number' && typeof d.close === 'number')
        .slice(-numDataPoints);

    if (data.length < 2) {
        return `<html><body><h1>Error: Not enough data for chart generation.</h1></body></html>`;
    }
    
    const timeLabels = data.map(p => new Date(p.timestamp).toLocaleString('en-GB', {
        timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false
    }));

    const allPrices = data.flatMap(d => [d.high, d.low]);
    const dataMin = Math.min(...allPrices);
    const dataMax = Math.max(...allPrices);
    const minPrice = Math.floor(dataMin / 1000) * 1000;
    const maxPrice = Math.ceil(dataMax / 1000) * 1000;
    const priceRange = (maxPrice - minPrice === 0) ? 1000 : maxPrice - minPrice;

    const chartWidth = 700;
    const chartHeight = 350;
    const padding = { top: 20, right: 70, bottom: 50, left: 30 };
    const candleWidth = (chartWidth - padding.left - padding.right) / (numDataPoints * 1.5);

    let candlesticks = '';

    for (let i = 0; i < data.length; i++) {
        const d = data[i];
        const isBullish = d.close >= d.open;
        const color = isBullish ? colors.bullish : colors.bearish;

        const x = padding.left + (i / (data.length - 1)) * (chartWidth - padding.left - padding.right) - (candleWidth / 2);
        
        const wickY1 = padding.top + ((maxPrice - d.high) / priceRange) * (chartHeight - padding.top - padding.bottom);
        const wickY2 = padding.top + ((maxPrice - d.low) / priceRange) * (chartHeight - padding.top - padding.bottom);
        
        const bodyY = padding.top + ((maxPrice - Math.max(d.open, d.close)) / priceRange) * (chartHeight - padding.top - padding.bottom);
        const bodyHeight = (Math.abs(d.open - d.close) / priceRange) * (chartHeight - padding.top - padding.bottom);

        candlesticks += `<line x1="${x + candleWidth/2}" y1="${wickY1}" x2="${x + candleWidth/2}" y2="${wickY2}" style="stroke:${color}; stroke-width:2;" />`;
        candlesticks += `<rect x="${x}" y="${bodyY}" width="${candleWidth}" height="${Math.max(1, bodyHeight)}" style="fill:${color};" />`;
    }
    
    let yAxisLabels = '';
    const numLabels = 5;
    for (let i = 0; i <= numLabels; i++) {
        const price = minPrice + (priceRange / numLabels) * i;
        const y = padding.top + ((maxPrice - price) / priceRange) * (chartHeight - padding.top - padding.bottom);
        yAxisLabels += `<text x="${chartWidth - padding.right + 10}" y="${y}" dy="5" text-anchor="start" class="axis-label">Rp${(price/1000).toFixed(0)}k</text>`;
        yAxisLabels += `<line x1="${padding.left}" y1="${y}" x2="${chartWidth - padding.right}" y2="${y}" class="grid-line"/>`;
    }

    let xAxisLabels = '';
    timeLabels.forEach((label, i) => {
        if (data.length > 1 && (i > 0 && (i % 4 === 0 || i === data.length - 1))) {
            const x = padding.left + (i / (data.length - 1)) * (chartWidth - padding.left - padding.right);
            xAxisLabels += `<text x="${x}" y="${chartHeight - padding.bottom + 20}" text-anchor="middle" class="axis-label">${label}</text>`;
        }
    });
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: sans-serif; background-color: #0d1117; color: #c9d1d9; margin: 0; }
            .chart-container { background-color: #161b22; border: 1px solid #30363d; border-radius: 10px; padding: 20px; box-sizing: border-box; }
            .title-container { text-align: center; font-size: 20px; font-weight: bold; margin-bottom: 15px; }
            .axis-label { font-size: 12px; fill: #8b949e; }
            .grid-line { stroke: #21262d; stroke-width: 1; }
        </style>
    </head>
    <body>
        <div class="chart-container">
            <div class="title-container">${itemSymbol} ${itemName} / IDR</div>
            <svg width="${chartWidth}" height="${chartHeight}" viewBox="0 0 ${chartWidth} ${chartHeight}">
                ${yAxisLabels}
                ${xAxisLabels}
                ${candlesticks}
            </svg>
        </div>
    </body>
    </html>`;
}

module.exports = {
    command: 'harga',
    description: 'Melihat grafik harga pasar. Gunakan: .harga <emas|iron|bara>',
    run: async (sock, message, args) => {
        const itemMap = { 
            emas: { name: 'Emas', symbol: '滋', colors: { bullish: '#26a69a', bearish: '#ef5350' } }, 
            iron: { name: 'Iron', symbol: '', colors: { bullish: '#26a69a', bearish: '#ef5350' } }, 
            bara: { name: 'Bara', symbol: '', colors: { bullish: '#26a69a', bearish: '#ef5350' } }
        };

        const itemKey = args[0]?.toLowerCase() || 'emas';
        if (!itemMap[itemKey]) {
            return message.reply("Item tidak valid. Gunakan: *.harga <emas|iron|bara>*");
        }

        const selectedItem = itemMap[itemKey];
        await message.reply(`Membuat grafik candlestick untuk *${selectedItem.name}*, mohon tunggu...`);

        try {
            const market = db.get('market');
            const priceHistory = db.get('price_history');
            const itemHistory = priceHistory[itemKey];

            if (!itemHistory || itemHistory.length < 2) {
                const intervalMinutes = gameConfig.marketSettings.update_interval_ms / 60000;
                return message.reply(`📈 Data pasar untuk *${selectedItem.name}* sedang dikumpulkan. Grafik akan tersedia setelah minimal 2 siklus data tercatat.\n\nCoba lagi dalam beberapa menit. Harga diperbarui setiap ${intervalMinutes} menit.`);
            }

            const htmlContent = generateSingleItemChartHtml(selectedItem.name, selectedItem.symbol, itemHistory, selectedItem.colors);

            const response = await axios({
                method: 'post',
                url: 'https://nirkyy-api.hf.space/api/htmltoimg',
                headers: {
                    'Content-Type': 'application/json',
                    'accept': 'image/png'
                },
                data: { 
                    html: htmlContent
                },
                responseType: 'arraybuffer'
            });

            const now = new Date();
            const minutes = now.getMinutes();
            const seconds = now.getSeconds();
            const intervalMinutes = gameConfig.marketSettings.update_interval_ms / 60000;
            const minutesLeft = (intervalMinutes - 1) - (minutes % intervalMinutes);
            const secondsLeft = 60 - seconds;
            const nextUpdateIn = `${minutesLeft}m ${secondsLeft}s`;

            let captionText = `📊 *Harga Pasar Terkini*\n\n`;
            for (const key in itemMap) {
                const price = market[`${key}_price`] || 0;
                const prefix = (key === itemKey) ? `*${itemMap[key].symbol}` : `${itemMap[key].symbol}`;
                const suffix = (key === itemKey) ? `*` : ``;
                captionText += `${prefix} ${itemMap[key].name}${suffix}: Rp ${price.toLocaleString()}\n`;
            }
            captionText += `\n_Update selanjutnya dalam: ${nextUpdateIn}_`;

            await message.media(captionText, response.data);
            
        } catch (error) {
            console.error('Error pada plugin harga:', error.response ? error.response.data.toString() : error.message);
            await message.reply('Terjadi kesalahan saat membuat laporan pasar. Mungkin API sedang tidak aktif atau data belum cukup.');
        }
    }
};