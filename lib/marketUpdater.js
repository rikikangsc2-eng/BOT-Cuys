const db = require('./database');
const gameConfig = require('../gameConfig');
const logger = require('./logger');

function updateMarket() {
  let market = db.get('market') || {};
  let priceHistory = db.get('price_history') || {};
  let marketVolume = db.get('market_volume') || {};
  let marketTrend = db.get('market_trend') || {};
  
  const settings = gameConfig.marketSettings;
  const commodities = Object.keys(settings.base_prices);
  
  commodities.forEach(item => {
    if (!market[`${item}_price`]) market[`${item}_price`] = settings.base_prices[item];
    if (!marketTrend[item]) marketTrend[item] = 0;
    if (!priceHistory[item]) priceHistory[item] = [];
    if (!marketVolume[item]) marketVolume[item] = { buy: 0, sell: 0 };
    
    const lastPrice = market[`${item}_price`];
    market[`last_${item}_price`] = lastPrice;
    
    const netVolume = (marketVolume[item].buy || 0) - (marketVolume[item].sell || 0);
    const volumeImpact = netVolume * settings.volume_impact_factor;
    
    let trend = marketTrend[item];
    trend += (Math.random() - 0.5) * settings.trend_strength;
    trend *= 0.95;
    trend = Math.max(-1, Math.min(1, trend));
    marketTrend[item] = trend;
    
    const randomFluctuation = (Math.random() - 0.5) * 2 * settings.volatility[item];
    const priceChangePercent = (trend / 10) + volumeImpact + randomFluctuation;
    
    let newPrice = lastPrice * (1 + priceChangePercent);
    if (newPrice < settings.min_prices[item]) {
      newPrice = settings.min_prices[item];
    }
    market[`${item}_price`] = Math.round(newPrice);
    
    const open = lastPrice;
    const close = market[`${item}_price`];
    const high = Math.max(open, close) * (1 + Math.random() * (settings.volatility[item] / 2));
    const low = Math.min(open, close) * (1 - Math.random() * (settings.volatility[item] / 2));
    
    priceHistory[item].push({
      timestamp: Date.now(),
      open: Math.round(open),
      high: Math.round(high),
      low: Math.round(low),
      close: Math.round(close)
    });
    
    if (priceHistory[item].length > settings.max_history) {
      priceHistory[item].shift();
    }
    
    marketVolume[item] = { buy: 0, sell: 0 };
  });
  
  db.save('market', market);
  db.save('price_history', priceHistory);
  db.save('market_volume', marketVolume);
  db.save('market_trend', marketTrend);
  logger.info('[MARKET SIM] Harga pasar, tren, dan volume berhasil disimulasikan.');
}

module.exports = { updateMarket };