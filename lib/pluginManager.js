const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const { LRUCache } = require('lru-cache');

const plugins = new LRUCache({max:1000}); 
const pluginsDir = path.join(__dirname, '../plugins');

const loadPlugins = () => {
    fs.readdirSync(pluginsDir).forEach(category => {
        const categoryDir = path.join(pluginsDir, category);
        if (fs.statSync(categoryDir).isDirectory()) {
            fs.readdirSync(categoryDir).forEach(file => {
                if (path.extname(file) === '.js') {
                    try {
                        const pluginPath = path.join(categoryDir, file);
                        const plugin = require(pluginPath);
                        if (plugin.command && plugin.run) {
                            plugin.category = category.charAt(0).toUpperCase() + category.slice(1);
                            if (Array.isArray(plugin.command)) {
                                plugin.command.forEach(alias => plugins.set(alias, plugin));
                            } else {
                                plugins.set(plugin.command, plugin);
                            }
                        }
                    } catch (e) {
                        logger.error(`Gagal memuat plugin ${file} di kategori ${category}:`, e);
                    }
                }
            });
        }
    });
    logger.info(`Total ${plugins.size} plugin berhasil dimuat ke dalam cache.`);
};

module.exports = {
    plugins,
    loadPlugins
};