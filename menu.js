// ============================
// MENU.JS - ABH DATA MENU (DENGAN FITUR DISKON + CEK DISKON)
// ============================

const config = require('./config');
const OWNER_ID = config.BOT.OWNER_ID;
const os = require('os');
const fs = require('fs');
const discountModule = require('./discount.js');

// ============================
// LOAD DATA STORE
// ============================
// ============================
// LOAD DATA STORE
// ============================
const DATA_FILE = "./data_abk.json";
const SOLD_FILE = "./sold_data.json";
const REVENUE_FILE = "./revenue.json";

// 🔥 LOAD DATA TERJUAL PERMANEN
const loadSoldPermanent = () => {
    try {
        if (!fs.existsSync(SOLD_FILE)) return { items: [] };
        const raw = fs.readFileSync(SOLD_FILE, "utf8").trim();
        if (!raw || raw === "") return { items: [] };
        const data = JSON.parse(raw);
        if (!data.items) data.items = [];
        return data;
    } catch (err) {
        console.log(`❌ Load sold error:`, err.message);
        return { items: [] };
    }
};

// 🔥 LOAD PENDAPATAN PERMANEN
const loadRevenuePermanent = () => {
    try {
        if (!fs.existsSync(REVENUE_FILE)) return { total: 0 };
        const raw = fs.readFileSync(REVENUE_FILE, "utf8").trim();
        if (!raw || raw === "") return { total: 0 };
        const data = JSON.parse(raw);
        if (!data.total) data.total = 0;
        return data;
    } catch (err) {
        console.log(`❌ Load revenue error:`, err.message);
        return { total: 0 };
    }
};

const loadDataStore = () => {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            return { data: [], total: 0 };
        }
        const raw = fs.readFileSync(DATA_FILE, "utf8").trim();
        if (!raw || raw === "") {
            return { data: [], total: 0 };
        }
        return JSON.parse(raw);
    } catch (err) {
        console.log(`❌ Load data error:`, err.message);
        return { data: [], total: 0 };
    }
};

