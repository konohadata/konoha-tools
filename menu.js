// ============================
// MENU.JS - ABH DATA MENU
// ============================

const config = require('./config');
const OWNER_ID = config.BOT.OWNER_ID;
const os = require('os');
const fs = require('fs');

// ============================
// LOAD DATA STORE
// ============================
const DATA_FILE = "./data_abk.json";

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
// KEYBOARD UNTUK USER BIASA
// ============================
const MAIN_REPLY_KEYBOARD = [
    ['🔍 Cari Data', '👤 Akun'],
    ['❓ Bantuan', '📞 Hubungi Owner']
];

// ============================
// KEYBOARD UNTUK OWNER
// ============================
const OWNER_REPLY_KEYBOARD = [
    ['🔍 Cari Data', '👤 Akun'],
    ['📊 List Data ABH', '📁 Upload Data'],
    ['🔄 Update Data', '📢 Broadcast'],
    ['📊 Statistik', '📞 Hubungi Owner']
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
// SHOW MENU
// ============================
const showMenu = async (bot, chatId, users) => {
    const userId = chatId;
    const isOwnerUser = isOwner(userId);
    const userData = users[userId] || {};
    const username = userData.username || 'User';
    
    // ===== AMBIL DATA STOK DARI data_abk.json =====
    const dataStore = loadDataStore();
    const allData = dataStore.data || [];
    const totalData = allData.length;
    const soldData = allData.filter(d => d.sold === true).length;
    const availableData = totalData - soldData;
    
    // Hitung total pendapatan dari data yang terjual
    let totalRevenue = 0;
    for (const item of allData) {
        if (item.sold === true) {
            totalRevenue += (item.harga || 5000);
        }
    }

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

    if (isOwnerUser) {
        menuText += `
━━━━━━━━━━━━━━━━━━━━
👑 <b>OWNER PANEL</b>
├ 📁 Upload Data - Upload file Excel baru
├ 🔄 Update Data - Update data yang sudah ada
├ 📢 Broadcast - Kirim pesan ke semua user
└ 📊 Statistik - Lihat statistik bot
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
// SHOW AKUN
// ============================
const showAkun = async (bot, chatId, userId, users) => {
    const isOwnerUser = isOwner(userId);
    const userData = users[userId] || {};
    const purchases = userData.purchases || [];

    let akunText = `
╭ ───┈ " 👤 " ── ⬦ ׁ
├  <b>AKUN ANDA</b>
╰─┈꯭─꯭──꯭─꯭─꯭──꯭─╌─꯭─꯭─꯭─꯭──꯭──꯭

🆔 ID: <code>${userId}</code>
👤 Nama: ${userData.firstName || 'User'}
📅 Bergabung: ${userData.date || '-'}
`;

    if (isOwnerUser) {
        akunText += `
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
        const last5 = purchases.slice(-5).reverse();
        for (const p of last5) {
            akunText += `├ ABH ${String(p.abhNumber).padStart(3, '0')} | Rp${p.price.toLocaleString('id-ID')}\n`;
        }
        if (purchases.length > 5) {
            akunText += `└ ... dan ${purchases.length - 5} lainnya\n`;
        }
    }

    await bot.sendMessage(chatId, akunText, {
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [{ text: "🔙 KEMBALI KE MENU", callback_data: "back_to_main" }]
            ]
        }
    });
};

// ============================
// SHOW BANTUAN
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

module.exports = {
    showMenu,
    showAkun,
    showBantuan,
    showHubungiOwner,
    isOwner,
    MAIN_REPLY_KEYBOARD,
    OWNER_REPLY_KEYBOARD
};