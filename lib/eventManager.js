const getActiveEvents = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const activeEvents = {};

    if (dayOfWeek === 6 || dayOfWeek === 0) {
        activeEvents.doubleXp = { name: "Double XP Weekend", multiplier: 2 };
    }

    if (dayOfWeek === 3) {
        activeEvents.dullMarket = { name: "Pasar Lesu", priceModifier: 0.9 };
    }
    
    if (dayOfWeek === 5) {
        activeEvents.meteorShower = { name: "Hujan Meteor", successBonus: 0.05 };
    }

    return activeEvents;
};

module.exports = { getActiveEvents };