// ============================
// LOAD USERS
// ============================
const loadUsers = () => {
    try {
        const USERS_FILE = "./users.json";
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
// KEYBOARD UNTUK USER BIASA (DENGAN START ULANG DI ATAS)
// ============================
const MAIN_REPLY_KEYBOARD = [
    ['🔄 Start Ulang'],                          // 1 tombol di paling atas
    ['🔍 Cari Data', '👤 Akun'],               // 2 tombol sejajar
    ['🎯 Cek Diskon', '📋 List Stok Data'],    // 2 tombol sejajar
    ['❓ Bantuan', '📞 Hubungi Owner']         // 2 tombol sejajar
];

// ============================
// KEYBOARD UNTUK OWNER (DENGAN START ULANG DI ATAS)
// ============================
const OWNER_REPLY_KEYBOARD = [
    ['🔄 Start Ulang'],                          // 1 tombol di paling atas
    ['🔍 Cari Data', '👤 Akun'],               // 2 tombol sejajar
    ['📊 List Data ABH', '📁 Upload Data'],    // 2 tombol sejajar
    ['🔄 Update Data', '📢 Broadcast'],        // 2 tombol sejajar
    ['📊 Statistik', '🎯 Diskon'],             // 2 tombol sejajar
    ['💾 Backup', '📞 Hubungi Owner']          // 2 tombol sejajar
];

const isOwner = (userId) => {
    return String(userId) === String(OWNER_ID);
};

// ============================
// FORMAT RUPIAH
// ============================
const formatRupiah = (val) => {
    if (!val) return '0';
    return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

// ============================
// GET USER DISCOUNT INFO
// ============================
const getUserDiscountInfo = (userId) => {
    const users = loadUsers();
    const discount = discountModule.getUserDiscount(userId, users);
    const progress = discountModule.getDiscountProgress(userId, users);
    
    return { discount, progress };
};

// ============================
// SHOW MENU
// ============================
const showMenu = async (bot, chatId, users) => {
    const userId = chatId;
    const isOwnerUser = isOwner(userId);
    const userData = users[userId] || {};
    const username = userData.username || 'User';
    
    // ===== AMBIL DATA STOK DARI data_abk.json =====
        // ===== AMBIL DATA STOK DARI data_abk.json =====
    const dataStore = loadDataStore();
    const allData = dataStore.data || [];
    const totalData = allData.length;

    // 🔥 Ambil dari file PERMANEN (bukan dari dataStore)
    const soldPermanent = loadSoldPermanent();
    const revenuePermanent = loadRevenuePermanent();

    const soldData = soldPermanent.items?.length || 0;
    const availableData = totalData - soldData;
    const totalRevenue = revenuePermanent.total || 0;

    // ===== CEK DISKON USER =====
    const { discount, progress } = getUserDiscountInfo(userId);

    let menuText = `
╭ ───┈ " 📊 " ── ⬦ ׁ
├   <b>ABAH KONOHA DATA STORE</b>
╰─┈꯭─꯭──꯭─꯭─꯭──꯭─╌─꯭─꯭─꯭─꯭──꯭──꯭

👤 <b>Username:</b> ${username}
🆔 <b>User ID:</b> <code>${userId}</code>
📅 <b>Bergabung:</b> ${userData.date || 'Baru'}

━━━━━━━━━━━━━━━━━━━━
📦 <b>STOK DATA</b>
├ 📄 Total Data: ${totalData}
├ ✅ Tersedia: ${availableData}
├ ❌ Terjual: ${soldData}
└ 💰 Pendapatan: Rp${formatRupiah(totalRevenue)}
`;

    // ===== TAMPILKAN INFO DISKON SINGKAT =====
    if (discount) {
        menuText += `
━━━━━━━━━━━━━━━━━━━━
🎯 <b>DISKON AKTIF!</b>
├ ${discount.label}
└ Potongan: ${discount.percent}%
`;
        if (discount.type === 'manual') {
            menuText += `📌 <i>Diskon khusus dari Owner</i>\n`;
        }
        menuText += `
💡 Klik "🎯 Cek Diskon" untuk detail lengkap
`;
    } else if (progress && !progress.achieved) {
        const barLength = 10;
        const filled = Math.floor((progress.totalPurchase / progress.minPurchase) * barLength);
        const empty = barLength - filled;
        const bar = '▓'.repeat(filled) + '░'.repeat(empty);
        
        menuText += `
━━━━━━━━━━━━━━━━━━━━
🎯 <b>LOYALTY PROGRESS</b>
├ ${bar}
├ ${progress.totalPurchase}/${progress.minPurchase} pembelian
└ Beli ${progress.remaining} lagi untuk diskon ${progress.percent}%!
`;
    } else {
        // Cek apakah auto diskon aktif
        const discounts = discountModule.loadDiscounts();
        if (discounts.autoDiscount !== false) {
            const minPurchase = discounts.autoDiscountMinPurchase || 5;
            const percent = discounts.autoDiscountPercent || 10;
            menuText += `
━━━━━━━━━━━━━━━━━━━━
🎯 <b>LOYALTY PROGRAM</b>
├ Diskon ${percent}% setelah ${minPurchase}x pembelian
└ Klik "🎯 Cek Diskon" untuk detail
`;
        }
    }

    if (isOwnerUser) {
        menuText += `
━━━━━━━━━━━━━━━━━━━━
👑 <b>OWNER PANEL</b>
├ 📁 Upload Data - Upload file Excel baru
├ 🔄 Update Data - Update data yang sudah ada
├ 📢 Broadcast - Kirim pesan ke semua user
├ 📊 Statistik - Lihat statistik bot
└ 🎯 Diskon - Atur diskon user
`;
    }

    menuText += `
━━━━━━━━━━━━━━━━━━━━
📋 <b>CARA PAKAI:</b>
1. Klik "🔍 Cari Data" 
2. Ketik nama kabupaten/kota
3. Lihat semua data di daerah itu
4. Klik tombol BELI (harga tertera di tombol)

━━━━━━━━━━━━━━━━━━━━
📋 Gunakan tombol di bawah
`;

    const keyboard = isOwnerUser ? OWNER_REPLY_KEYBOARD : MAIN_REPLY_KEYBOARD;

    await bot.sendMessage(chatId, menuText, {
        parse_mode: "HTML",
        reply_markup: {
            keyboard: keyboard,
            resize_keyboard: true,
            one_time_keyboard: false
        }
    });
};

// ============================
// SHOW LIST STOK DATA DENGAN PAGINATION (10 PER HALAMAN)
// ============================

// Simpan session untuk pagination
const listStokSessions = {};

const showListStokData = async (bot, chatId, page = 0) => {
    const dataStore = loadDataStore();
    const allData = dataStore.data || [];
    
    // Filter data yang TERSEDIA (belum sold)
    const availableData = allData.filter(item => !item.sold);
    
    if (availableData.length === 0) {
        await bot.sendMessage(chatId, `
📋 <b>LIST STOK DATA</b>
━━━━━━━━━━━━━━━━━━━━

❌ <b>STOK KOSONG!</b>

💡 Belum ada data yang tersedia.
📌 Hubungi Owner untuk informasi lebih lanjut.
👑 Owner: @AbahKonoha
        `, {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🔙 KEMBALI KE MENU", callback_data: "back_to_main" }]
                ]
            }
        });
        return;
    }
    
    // Hitung statistik
        // Hitung statistik
    const totalData = allData.length;
    // 🔥 Ambil dari file permanen
    const soldPermanent = loadSoldPermanent();
    const soldData = soldPermanent.items?.length || 0;
    
    // Pagination: 10 item per halaman
    const itemsPerPage = 10;
    const totalPages = Math.ceil(availableData.length / itemsPerPage);
    const startIndex = page * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, availableData.length);
    const pageData = availableData.slice(startIndex, endIndex);
    
    // Simpan session
    listStokSessions[chatId] = {
        page: page,
        totalPages: totalPages,
        totalData: availableData.length,
        allData: availableData
    };
    
    // Fungsi sensor nama
    const sensorNama = (nama) => {
        if (!nama || nama === '-') return 'SENSOR';
        const clean = String(nama).trim();
        if (clean.length <= 2) return clean.charAt(0) + '***';
        const first = clean.charAt(0);
        const last = clean.charAt(clean.length - 1);
        const middle = '*'.repeat(Math.min(clean.length - 2, 4));
        return first + middle + last;
    };
    
    let text = `
📋 <b>LIST STOK DATA</b>
━━━━━━━━━━━━━━━━━━━━
📊 <b>Total Data:</b> ${totalData}
✅ <b>Tersedia:</b> ${availableData.length}
❌ <b>Terjual:</b> ${soldData}
━━━━━━━━━━━━━━━━━━━━
📄 <b>Halaman ${page + 1} dari ${totalPages}</b>
📌 Menampilkan ${startIndex + 1} - ${endIndex} dari ${availableData.length}
━━━━━━━━━━━━━━━━━━━━

`;
    
    // Tampilkan data per halaman
    for (const item of pageData) {
        const num = String(item.jsNumber).padStart(2, '0');
        const harga = item.harga || 5000;
        const saldo = formatRupiah(item.SaldoJMO || 0);
        const namaSensor = sensorNama(item.Nama);
        
        text += `
<b>ABH ${num}</b>
📍 ${item.Kabupaten} - ${item.Kecamatan}
👤 ${namaSensor}
💰 Saldo: Rp${saldo}
💵 Harga: Rp${formatRupiah(harga)}
`;
    }
    
    text += `
━━━━━━━━━━━━━━━━━━━━
💡 Klik tombol angka untuk lihat detail & beli
`;
    
    // ===== BUILD KEYBOARD =====
    const keyboard = [];
    
    // Tombol angka (10 per halaman)
    const numberButtons = [];
    for (const item of pageData) {
        const num = String(item.jsNumber).padStart(2, '0');
        numberButtons.push({ 
            text: `${num}`,
            callback_data: `detail_${item.jsNumber}` 
        });
    }
    
    // Bagi tombol angka menjadi baris (max 5 per baris)
    for (let i = 0; i < numberButtons.length; i += 5) {
        keyboard.push(numberButtons.slice(i, i + 5));
    }
    
    // Tombol navigasi halaman
    const navButtons = [];
    if (page > 0) {
        navButtons.push({ text: "◀️ Prev", callback_data: `liststok_page_${page - 1}` });
    }
    // Info halaman
    navButtons.push({ text: `${page + 1}/${totalPages}`, callback_data: "liststok_info" });
    if (page < totalPages - 1) {
        navButtons.push({ text: "Next ▶️", callback_data: `liststok_page_${page + 1}` });
    }
    if (navButtons.length > 0) {
        keyboard.push(navButtons);
    }
    
    // ===== HANYA TOMBOL KEMBALI =====
    keyboard.push([{ text: "🔙 KEMBALI KE MENU", callback_data: "back_to_main" }]);
    
    await bot.sendMessage(chatId, text, {
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: keyboard
        }
    });
};

