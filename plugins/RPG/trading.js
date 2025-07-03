const db = require('../../lib/database');
const config = require('../../config');
const gameConfig = require('../../gameConfig');

module.exports = {
    command: 'trading',
    description: 'Beli dan jual aset pasar melalui terminal trading.',
    category: 'RPG',
    run: async (sock, message, args, { activeEvents }) => {
        const subCommand = args[0]?.toLowerCase();
        const itemKey = args[1]?.toLowerCase();
        const amount = parseFloat(args[2]);
        const senderJid = message.sender;
        
        const itemMap = {
            emas: { name: 'Emas', symbol: '🪙' },
            iron: { name: 'Iron', symbol: '🔩' },
            bara: { name: 'Bara', symbol: '🔥' }
        };
        
        let priceModifier = 1;
        let eventMessage = "";
        if (activeEvents.dullMarket) {
            priceModifier = activeEvents.dullMarket.priceModifier;
            eventMessage = `\n\n*Event ${activeEvents.dullMarket.name} sedang berlangsung, semua harga pasar terpengaruh!*`;
        }
        
        let usersDb = db.get('users');
        let market = db.get('market');
        let market_volume = db.get('market_volume') || {};
        const user = usersDb[senderJid] || { balance: 0 };
        const taxRate = gameConfig.market.transaction_tax_rate;
        
        switch (subCommand) {
            case 'buy': {
                if (!itemMap[itemKey] || !amount || amount <= 0) {
                    return message.reply(`Gunakan format: \`${config.prefix}trading buy <item> <jumlah>\`\nContoh: \`${config.prefix}trading buy emas 10\``);
                }
                
                const price = Math.floor(market[`${itemKey}_price`] * priceModifier);
                const totalCost = Math.ceil(price * amount);
                
                if ((user.balance || 0) < totalCost) {
                    return message.reply(`Saldo tidak cukup.\n\n*Dana Dibutuhkan:* Rp ${totalCost.toLocaleString()}\n*Saldo Anda:* Rp ${(user.balance || 0).toLocaleString()}`);
                }
                
                const currentAsset = user[itemKey] || { amount: 0, avgPrice: 0 };
                const currentAmount = currentAsset.amount || 0;
                const currentAvgPrice = currentAsset.avgPrice || 0;
                const currentHoldingValue = currentAmount * currentAvgPrice;
                const newPurchaseValue = amount * price;
                const newTotalAmount = currentAmount + amount;
                const newTotalValue = currentHoldingValue + newPurchaseValue;
                const newAvgPrice = newTotalValue / newTotalAmount;
                
                user.balance -= totalCost;
                user[itemKey] = { amount: newTotalAmount, avgPrice: newAvgPrice };
                usersDb[senderJid] = user;
                
                if (!market_volume[itemKey]) market_volume[itemKey] = { buy: 0, sell: 0 };
                market_volume[itemKey].buy = (market_volume[itemKey].buy || 0) + amount;
                
                db.save('users', usersDb);
                db.save('market_volume', market_volume);
                
                return message.reply(`✅ *Pembelian Berhasil*\n\n- *Aset:* ${itemMap[itemKey].name}\n- *Jumlah:* ${amount.toFixed(3)} gram\n- *Harga Beli:* Rp ${price.toLocaleString()}/gram\n- *Total Biaya:* Rp ${totalCost.toLocaleString()}\n- *Harga Rata-rata Baru:* Rp ${Math.round(newAvgPrice).toLocaleString()}/gram` + eventMessage);
            }
            
            case 'sell': {
                if (!itemMap[itemKey] || !amount || amount <= 0) {
                    return message.reply(`Gunakan format: \`${config.prefix}trading sell <item> <jumlah>\`\nContoh: \`${config.prefix}trading sell emas 10\``);
                }
                
                const userAmount = user[itemKey]?.amount || 0;
                if (userAmount < amount) {
                    return message.reply(`Aset tidak cukup.\n\n*${itemMap[itemKey].name} Dimiliki:* ${userAmount.toFixed(3)} gram\n*Ingin Dijual:* ${amount.toFixed(3)} gram`);
                }
                
                const price = Math.floor(market[`${itemKey}_price`] * priceModifier);
                const grossIncome = Math.floor(price * amount);
                const taxAmount = Math.floor(grossIncome * taxRate);
                const netIncome = grossIncome - taxAmount;
                
                user.balance = (user.balance || 0) + netIncome;
                user[itemKey].amount -= amount;
                
                if (user[itemKey].amount <= 0) {
                    delete user[itemKey];
                }
                
                usersDb[senderJid] = user;
                
                if (!market_volume[itemKey]) market_volume[itemKey] = { buy: 0, sell: 0 };
                market_volume[itemKey].sell = (market_volume[itemKey].sell || 0) + amount;
                
                db.save('users', usersDb);
                db.save('market_volume', market_volume);
                
                return message.reply(`✅ *Penjualan Berhasil*\n\n- *Aset:* ${itemMap[itemKey].name}\n- *Jumlah:* ${amount.toFixed(3)} gram\n- *Harga Jual:* Rp ${price.toLocaleString()}/gram\n- *Pendapatan Kotor:* Rp ${grossIncome.toLocaleString()}\n- *Pajak (${(taxRate*100).toFixed(1)}%):* -Rp ${taxAmount.toLocaleString()}\n- *Pendapatan Bersih:* Rp ${netIncome.toLocaleString()}` + eventMessage);
            }
            
            default: {
                let portfolioText = `*Terminal Trading ${config.botName}*\n\n`;
                portfolioText += `*Trader:* ${message.pushName}\n`;
                portfolioText += `*Dana Tersedia:* Rp ${(user.balance || 0).toLocaleString()}\n\n`;
                portfolioText += "┌─「 *Portofolio Aset* 」\n";
                
                let totalAssetValue = 0;
                let hasAssets = false;
                for (const key in itemMap) {
                    const asset = user[key];
                    if (asset && asset.amount > 0) {
                        hasAssets = true;
                        const currentPrice = Math.floor(market[`${key}_price`] * priceModifier);
                        const currentValue = Math.floor(asset.amount * currentPrice);
                        const avgPrice = asset.avgPrice || 0;
                        const purchaseValue = Math.floor(asset.amount * avgPrice);
                        const profit = currentValue - purchaseValue;
                        const profitPercentage = purchaseValue > 0 ? (profit / purchaseValue) * 100 : (currentValue > 0 ? 100 : 0);
                        
                        const profitColor = profit >= 0 ? '📈' : '📉';
                        const profitSign = profit >= 0 ? '+' : '';
                        
                        totalAssetValue += currentValue;
                        portfolioText += `│ *${itemMap[key].symbol} ${itemMap[key].name}*: ${asset.amount.toFixed(3)} gram\n`;
                        if (avgPrice > 0) {
                            portfolioText += `│   ├─ _Harga Beli Rata²: Rp ${Math.round(avgPrice).toLocaleString()}_\n`;
                            portfolioText += `│   └─ _Untung/Rugi: ${profitColor} Rp ${profitSign}${profit.toLocaleString()} (${profitPercentage.toFixed(2)}%)_\n`;
                        } else {
                            portfolioText += `│   └─ _(Aset dari sumber non-trading)_\n`;
                        }
                    }
                }
                
                if (!hasAssets) {
                    portfolioText += `│ _Anda belum memiliki aset._\n`;
                }
                portfolioText += `└─\n\n`;
                portfolioText += `*Total Nilai Aset:* Rp ${totalAssetValue.toLocaleString()}\n\n`;
                portfolioText += "┌─「 *Info Pasar* 」\n";
                for (const key in itemMap) {
                    const price = Math.floor(market[`${key}_price`] * priceModifier);
                    const lastPrice = Math.floor(market[`last_${key}_price`] * priceModifier);
                    const trendEmoji = price > lastPrice ? '📈' : price < lastPrice ? '📉' : '➖';
                    portfolioText += `│ ${itemMap[key].symbol} ${itemMap[key].name}: Rp ${price.toLocaleString()} ${trendEmoji}\n`;
                }
                portfolioText += `└─\n\n`;
                portfolioText += `*Pajak Penjualan:* ${(taxRate*100).toFixed(1)}%\n`;
                if (eventMessage) portfolioText += `*Event Aktif:* ${activeEvents.dullMarket.name}\n\n`;
                else portfolioText += `\n`;
                
                portfolioText += `*Cara Penggunaan:*\n`;
                portfolioText += `\`${config.prefix}trading buy <item> <jumlah>\`\n`;
                portfolioText += `\`${config.prefix}trading sell <item> <jumlah>\`\n`;
                portfolioText += `\`${config.prefix}harga <item>\` untuk grafik detail.\n`;
                
                return message.reply(portfolioText);
            }
        }
    }
};