// ============================
// MENU.JS - ABH DATA MENU
// ============================

const config = require('./config');
const OWNER_ID = config.BOT.OWNER_ID;
const os = require('os');

// KEYBOARD UNTUK USER BIASA (TANPA LIST DATA)
const MAIN_REPLY_KEYBOARD = [
    ['📋 Menu', '👤 Akun'],
    ['🔍 Cari Data', '❓ Bantuan'],
    ['♲ Refresh']
];

// KEYBOARD UNTUK OWNER (DENGAN LIST DATA)
const OWNER_REPLY_KEYBOARD = [
    ['📋 Menu', '👤 Akun'],
    ['🔍 Cari Data', '📊 List Data ABH'],
    ['📁 Upload Data', '🔄 Update Data'],
    ['📢 Broadcast', '📊 Statistik'],
    ['♲ Refresh']
];

const isOwner = (userId) => {
    return String(userId) === String(OWNER_ID);
};

const getUptime = () => {
    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
};

const showMenu = async (bot, chatId, users) => {
    const userId = chatId;
    const isOwnerUser = isOwner(userId);
    const userData = users[userId] || {};
    const username = userData.username || 'User';
    
    const platform = os.platform();
    let platformName = 'Linux';
    if (platform === 'linux') platformName = '🐧 Linux';
    else if (platform === 'win32') platformName = '🪟 Windows';
    else if (platform === 'darwin') platformName = '🍎 macOS';
    
    const uptime = getUptime();
    const totalUsers = Object.keys(users).length;
    const memory = Math.round(process.memoryUsage().rss / 1024 / 1024);

    let menuText = `
╭ ───┈ " 📊 " ── ⬦ ׁ
├   <b>ABAH KONOHA DATA STORE</b>
╰─┈꯭─꯭──꯭─꯭─꯭──꯭─╌─꯭─꯭─꯭─꯭──꯭──꯭

👤 <b>Username:</b> ${username}
🆔 <b>User ID:</b> <code>${userId}</code>
📅 <b>Bergabung:</b> ${userData.date || 'Baru'}

━━━━━━━━━━━━━━━━━━━━
📊 <b>STATUS BOT</b>
├ 🟢 Status: <b>ACTIVE</b>
├ 👥 Total User: ${totalUsers}
├ ⏱️ Uptime: ${uptime}
├ 💾 Memory: ${memory} MB
└ 🖥️ Server: ${platformName}
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

👑 <b>Owner:</b> @Kjsstore_own
`, {
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [{ text: "🔙 KEMBALI KE MENU", callback_data: "back_to_main" }]
            ]
        }
    });
};

module.exports = {
    showMenu,
    showAkun,
    showBantuan,
    isOwner,
    MAIN_REPLY_KEYBOARD,
    OWNER_REPLY_KEYBOARD
};