// ============================
// HANDLE LIST STOK CALLBACK
// ============================
const handleListStokCallback = async (bot, q) => {
    const data = q.data;
    const chatId = q.message.chat.id;
    const userId = q.from.id;
    
    if (data.startsWith("liststok_page_")) {
        const page = parseInt(data.replace("liststok_page_", ""));
        try {
            await bot.deleteMessage(chatId, q.message.message_id);
        } catch (e) {}
        await showListStokData(bot, chatId, page);
        return true;
    }
    
    if (data === "liststok_info") {
        const session = listStokSessions[chatId];
        if (session) {
            await bot.answerCallbackQuery(q.id, {
                text: `Halaman ${session.page + 1} dari ${session.totalPages} | Total ${session.totalData} data tersedia`,
                show_alert: false
            });
        }
        return true;
    }
    
    if (data === "search_from_list") {
        try {
            await bot.deleteMessage(chatId, q.message.message_id);
        } catch (e) {}
        
        await bot.sendMessage(chatId, `
🔍 <b>CARI DATA BERDASARKAN DAERAH</b>
Masukkan nama Kabupaten/Kota yang ingin dicari.
📌 Contoh: Aceh Tengah, Medan, Jakarta
📌 Atau kirim langsung NOMOR ABH (contoh: 5)

💡 Klik tombol di bawah untuk batal:
        `, {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "❌ BATAL", callback_data: "cancel_search" }]
                ]
            }
        });
        
        // Set session waiting search (gunakan global dari bot.js)
        // Karena searchSessions ada di bot.js, kita akses via global
        if (typeof global.searchSessions !== 'undefined') {
            global.searchSessions[chatId] = { waitingSearch: true };
        }
        return true;
    }
    
    if (data === "liststok_refresh") {
        try {
            await bot.deleteMessage(chatId, q.message.message_id);
        } catch (e) {}
        const session = listStokSessions[chatId];
        await showListStokData(bot, chatId, session ? session.page : 0);
        return true;
    }
    
    return false;
};

