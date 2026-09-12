// ============================
// DISCOUNT.JS - MANAJEMEN DISKON ABH DATA STORE
// ============================

const fs = require('fs');
const config = require('./config');
const OWNER_ID = config.BOT.OWNER_ID;

// ============================
// FILE PATH
// ============================
const DISCOUNT_FILE = "./discounts.json";
const USERS_FILE = "./users.json";

// ============================
// LOAD/SAVE DISCOUNTS
// ============================
const loadDiscounts = () => {
    try {
        if (!fs.existsSync(DISCOUNT_FILE)) {
            const defaultData = {
                autoDiscount: false,
                autoDiscountPercent: 10,
                autoDiscountMinPurchase: 5,
                users: {},
                logs: []
            };
            fs.writeFileSync(DISCOUNT_FILE, JSON.stringify(defaultData, null, 2));
            return defaultData;
        }
        const raw = fs.readFileSync(DISCOUNT_FILE, "utf8").trim();
        if (!raw || raw === "") {
            return { autoDiscount: false, autoDiscountPercent: 10, autoDiscountMinPurchase: 5, users: {}, logs: [] };
        }
        return JSON.parse(raw);
    } catch (err) {
        console.log(`❌ Load discount error:`, err.message);
        return { autoDiscount: false, autoDiscountPercent: 10, autoDiscountMinPurchase: 5, users: {}, logs: [] };
    }
};

// ===== FUNGSI SAVE DISCOUNTS (DITAMBAHKAN) =====
const saveDiscounts = (data) => {
    try {
        fs.writeFileSync(DISCOUNT_FILE, JSON.stringify(data, null, 2), "utf8");
        console.log(`✅ Discounts saved: ${DISCOUNT_FILE}`);
    } catch (err) {
        console.log(`❌ Save discount error:`, err.message);
    }
};
// ===== SAMPAI SINI =====

// ============================
// LOAD USERS
// ============================
const loadUsers = () => {
    try {
        if (!fs.existsSync(USERS_FILE)) {
            return {};
        }
        const raw = fs.readFileSync(USERS_FILE, "utf8").trim();
        if (!raw || raw === "") {
            return {};
        }
        return JSON.parse(raw);
    } catch (err) {
        console.log(`❌ Load users error:`, err.message);
        return {};
    }
};

