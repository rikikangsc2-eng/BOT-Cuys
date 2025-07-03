const db = require('../../lib/database');
const gameConfig = require('../../gameConfig');
const axios = require('axios');
const config = require('../../config');

function generateSingleItemChartHtml(itemName, itemSymbol, historyData, colors) {
    const numDataPoints = gameConfig.marketSettings.max_history;
    const data = (historyData || [])
        .filter(d => d && typeof d.open === 'number' && typeof d.high === 'number' && typeof d.low === 'number' && typeof d.close === 'number')
        .slice(-numDataPoints);

    if (data.length < 2) {
        return `<html><body><h1>Waduh, datanya masih dikit banget. Tunggu bentar lagi ya!</h1></body></html>`;
    }

    const chartWidth = 800;
    const chartHeight = 450;
    const padding = { top: 40, right: 80, bottom: 60, left: 30 };

    const allPrices = data.flatMap(d => [d.high, d.low]);
    const dataMin = Math.min(...allPrices);
    const dataMax = Math.max(...allPrices);
    const priceRangeBuffer = (dataMax - dataMin) * 0.1;
    const minPrice = Math.max(0, dataMin - priceRangeBuffer);
    const maxPrice = dataMax + priceRangeBuffer;
    const priceRange = maxPrice - minPrice;

    const availableWidth = chartWidth - padding.left - padding.right;
    const candleSlotWidth = availableWidth / data.length;
    const candleWidth = candleSlotWidth * 0.7;
    const candlePadding = candleSlotWidth * 0.3;

    let candlesticks = '';
    for (let i = 0; i < data.length; i++) {
        const d = data[i];
        const isBullish = d.close >= d.open;
        const color = isBullish ? colors.bullish : colors.bearish;

        const x = padding.left + i * candleSlotWidth + candlePadding / 2;
        
        const getY = price => padding.top + ((maxPrice - price) / priceRange) * (chartHeight - padding.top - padding.bottom);

        const wickY1 = getY(d.high);
        const wickY2 = getY(d.low);
        const bodyY = getY(Math.max(d.open, d.close));
        const bodyHeight = Math.abs(getY(d.open) - getY(d.close)) || 1;

        candlesticks += `<line x1="${x + candleWidth / 2}" y1="${wickY1}" x2="${x + candleWidth / 2}" y2="${wickY2}" style="stroke:${color}; stroke-width:1.5;" />`;
        candlesticks += `<rect x="${x}" y="${bodyY}" width="${candleWidth}" height="${bodyHeight}" rx="2" ry="2" style="fill:${color};" />`;
    }

    let yAxisLabels = '';
    const numLabelsY = 6;
    for (let i = 0; i <= numLabelsY; i++) {
        const price = minPrice + (priceRange / numLabelsY) * i;
        const y = padding.top + ((maxPrice - price) / priceRange) * (chartHeight - padding.top - padding.bottom);
        yAxisLabels += `<text x="${chartWidth - padding.right + 15}" y="${y}" dy="4" text-anchor="start" class="axis-label">Rp${(price / 1000).toFixed(1)}k</text>`;
        yAxisLabels += `<line x1="${padding.left}" y1="${y}" x2="${chartWidth - padding.right}" y2="${y}" class="grid-line"/>`;
    }

    let xAxisLabels = '';
    const labelStep = Math.max(1, Math.floor(data.length / 7));
    for (let i = 0; i < data.length; i += labelStep) {
        const label = new Date(data[i].timestamp).toLocaleString('en-GB', {
            timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false
        });
        const x = padding.left + i * candleSlotWidth + candleSlotWidth / 2;
        xAxisLabels += `<text x="${x}" y="${chartHeight - padding.bottom + 25}" text-anchor="middle" class="axis-label">${label}</text>`;
    }

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
        <style>
            body { 
                font-family: 'Poppins', sans-serif; 
                background-color: #161b22; 
                color: #c9d1d9; 
                margin: 0;
                padding: 10px;
            }
            .chart-container { 
                background-color: #0d1117; 
                border: 1px solid #30363d; 
                border-radius: 12px; 
                padding: 25px; 
                box-sizing: border-box; 
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            }
            .title-container { 
                text-align: center; 
                font-size: 24px; 
                font-weight: 600; 
                margin-bottom: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
            }
            .axis-label { 
                font-size: 13px; 
                fill: #8b949e; 
            }
            .grid-line { 
                stroke: #21262d; 
                stroke-width: 1; 
                stroke-dasharray: 4;
            }
            svg {
                shape-rendering: geometricPrecision;
            }
        </style>
    </head>
    <body>
        <div class="chart-container">
            <div class="title-container">
                <span style="font-size: 28px;">${itemSymbol}</span>
                <span>${itemName} / IDR</span>
            </div>
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