// ============================
// SHOW CEK DISKON (UNTUK USER BIASA)
// ============================
const showCekDiskon = async (bot, chatId, userId) => {
    const userData = loadUsers()[userId] || {};
    const username = userData.username || 'User';
    const purchases = userData.purchases || [];
    
    // ===== AMBIL INFO DISKON =====
    const { discount, progress } = getUserDiscountInfo(userId);
    const discounts = discountModule.loadDiscounts();
    
    let text = `
╭ ───┈ " 🎯 " ── ⬦ ׁ
├  <b>CEK STATUS DISKON</b>
╰─┈꯭─꯭──꯭─꯭─꯭──꯭─╌─꯭─꯭─꯭─꯭──꯭──꯭

👤 <b>Username:</b> ${username}
🆔 <b>User ID:</b> <code>${userId}</code>
📊 <b>Total Pembelian:</b> ${purchases.length} data

━━━━━━━━━━━━━━━━━━━━
`;

    // ===== STATUS DISKON =====
    if (discount) {
        text += `🎯 <b>✅ DISKON AKTIF</b>\n\n`;
        text += `📌 <b>Jenis:</b> ${discount.type === 'manual' ? '🔹 Manual (Dari Owner)' : '🔸 Otomatis (Loyalty)'}\n`;
        text += `📌 <b>Label:</b> ${discount.label}\n`;
        text += `📌 <b>Potongan:</b> ${discount.percent}%\n`;
        
        if (discount.type === 'manual') {
            text += `📌 <b>Diberikan:</b> ${discount.givenAt ? new Date(discount.givenAt).toLocaleDateString('id-ID') : '-'}\n`;
            if (discount.note) {
                text += `📝 <b>Catatan:</b> ${discount.note}\n`;
            }
            if (discount.expiredAt) {
                text += `⏰ <b>Berlaku sampai:</b> ${new Date(discount.expiredAt).toLocaleDateString('id-ID')}\n`;
            }
        } else if (discount.type === 'auto') {
            text += `📌 <b>Syarat:</b> ${discount.minPurchase}x pembelian\n`;
            text += `📌 <b>Total Beli:</b> ${discount.totalPurchase}x\n`;
        }
        
        text += `
━━━━━━━━━━━━━━━━━━━━
💡 <b>Info:</b> Diskon akan otomatis terpotong saat checkout!
`;
        
    } else if (progress) {
        if (progress.achieved) {
            text += `🎯 <b>✅ DISKON LOYALTY AKTIF!</b>\n\n`;
            text += `📌 <b>Diskon:</b> ${progress.percent}%\n`;
            text += `📌 <b>Syarat:</b> ${progress.minPurchase}x pembelian\n`;
            text += `📌 <b>Total Beli:</b> ${progress.totalPurchase}x\n`;
            text += `
━━━━━━━━━━━━━━━━━━━━
💡 Diskon akan otomatis terpotong saat checkout!
`;
        } else {
            const barLength = 15;
            const filled = Math.floor((progress.totalPurchase / progress.minPurchase) * barLength);
            const empty = barLength - filled;
            const bar = '▓'.repeat(filled) + '░'.repeat(empty);
            
            text += `🎯 <b>PROGRESS LOYALTY</b>\n\n`;
            text += `📌 <b>Target:</b> ${progress.minPurchase}x pembelian\n`;
            text += `📌 <b>Progress:</b> ${progress.totalPurchase}/${progress.minPurchase}\n`;
            text += `📌 <b>Bar:</b> ${bar}\n`;
            text += `📌 <b>Sisa:</b> ${progress.remaining} pembelian lagi\n`;
            text += `📌 <b>Hadiah:</b> Diskon ${progress.percent}%\n`;
            
            text += `
━━━━━━━━━━━━━━━━━━━━
💡 <b>Tips:</b> Beli ${progress.remaining} data lagi untuk dapat diskon!
`;
        }
    } else {
        // Tidak ada diskon dan progress
        const isAutoEnabled = discounts.autoDiscount !== false;
        const minPurchase = discounts.autoDiscountMinPurchase || 5;
        const percent = discounts.autoDiscountPercent || 10;
        
        if (isAutoEnabled) {
            text += `❌ <b>Belum ada diskon aktif</b>\n\n`;
            text += `📌 <b>Program Loyalty:</b>\n`;
            text += `├ Diskon ${percent}% setelah ${minPurchase}x pembelian\n`;
            text += `└ Beli ${minPurchase} data untuk mulai dapat diskon!\n`;
        } else {
            text += `❌ <b>Belum ada diskon aktif</b>\n\n`;
            text += `💡 Diskon akan diberikan oleh Owner secara manual.\n`;
            text += `📌 Hubungi Owner untuk informasi lebih lanjut.\n`;
        }
    }

    // ===== RIWAYAT PEMBELIAN SINGKAT =====
    if (purchases.length > 0) {
        text += `
━━━━━━━━━━━━━━━━━━━━
📋 <b>RIWAYAT PEMBELIAN TERAKHIR</b>
`;
        const last3 = purchases.slice(-3).reverse();
        for (const p of last3) {
            const discountText = p.discountPercent > 0 ? ` (diskon ${p.discountPercent}%)` : '';
            text += `├ ABH ${String(p.abhNumber).padStart(3, '0')} | Rp${formatRupiah(p.price)}${discountText}\n`;
        }
        if (purchases.length > 3) {
            text += `└ ... dan ${purchases.length - 3} lainnya\n`;
        }
    }

    text += `
━━━━━━━━━━━━━━━━━━━━
📌 Klik tombol di bawah untuk kembali
`;

    await bot.sendMessage(chatId, text, {
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [{ text: "🔙 KEMBALI KE MENU", callback_data: "back_to_main" }]
            ]
        }
    });
};