// ============================
// FORMAT RUPIAH
// ============================
const formatRupiah = (val) => {
    if (!val) return '0';
    return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

// ============================
// GET USER DISCOUNT
// ============================
const getUserDiscount = (userId, users = null) => {
    if (!users) users = loadUsers();
    const discounts = loadDiscounts();
    const userDiscount = discounts.users[String(userId)];
    
    // Cek diskon manual
    if (userDiscount && userDiscount.active !== false) {
        if (userDiscount.expiredAt && new Date(userDiscount.expiredAt) < new Date()) {
            return null;
        }
        return {
            type: 'manual',
            percent: userDiscount.percent || 10,
            label: userDiscount.label || `Diskon ${userDiscount.percent}%`,
            active: true,
            expiredAt: userDiscount.expiredAt,
            givenAt: userDiscount.givenAt,
            note: userDiscount.note || ''
        };
    }
    
    // Cek diskon otomatis (loyalty)
    if (discounts.autoDiscount !== false) {
        const userData = users[String(userId)] || {};
        const purchases = userData.purchases || [];
        const minPurchase = discounts.autoDiscountMinPurchase || 5;
        const percent = discounts.autoDiscountPercent || 10;
        
        if (purchases.length >= minPurchase) {
            return {
                type: 'auto',
                percent: percent,
                label: `Diskon Loyalty ${percent}% (${minPurchase}x pembelian)`,
                active: true,
                minPurchase: minPurchase,
                totalPurchase: purchases.length
            };
        }
    }
    
    return null;
};

// ============================
// GET DISCOUNT PROGRESS
// ============================
const getDiscountProgress = (userId, users = null) => {
    if (!users) users = loadUsers();
    const discounts = loadDiscounts();
    
    if (discounts.autoDiscount === false) {
        return null;
    }
    
    const userData = users[String(userId)] || {};
    const purchases = userData.purchases || [];
    const minPurchase = discounts.autoDiscountMinPurchase || 5;
    const percent = discounts.autoDiscountPercent || 10;
    
    if (purchases.length >= minPurchase) {
        return {
            achieved: true,
            percent: percent,
            minPurchase: minPurchase,
            totalPurchase: purchases.length,
            label: `✅ Diskon ${percent}% aktif!`
        };
    }
    
    return {
        achieved: false,
        percent: percent,
        minPurchase: minPurchase,
        totalPurchase: purchases.length,
        remaining: minPurchase - purchases.length,
        label: `${purchases.length}/${minPurchase} - ${'▓'.repeat(purchases.length)}${'░'.repeat(minPurchase - purchases.length)}`
    };
};

// ============================
// APPLY DISCOUNT TO PRICE
// ============================
const applyDiscount = (price, userId, users = null) => {
    if (!users) users = loadUsers();
    const discount = getUserDiscount(userId, users);
    
    if (!discount) {
        return {
            originalPrice: price,
            finalPrice: price,
            discountAmount: 0,
            discountPercent: 0,
            discountType: null,
            discountLabel: null
        };
    }
    
    const discountAmount = Math.floor(price * (discount.percent / 100));
    const finalPrice = price - discountAmount;
    
    return {
        originalPrice: price,
        finalPrice: finalPrice,
        discountAmount: discountAmount,
        discountPercent: discount.percent,
        discountType: discount.type,
        discountLabel: discount.label
    };
};

// ============================
// ADD MANUAL DISCOUNT
// ============================
const addManualDiscount = (userId, percent, label = null, note = null, expiredAt = null) => {
    const discounts = loadDiscounts();
    const users = loadUsers();
    
    if (!users[String(userId)]) {
        return { success: false, error: 'User tidak ditemukan!' };
    }
    
    if (isNaN(percent) || percent < 1 || percent > 100) {
        return { success: false, error: 'Persen harus antara 1-100!' };
    }
    
    const userData = users[String(userId)];
    discounts.users[String(userId)] = {
        percent: percent,
        label: label || `Diskon ${percent}%`,
        note: note || '',
        active: true,
        givenAt: new Date().toISOString(),
        expiredAt: expiredAt || null
    };
    
    discounts.logs.push({
        action: 'add_manual',
        userId: userId,
        username: userData.username || 'Unknown',
        percent: percent,
        label: label || `Diskon ${percent}%`,
        timestamp: new Date().toISOString()
    });
    
    if (discounts.logs.length > 100) {
        discounts.logs = discounts.logs.slice(-100);
    }
    
    saveDiscounts(discounts);
    
    return {
        success: true,
        data: {
            userId: userId,
            username: userData.username || 'Unknown',
            percent: percent,
            label: label || `Diskon ${percent}%`,
            note: note || ''
        }
    };
};

// ============================
// REMOVE MANUAL DISCOUNT
// ============================
const removeManualDiscount = (userId) => {
    const discounts = loadDiscounts();
    const users = loadUsers();
    
    if (!discounts.users[String(userId)]) {
        return { success: false, error: 'User tidak memiliki diskon!' };
    }
    
    const userData = users[String(userId)] || {};
    
    discounts.logs.push({
        action: 'remove_manual',
        userId: userId,
        username: userData.username || 'Unknown',
        removedAt: new Date().toISOString()
    });
    
    delete discounts.users[String(userId)];
    saveDiscounts(discounts);
    
    return {
        success: true,
        data: {
            userId: userId,
            username: userData.username || 'Unknown'
        }
    };
};

// ============================
// TOGGLE AUTO DISCOUNT
// ============================
const toggleAutoDiscount = (status) => {
    const discounts = loadDiscounts();
    discounts.autoDiscount = status;
    
    discounts.logs.push({
        action: 'toggle_auto',
        status: status ? 'activated' : 'deactivated',
        timestamp: new Date().toISOString()
    });
    
    saveDiscounts(discounts);
    
    return {
        success: true,
        status: status ? 'activated' : 'deactivated'
    };
};

// ============================
// SET AUTO DISCOUNT CONFIG
// ============================
const setAutoDiscountConfig = (percent, minPurchase) => {
    const discounts = loadDiscounts();
    
    if (percent && !isNaN(percent) && percent >= 1 && percent <= 100) {
        discounts.autoDiscountPercent = percent;
    }
    
    if (minPurchase && !isNaN(minPurchase) && minPurchase >= 1) {
        discounts.autoDiscountMinPurchase = minPurchase;
    }
    
    discounts.logs.push({
        action: 'update_auto_config',
        percent: discounts.autoDiscountPercent,
        minPurchase: discounts.autoDiscountMinPurchase,
        timestamp: new Date().toISOString()
    });
    
    saveDiscounts(discounts);
    
    return {
        success: true,
        data: {
            autoDiscount: discounts.autoDiscount,
            autoDiscountPercent: discounts.autoDiscountPercent,
            autoDiscountMinPurchase: discounts.autoDiscountMinPurchase
        }
    };
};

// ============================
// GET ALL DISCOUNTS
// ============================
const getAllDiscounts = () => {
    const discounts = loadDiscounts();
    const users = loadUsers();
    
    const result = {
        autoDiscount: discounts.autoDiscount,
        autoDiscountPercent: discounts.autoDiscountPercent,
        autoDiscountMinPurchase: discounts.autoDiscountMinPurchase,
        manualDiscounts: [],
        totalManual: 0,
        logs: discounts.logs.slice(-20)
    };
    
    for (const [userId, data] of Object.entries(discounts.users)) {
        if (data.active !== false) {
            const userData = users[userId] || {};
            result.manualDiscounts.push({
                userId: userId,
                username: userData.username || 'Unknown',
                firstName: userData.firstName || 'User',
                percent: data.percent,
                label: data.label || `Diskon ${data.percent}%`,
                note: data.note || '',
                givenAt: data.givenAt,
                expiredAt: data.expiredAt,
                purchases: (userData.purchases || []).length
            });
        }
    }
    
    result.totalManual = result.manualDiscounts.length;
    
    return result;
};

// ============================
// GET DISCOUNT STATISTICS
// ============================
const getDiscountStats = () => {
    const discounts = loadDiscounts();
    const users = loadUsers();
    
    let totalManualActive = 0;
    let totalManualInactive = 0;
    let totalAutoEligible = 0;
    let totalUsers = Object.keys(users).length;
    
    for (const [userId, data] of Object.entries(discounts.users)) {
        if (data.active !== false) {
            totalManualActive++;
        } else {
            totalManualInactive++;
        }
    }
    
    for (const [userId, userData] of Object.entries(users)) {
        const purchases = userData.purchases || [];
        if (purchases.length >= (discounts.autoDiscountMinPurchase || 5)) {
            totalAutoEligible++;
        }
    }
    
    return {
        autoDiscount: discounts.autoDiscount,
        autoDiscountPercent: discounts.autoDiscountPercent,
        autoDiscountMinPurchase: discounts.autoDiscountMinPurchase,
        totalManualActive,
        totalManualInactive,
        totalAutoEligible,
        totalUsers,
        totalLogs: discounts.logs.length
    };
};

// ============================
// FORMAT DISCOUNT INFO
// ============================
const formatDiscountInfo = (userId, users = null) => {
    if (!users) users = loadUsers();
    const discount = getUserDiscount(userId, users);
    const progress = getDiscountProgress(userId, users);
    
    let text = '';
    
    if (discount) {
        text += `🎯 <b>DISKON AKTIF</b>\n`;
        text += `├ ${discount.label}\n`;
        text += `└ Potongan: ${discount.percent}%\n`;
        
        if (discount.type === 'manual') {
            text += `\n📌 <i>Diskon khusus dari Owner</i>\n`;
            if (discount.note) {
                text += `📝 Catatan: ${discount.note}\n`;
            }
        } else if (discount.type === 'auto') {
            text += `\n📌 <i>Diskon Loyalty (${discount.totalPurchase}x pembelian)</i>\n`;
        }
    } else if (progress && !progress.achieved) {
        text += `🎯 <b>LOYALTY PROGRESS</b>\n`;
        text += `├ ${progress.label}\n`;
        text += `└ ${progress.remaining} lagi untuk diskon ${progress.percent}%!\n`;
    } else {
        text += `❌ Belum ada diskon aktif\n`;
        text += `💡 Beli ${progress ? progress.minPurchase : 5}x untuk dapat diskon loyalty\n`;
    }
    
    return text;
};

// ============================
// HANDLE COMMANDS
// ============================
const handleDiscountCommands = async (bot, msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text || '';
    
    // ===== DAFTAR COMMAND DISKON =====
    const discountCommands = [
        '/adddiscount', '/adddiscont',
        '/removediscount', '/removediscont',
        '/listdiscount', '/listdiscont',
        '/discountstats', '/disconstats',
        '/toggleauto',
        '/setautodiscount', '/setautodiscont',
        '/checkdiscount', '/checkdiscont'
    ];
    
    // Cek apakah ini command diskon
    const isDiscountCommand = discountCommands.some(cmd => text.startsWith(cmd));
    
    if (!isDiscountCommand) {
        return false;
    }
    
    // ===== CEK OWNER =====
    if (String(userId) !== String(OWNER_ID)) {
        await bot.sendMessage(chatId, '❌ <b>Khusus Owner!</b>', { parse_mode: "HTML" });
        return true;
    }
    
    // ===== /adddiscount =====
    if (text.startsWith('/adddiscount') || text.startsWith('/adddiscont')) {
        const parts = text.split(' ');
        if (parts.length < 3) {
            await bot.sendMessage(chatId, `
📌 <b>CARA PAKAI /adddiscount</b>

<code>/adddiscount user_id persen label</code>

📋 <b>Contoh:</b>
<code>/adddiscount 123456789 20 Diskon Spesial</code>
<code>/adddiscount 987654321 10</code>

📌 <b>Keterangan:</b>
├ user_id: ID Telegram user
├ persen: angka 1-100
└ label: (opsional) nama diskon
`, { parse_mode: "HTML" });
            return true;
        }
        
        const targetId = parts[1];
        const percent = parseInt(parts[2]);
        let label = parts.slice(3).join(' ') || null;
        let note = null;
        
        if (label && label.includes('|')) {
            const splitLabel = label.split('|');
            label = splitLabel[0].trim();
            note = splitLabel.slice(1).join('|').trim();
        }
        
        const result = addManualDiscount(targetId, percent, label, note);
        
        if (!result.success) {
            await bot.sendMessage(chatId, `❌ <b>Gagal!</b>\n\n${result.error}`, { parse_mode: "HTML" });
            return true;
        }
        
        const userData = result.data;
        
        await bot.sendMessage(chatId, `
✅ <b>DISKON BERHASIL DITAMBAHKAN!</b>

👤 User: ${userData.username} (${userData.userId})
🎯 Diskon: ${userData.percent}%
📌 Label: ${userData.label}
${userData.note ? `📝 Catatan: ${userData.note}` : ''}
📅 Diberikan: ${new Date().toLocaleString('id-ID')}

💡 Diskon akan otomatis terpotong saat checkout
        `, { parse_mode: "HTML" });
        
        try {
            await bot.sendMessage(parseInt(targetId), `
🎉 <b>ANDA MENDAPATKAN DISKON!</b>

💝 ${userData.label}
🎯 Potongan: ${userData.percent}%
${note ? `📝 Catatan: ${note}` : ''}
💡 Diskon akan otomatis terpotong saat checkout

━━━━━━━━━━━━━━━━━━━━
👑 Owner: @AbahKonoha
            `, { parse_mode: "HTML" });
        } catch (e) {
            console.log(`Gagal kirim notifikasi diskon ke ${targetId}`);
        }
        
        return true;
    }
    
    // ===== /removediscount =====
    if (text.startsWith('/removediscount') || text.startsWith('/removediscont')) {
        const parts = text.split(' ');
        if (parts.length < 2) {
            await bot.sendMessage(chatId, `
📌 <b>CARA PAKAI /removediscount</b>

<code>/removediscount user_id</code>

📋 <b>Contoh:</b>
<code>/removediscount 123456789</code>
`, { parse_mode: "HTML" });
            return true;
        }
        
        const targetId = parts[1];
        const result = removeManualDiscount(targetId);
        
        if (!result.success) {
            await bot.sendMessage(chatId, `❌ <b>Gagal!</b>\n\n${result.error}`, { parse_mode: "HTML" });
            return true;
        }
        
        await bot.sendMessage(chatId, `
✅ <b>DISKON BERHASIL DIHAPUS!</b>

👤 User: ${result.data.username} (${result.data.userId})
📅 Dihapus: ${new Date().toLocaleString('id-ID')}
        `, { parse_mode: "HTML" });
        
        return true;
    }
    
    // ===== /listdiscount =====
    if (text.startsWith('/listdiscount') || text.startsWith('/listdiscont')) {
        const allDiscounts = getAllDiscounts();
        
        let textMsg = `
📊 <b>DAFTAR SEMUA DISKON</b>
━━━━━━━━━━━━━━━━━━━━

⚙️ <b>DISKON OTOMATIS</b>
├ Status: ${allDiscounts.autoDiscount ? '✅ AKTIF' : '❌ NONAKTIF'}
├ Diskon: ${allDiscounts.autoDiscountPercent}%
└ Syarat: ${allDiscounts.autoDiscountMinPurchase}x pembelian

━━━━━━━━━━━━━━━━━━━━
📋 <b>DISKON MANUAL (${allDiscounts.totalManual})</b>
`;

        if (allDiscounts.manualDiscounts.length === 0) {
            textMsg += `❌ Tidak ada diskon manual aktif\n`;
        } else {
            for (const d of allDiscounts.manualDiscounts) {
                textMsg += `
👤 ${d.username} (${d.userId})
├ Diskon: ${d.percent}%
├ Label: ${d.label}
├ Total Beli: ${d.purchases}x
└ Diberikan: ${new Date(d.givenAt).toLocaleDateString('id-ID')}
`;
            }
        }

        textMsg += `
━━━━━━━━━━━━━━━━━━━━
📋 <b>LOG TERAKHIR</b>
`;
        
        if (allDiscounts.logs.length === 0) {
            textMsg += `❌ Belum ada log\n`;
        } else {
            for (const log of allDiscounts.logs.slice(-5).reverse()) {
                const time = new Date(log.timestamp).toLocaleString('id-ID');
                if (log.action === 'add_manual') {
                    textMsg += `├ ✅ ${log.username} mendapat ${log.percent}% (${time})\n`;
                } else if (log.action === 'remove_manual') {
                    textMsg += `├ ❌ ${log.username} dihapus diskon (${time})\n`;
                } else if (log.action === 'toggle_auto') {
                    textMsg += `├ ⚙️ Auto ${log.status} (${time})\n`;
                }
            }
        }
        
        await bot.sendMessage(chatId, textMsg, { parse_mode: "HTML" });
        return true;
    }
    
    // ===== /discountstats =====
    if (text.startsWith('/discountstats') || text.startsWith('/disconstats')) {
        const stats = getDiscountStats();
        
        await bot.sendMessage(chatId, `
📊 <b>STATISTIK DISKON</b>
━━━━━━━━━━━━━━━━━━━━

⚙️ <b>Konfigurasi</b>
├ Auto: ${stats.autoDiscount ? '✅ AKTIF' : '❌ NONAKTIF'}
├ Persen: ${stats.autoDiscountPercent}%
└ Syarat: ${stats.autoDiscountMinPurchase}x

━━━━━━━━━━━━━━━━━━━━
👥 <b>User</b>
├ Total User: ${stats.totalUsers}
├ Eligible Auto: ${stats.totalAutoEligible}
├ Manual Active: ${stats.totalManualActive}
└ Manual Inactive: ${stats.totalManualInactive}

━━━━━━━━━━━━━━━━━━━━
📋 <b>Log</b>
└ Total Log: ${stats.totalLogs}
        `, { parse_mode: "HTML" });
        return true;
    }
    
    // ===== /toggleauto =====
    if (text.startsWith('/toggleauto')) {
        const parts = text.split(' ');
        let status = true;
        
        if (parts.length > 1) {
            status = parts[1].toLowerCase() === 'on' || parts[1].toLowerCase() === '1' || parts[1].toLowerCase() === 'true';
        } else {
            const current = loadDiscounts();
            status = !current.autoDiscount;
        }
        
        const result = toggleAutoDiscount(status);
        
        await bot.sendMessage(chatId, `
⚙️ <b>DISKON OTOMATIS</b>
${result.status === 'activated' ? '✅ Diaktifkan' : '❌ Dinonaktifkan'}

📌 Status: ${result.status === 'activated' ? 'AKTIF' : 'NONAKTIF'}
📅 ${new Date().toLocaleString('id-ID')}
        `, { parse_mode: "HTML" });
        return true;
    }
    
    // ===== /setautodiscount =====
    if (text.startsWith('/setautodiscount') || text.startsWith('/setautodiscont')) {
        const parts = text.split(' ');
        let percent = null;
        let minPurchase = null;
        
        if (parts.length < 2) {
            await bot.sendMessage(chatId, `
📌 <b>CARA PAKAI /setautodiscount</b>

<code>/setautodiscount persen min_purchase</code>

📋 <b>Contoh:</b>
<code>/setautodiscount 15 5</code> → Diskon 15% setelah 5x beli
<code>/setautodiscount 20 3</code> → Diskon 20% setelah 3x beli
`, { parse_mode: "HTML" });
            return true;
        }
        
        if (parts.length >= 2) {
            percent = parseInt(parts[1]);
        }
        if (parts.length >= 3) {
            minPurchase = parseInt(parts[2]);
        }
        
        const result = setAutoDiscountConfig(percent, minPurchase);
        
        await bot.sendMessage(chatId, `
✅ <b>KONFIGURASI DISKON OTOMATIS DIUPDATE!</b>

⚙️ <b>Config Baru:</b>
├ Status: ${result.data.autoDiscount ? '✅ AKTIF' : '❌ NONAKTIF'}
├ Diskon: ${result.data.autoDiscountPercent}%
└ Syarat: ${result.data.autoDiscountMinPurchase}x pembelian

📅 ${new Date().toLocaleString('id-ID')}
        `, { parse_mode: "HTML" });
        return true;
    }
    
    // ===== /checkdiscount =====
    if (text.startsWith('/checkdiscount') || text.startsWith('/checkdiscont')) {
        const parts = text.split(' ');
        let targetId = userId;
        
        if (parts.length > 1) {
            targetId = parts[1];
        }
        
        const users = loadUsers();
        const discountInfo = formatDiscountInfo(targetId, users);
        const userData = users[targetId] || {};
        const username = userData.username || 'Unknown';
        
        await bot.sendMessage(chatId, `
👤 <b>CEK DISKON: ${username}</b>
🆔 ID: <code>${targetId}</code>
━━━━━━━━━━━━━━━━━━━━

${discountInfo}
        `, { parse_mode: "HTML" });
        return true;
    }
    
    return false;
};

// ============================
// EXPORT MODULE
// ============================
module.exports = {
    loadDiscounts,
    saveDiscounts,      // <-- SEKARANG SUDAH ADA FUNGSINYA!
    loadUsers,
    getUserDiscount,
    getDiscountProgress,
    applyDiscount,
    formatDiscountInfo,
    addManualDiscount,
    removeManualDiscount,
    toggleAutoDiscount,
    setAutoDiscountConfig,
    getAllDiscounts,
    getDiscountStats,
    handleDiscountCommands
};