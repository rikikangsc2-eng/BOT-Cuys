module.exports = {
    cooldowns: {
        berburu: 5 * 60 * 1000,
        meracik: 2 * 60 * 1000,
        duel: 15 * 60 * 1000,
        rampok: 30 * 60 * 1000,
        ngemis: 30 * 60 * 1000,
        eksplor: 10 * 60 * 1000,
        repair: 5 * 60 * 1000,
        claim: {
            bonus: 15 * 60 * 1000,
            harian: 24 * 60 * 60 * 1000,
            mingguan: 7 * 24 * 60 * 60 * 1000,
            bulanan: 30 * 24 * 60 * 60 * 1000,
        }
    },
    
    rewards: {
        game: {
            min: 1000,
            max: 5000
        },
        sambungkata: {
            winner: { balance: 15000, xp: 250 },
            loser: { xp: 50 }
        },
        berburu: {
            super_success: { balance: [8000, 15000], xp: [300, 600] },
            success: { balance: [1500, 5000], xp: [100, 250] },
            failure: { xp: [20, 50] },
            nothing: { xp: [10, 20] }
        },
        duel: {
            xp_base: 250,
            xp_per_bet_ratio: 0.05
        },
        rampok: {
            xp_base: 150,
            xp_per_stolen_ratio: 0.2
        },
        claim: {
            bonus: { xp: 50, balance: 1000 },
            harian: { xp: 200, balance: 5000 },
            mingguan: { xp: 1500, balance: 50000, items: { iron: 10, bara: 5 } },
            bulanan: { xp: 5000, balance: 200000, items: { emas: 5, baja: 2 } }
        },
        eksplorasi: {
            balance: { min: 10000, max: 50000 },
            xp: { min: 100, max: 800 },
            item: {
                emas: { min: 5, max: 20 },
                iron: { min: 10, max: 40 },
                bara: { min: 20, max: 50 },
                baja: { min: 1, max: 5 },
                pedanglegendaris: { min: 1, max: 1 }
            }
        }
    },
    
    penalties: {
        berburu: { balance: [1000, 3000] },
        rampok: { success_rate_bonus_per_level: 0.02 }
    },
    
    market: {
        transaction_tax_rate: 0.025
    },
    
    berburu: {
        outcomes: [
            { type: 'super_success', probability: 0.10, rewardType: 'item' },
            { type: 'success', probability: 0.65 },
            { type: 'failure', probability: 0.15 },
            { type: 'nothing', probability: 0.10 }
        ],
        item_types: ['emas', 'iron', 'bara', 'daging', 'ikan', 'tikus', 'slimegel']
    },
    
    recipes: {
        salepLuka: {
            result: { item: 'salepLuka', amount: 1 },
            ingredients: { slimegel: 5 },
            xp: 25,
            level: 1
        },
        perisaiKayu: {
            result: { item: 'perisaiKayu', amount: 1, level: 1 },
            ingredients: { iron: 25 },
            xp: 75,
            level: 2
        },
        baja: {
            result: { item: 'baja', amount: 1 },
            ingredients: { iron: 10, bara: 5 },
            xp: 150,
            level: 5
        },
        pedanglegendaris: {
            result: { item: 'pedanglegendaris', amount: 1, level: 1 },
            ingredients: { baja: 2, emas: 5 },
            xp: 1000,
            level: 20
        },
        bajuzirahbaja: {
            result: { item: 'bajuzirahbaja', amount: 1, level: 1 },
            ingredients: { baja: 10, iron: 20 },
            xp: 500,
            level: 15
        },
        perisaiiron: {
            result: { item: 'perisaiiron', amount: 1, level: 1 },
            ingredients: { iron: 50, bara: 10 },
            xp: 250,
            level: 10
        },
        dungeonTicket: {
            result: { item: 'dungeonTicket', amount: 1 },
            ingredients: { baja: 5, emas: 10 },
            xp: 2000,
            level: 25
        }
    },
    
    equipmentStats: {
        pedanglegendaris: 100,
        bajuzirahbaja: 75,
        perisaiiron: 50,
        perisaiKayu: 25,
        cincinKekuatan: 150
    },
    
    durability: {
        max: {
            pedanglegendaris: 100,
            bajuzirahbaja: 150,
            perisaiiron: 200,
            perisaiKayu: 50
        },
        loss_per_use: {
            pedanglegendaris: 1,
            bajuzirahbaja: 1,
            perisaiiron: 1,
            perisaiKayu: 1
        },
        repair_cost: {
            pedanglegendaris: { balance: 10000, baja: 1 },
            bajuzirahbaja: { balance: 7500, iron: 5 },
            perisaiiron: { balance: 5000, iron: 10 },
            perisaiKayu: { balance: 2500, iron: 5 }
        }
    },
    
    petShop: {
        kucingOren: { name: "Kucing Oren", price: 500000, food: 'ikan', description: "Meningkatkan peluang menemukan item saat berburu sebesar 5%." },
        anjingHerder: { name: "Anjing Herder", price: 750000, food: 'daging', description: "Meningkatkan tingkat keberhasilan merampok sebesar 3%." },
        burungHantu: { name: "Burung Hantu", price: 1000000, food: 'tikus', description: "Memberikan bonus 10% XP dari duel." }
    },
    
    petEffects: {
        kucingOren: { type: 'berburu_item_chance', value: 0.05 },
        anjingHerder: { type: 'rampok_success_chance', value: 0.03 },
        burungHantu: { type: 'duel_xp_bonus', value: 0.10 }
    },
    
    requirements: {
        duelLevel: 5,
        rampokLevel: 10
    },
    
    leveling: {
        base: 5,
        multiplier: 2,
        xp_per_level: 100
    },
    
    guildBuffs: {
        berkahHutan: {
            name: "Berkah Hutan",
            description: "Meningkatkan peluang keberhasilan berburu sebesar 15% untuk semua anggota.",
            cost: 1000000,
            duration: 24 * 60 * 60 * 1000,
            effect: {
                type: "berburu_success_chance",
                value: 0.15
            }
        },
        semangatKsatria: {
            name: "Semangat Ksatria",
            description: "Meningkatkan perolehan XP dari duel sebesar 20% untuk semua anggota.",
            cost: 2500000,
            duration: 24 * 60 * 60 * 1000,
            effect: {
                type: "duel_xp_bonus",
                value: 0.20
            }
        }
    },
    
    dungeons: {
        guagoblin: {
            name: "Gua Goblin",
            entryCost: { item: 'dungeonTicket', amount: 1 },
            difficulty: 500,
            bossHP: 10000,
            bossDamage: 5,
            rewards: {
                xp: 5000,
                balance: 100000,
                lootTable: [
                    { item: 'kristalMurni', name: 'Kristal Murni', amount: 1, dropChance: 0.25 },
                    { item: 'cincinKekuatan', name: 'Cincin Kekuatan', amount: 1, dropChance: 0.05 }
                ]
            }
        }
    },
    
    npcData: {
        mangujang: {
            name: "Mang Ujang",
            promptDesc: "seorang pemilik warung kelontong yang ramah dari Sunda. Logatnya khas dan sering menyelipkan kata-kata Sunda seperti 'neng', 'a', atau 'kumaha damang'.",
            items: {
                daging: { name: "Daging", price: 750 },
                ikan: { name: "Ikan", price: 500 },
                tikus: { name: "Tikus", price: 250 },
                dungeonTicket: { name: "Tiket Dungeon", price: 75000 }
            }
        },
        pakpurpur: {
            name: "Pak Purpur",
            promptDesc: "seorang kolektor barang antik misterius yang berbicara dengan formal, singkat, dan to-the-point. Mottonya 'Punya uang, punya barang'.",
            items: {
                jimatAntiRampok: { name: "Jimat Anti-Rampok", price: 250000 },
                jimatPembalikTakdir: { name: "Jimat Pembalik Takdir", price: 1000000 }
            }
        },
        nengnirsa: {
            name: "Neng Nirsa",
            promptDesc: "seorang alkemis muda yang ceria, energik, dan optimis. Dia suka menjelaskan fungsi ramuannya dengan semangat.",
            items: {
                ramuanBerburuSuper: { name: "Ramuan Berburu Super", price: 150000 },
                azimatDuelSakti: { name: "Azimat Duel Sakti", price: 300000 },
                koinKeberuntungan: { name: "Koin Keberuntungan", price: 100000 }
            }
        }
    }
};