// ============================
// SHOW AKUN (DENGAN INFO DISKON)
// ============================
const showAkun = async (bot, chatId, userId, users) => {
    const isOwnerUser = isOwner(userId);
    const userData = users[userId] || {};
    const purchases = userData.purchases || [];

    // ===== CEK DISKON =====
    const { discount, progress } = getUserDiscountInfo(userId);

    let akunText = `
╭ ───┈ " 👤 " ── ⬦ ׁ
├  <b>AKUN ANDA</b>
╰─┈꯭─꯭──꯭─꯭─꯭──꯭─╌─꯭─꯭─꯭─꯭──꯭──꯭

🆔 ID: <code>${userId}</code>
👤 Nama: ${userData.firstName || 'User'}
📅 Bergabung: ${userData.date || '-'}
📊 Total Beli: ${purchases.length} data
`;

    // ===== TAMPILKAN INFO DISKON =====
    if (discount) {
        akunText += `
━━━━━━━━━━━━━━━━━━━━
🎯 <b>DISKON AKTIF</b>
├ ${discount.label}
└ Potongan: ${discount.percent}%

💡 Diskon akan otomatis terpotong saat checkout
`;
        if (discount.type === 'manual') {
            akunText += `📌 <i>Diskon khusus dari Owner</i>\n`;
        } else if (discount.type === 'auto') {
            akunText += `📌 <i>Diskon Loyalty (${discount.totalPurchase}x pembelian)</i>\n`;
        }
    } else if (progress && !progress.achieved) {
        const barLength = 10;
        const filled = Math.floor((progress.totalPurchase / progress.minPurchase) * barLength);
        const empty = barLength - filled;
        const bar = '▓'.repeat(filled) + '░'.repeat(empty);
        
        akunText += `
━━━━━━━━━━━━━━━━━━━━
🎯 <b>LOYALTY PROGRESS</b>
├ ${bar}
├ ${progress.totalPurchase}/${progress.minPurchase} pembelian
└ Beli ${progress.remaining} lagi untuk diskon ${progress.percent}%!
`;
    } else {
        const discounts = discountModule.loadDiscounts();
        if (discounts.autoDiscount !== false) {
            const minPurchase = discounts.autoDiscountMinPurchase || 5;
            const percent = discounts.autoDiscountPercent || 10;
            akunText += `
━━━━━━━━━━━━━━━━━━━━
🎯 <b>LOYALTY PROGRAM</b>
├ Diskon ${percent}% setelah ${minPurchase}x pembelian
└ Beli ${minPurchase - purchases.length} lagi untuk dapat diskon!
`;
        }
    }

    if (isOwnerUser) {
        akunText += `
━━━━━━━━━━━━━━━━━━━━
👑 <b>Status: OWNER</b>
`;
    }

    akunText += `
━━━━━━━━━━━━━━━━━━━━
📋 <b>RIWAYAT PEMBELIAN</b>
`;

    if (purchases.length === 0) {
        akunText += `❌ Belum ada pembelian\n`;
    } else {
        let totalSpent = 0;
        for (const p of purchases) {
            totalSpent += (p.price || 0);
        }
        akunText += `💰 Total Belanja: Rp${formatRupiah(totalSpent)}\n\n`;
        
        const last5 = purchases.slice(-5).reverse();
        for (const p of last5) {
            const discountText = p.discountPercent > 0 ? ` (diskon ${p.discountPercent}%)` : '';
            akunText += `├ ABH ${String(p.abhNumber).padStart(3, '0')} | Rp${formatRupiah(p.price)}${discountText}\n`;
        }
        if (purchases.length > 5) {
            akunText += `└ ... dan ${purchases.length - 5} lainnya\n`;
        }
    }

    await bot.sendMessage(chatId, akunText, {
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [{ text: "🎯 Cek Diskon", callback_data: "cek_diskon" }],
                [{ text: "🔙 KEMBALI KE MENU", callback_data: "back_to_main" }]
            ]
        }
    });
};

// ============================
// SHOW BANTUAN (DENGAN INFO DISKON)
// ============================
const showBantuan = async (bot, chatId) => {
    await bot.sendMessage(chatId, `
╭ ───┈ " ❓ " ── ⬦ ׁ
├  <b>BANTUAN</b>
╰─┈꯭─꯭──꯭─꯭─꯭──꯭─╌─꯭─꯭─꯭─꯭──꯭──꯭

📌 <b>Cara Cari & Beli Data:</b>

1. Klik "🔍 Cari Data"
2. Ketik nama kabupaten/kota
   Contoh: Aceh Tengah, Pesisir Selatan
3. Semua data di daerah itu muncul
4. Klik tombol BELI (harga tertera di tombol)

🎯 <b>Sistem Diskon:</b>
├ 🔹 Diskon Manual - Dari Owner (khusus user tertentu)
├ 🔹 Diskon Otomatis - 10% setelah 5x pembelian
├ 🔹 Diskon otomatis terpotong saat checkout
├ 🔹 Progress loyalty terlihat di "🎯 Cek Diskon"
└ 🔹 Klik "🎯 Cek Diskon" untuk detail lengkap

👑 <b>Owner:</b> @AbahKonoha
`, {
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [{ text: "🔙 KEMBALI KE MENU", callback_data: "back_to_main" }]
            ]
        }
    });
};

// ============================
// SHOW HUBUNGI OWNER
// ============================
const showHubungiOwner = async (bot, chatId) => {
    await bot.sendMessage(chatId, `
╭ ───┈ " 📞 " ── ⬦ ׁ
├  <b>HUBUNGI OWNER</b>
╰─┈꯭─꯭──꯭─꯭─꯭──꯭─╌─꯭─꯭─꯭─꯭──꯭──꯭

💡 <b>Keterangan:</b>
├ Chat WhatsApp lebih cepat respon
├ Telegram untuk pertanyaan umum
├ Sertakan ID User saat chat: <code>${chatId}</code>
└ Admin akan merespon secepatnya

━━━━━━━━━━━━━━━━━━━━
📌 Klik tombol di bawah untuk menghubungi
`, {
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "📱 WhatsApp", url: "https://wa.me/6281319497283" },
                    { text: "📨 Telegram", url: "https://t.me/AbahKonoha" }
                ],
                [{ text: "🔙 KEMBALI KE MENU", callback_data: "back_to_main" }]
            ]
        }
    });
};

// ============================
// SHOW DISKON MENU (OWNER ONLY)
// ============================
const showDiskonMenu = async (bot, chatId) => {
    const discounts = discountModule.loadDiscounts();
    const users = discountModule.loadUsers();
    
    let text = `
╭ ───┈ " 🎯 " ── ⬦ ׁ
├  <b>MANAJEMEN DISKON</b>
╰─┈꯭─꯭──꯭─꯭─꯭──꯭─╌─꯭─꯭─꯭─꯭──꯭──꯭

📌 <b>Jenis Diskon:</b>
├ 🔹 Manual - Set diskon untuk user tertentu
└ 🔹 Otomatis - ${discounts.autoDiscountPercent || 10}% setelah ${discounts.autoDiscountMinPurchase || 5}x pembelian

━━━━━━━━━━━━━━━━━━━━
📋 <b>DAFTAR DISKON AKTIF</b>
`;

    const activeUsers = Object.keys(discounts.users || {}).filter(id => discounts.users[id].active !== false);
    
    if (activeUsers.length === 0) {
        text += `❌ Belum ada diskon manual aktif\n`;
    } else {
        for (const id of activeUsers) {
            const d = discounts.users[id];
            const userData = users[id] || {};
            const username = userData.username || 'Unknown';
            text += `├ 👤 ${username} (${id}) | ${d.percent}% | ${d.label || 'Manual'}\n`;
        }
    }

    text += `
━━━━━━━━━━━━━━━━━━━━
⚙️ <b>Status Diskon Otomatis:</b> ${discounts.autoDiscount !== false ? '✅ AKTIF' : '❌ NONAKTIF'}
📌 Diskon: ${discounts.autoDiscountPercent || 10}% | Syarat: ${discounts.autoDiscountMinPurchase || 5}x pembelian

━━━━━━━━━━━━━━━━━━━━
📌 Pilih aksi di bawah:
`;

await bot.sendMessage(chatId, text, {
    parse_mode: "HTML",
    reply_markup: {
        inline_keyboard: [
            [{ text: "➕ Tambah Diskon Manual", callback_data: "discount_manual_add" }],
            [{ text: "❌ Hapus Diskon User", callback_data: "discount_remove" }],
            [{ text: "⚙️ Atur Diskon Otomatis", callback_data: "discount_auto_toggle" }],
            [{ text: "📊 Lihat Semua Diskon", callback_data: "discount_list" }],
            [{ text: "🔧 Set Auto Diskon %", callback_data: "discount_set_auto" }],
            [{ text: "🔙 KEMBALI KE MENU", callback_data: "back_to_main" }]
        ]
    }
});
};

// ============================
// EXPORT MODULE
// ============================
module.exports = {
    showMenu,
    showAkun,
    showBantuan,
    showHubungiOwner,
    showDiskonMenu,
    showCekDiskon,
    showListStokData,
    handleListStokCallback,  
    getUserDiscountInfo,
    isOwner,
    MAIN_REPLY_KEYBOARD,
    OWNER_REPLY_KEYBOARD
};