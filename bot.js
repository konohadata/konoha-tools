// ============================
// BOT.JS - ABH DATA STORE (DENGAN SOLD SYSTEM, NOTIF & CART + PAGINATION + TOMBOL ANGKA)
// ============================

const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");
const XLSX = require('xlsx');
const axios = require('axios');
const broadcast = require('./broadcast.js');

// ============================
// CONFIG
// ============================
const config = require('./config');
const BOT_TOKEN = config.BOT.TOKEN;
const OWNER_ID = config.BOT.OWNER_ID;

// ============================
// NOTIFICATION BOT
// ============================
const NOTIF_BOT_TOKEN = config.NOTIFICATION?.BOT_TOKEN || null;
const NOTIF_CHAT_ID = config.NOTIFICATION?.CHAT_ID || null;
const NOTIF_ENABLED = config.NOTIFICATION?.ENABLED || false;
const NOTIF_TO_OWNER = config.NOTIFICATION?.SEND_TO_OWNER || true;

let notifBot = null;
if (NOTIF_BOT_TOKEN && NOTIF_ENABLED) {
    try {
        notifBot = new TelegramBot(NOTIF_BOT_TOKEN, { polling: false });
        console.log('✅ Notification Bot initialized');
    } catch (e) {
        console.log('⚠️ Failed to init notification bot:', e.message);
    }
}

// ============================
// INIT BOT
// ============================
const bot = new TelegramBot(BOT_TOKEN, {
    polling: {
        interval: 500,
        autoStart: true
    }
});

// ============================
// FILE PATHS
// ============================
const USERS_FILE = "./users.json";
const DATA_FILE = "./data_abk.json";
const TEMP_DIR = path.join(__dirname, 'temp_excel');

if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// ============================
// LOAD/SAVE JSON
// ============================
const loadJSON = (file) => {
    try {
        if (!fs.existsSync(file)) {
            fs.writeFileSync(file, "{}");
            return {};
        }
        const raw = fs.readFileSync(file, "utf8").trim();
        if (!raw || raw === "") {
            fs.writeFileSync(file, "{}");
            return {};
        }
        return JSON.parse(raw);
    } catch (err) {
        console.log(`❌ JSON ERROR ${file}:`, err.message);
        fs.writeFileSync(file, "{}");
        return {};
    }
};

const saveJSON = (file, data) => {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
    } catch (err) {
        console.log(`❌ SAVE ERROR ${file}:`, err.message);
    }
};

let users = loadJSON(USERS_FILE);
let dataStore = loadJSON(DATA_FILE);
const buySessions = {};
const searchSessions = {};
const paymentSessions = {};
const qrisMessageIds = {};
const processingUsers = new Set();

// ============================
// 🛒 CART SYSTEM
// ============================
const cartSessions = {};
const cartTotalSessions = {};

// ============================
// IMPORT MENU
// ============================
const { showMenu, showAkun, showBantuan, isOwner, showHubungiOwner } = require('./menu.js');
const { generateQRIS, cekStatusDualWithRetry } = require('./payment.js');

// ============================
// FUNGSI PARSING EXCEL
// ============================
const parseSaldo = (str) => {
    if (!str) return 0;
    if (typeof str === 'number') return Math.floor(str);
    const clean = String(str).replace(/[^\d]/g, '');
    return parseInt(clean) || 0;
};

const formatRupiah = (val) => {
    if (!val) return '0';
    return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

const getKpjDuaDigit = (kpj) => {
    if (!kpj) return '-';
    const clean = String(kpj).replace(/\D/g, '');
    if (clean.length === 0) return '-';
    return clean.substring(0, 2);
};

const getJumlahKartuDisplay = (jml) => {
    const num = parseInt(jml) || 1;
    if (num <= 1) return 'TUNGGAL';
    return num - 1;
};

const getTahun = (ttl) => {
    if (!ttl) return '-';
    const match = String(ttl).match(/\d{4}/);
    return match ? match[0] : '-';
};

const getTahunIuran = (iuran) => {
    if (!iuran) return '-';
    const match = String(iuran).match(/\d{4}/);
    return match ? match[0] : '-';
};

const formatJK = (jk) => {
    if (!jk) return '-';
    const upper = jk.toUpperCase();
    if (upper.includes('LAKI') || upper.includes('L')) return 'L';
    if (upper.includes('PEREMPUAN') || upper.includes('P')) return 'P';
    return jk;
};

const formatLasik = (lasik) => {
    if (!lasik) return '⚠️ BELUM DILAKUKAN';
    const upper = lasik.toUpperCase();
    if (upper.includes('GO JMO') || upper.includes('SUDAH')) return '✅ SUDAH';
    if (upper.includes('BELUM')) return '⚠️ BELUM';
    return lasik;
};

// ============================
// BUILD OUTPUT TEXT
// ============================
const buildOutputText = (obj, jsNum) => {
    const kab = obj.Kabupaten || '-';
    const kec = obj.Kecamatan || '-';
    const kel = obj.Kelurahan || '-';
    const pt = obj.PT || '-';
    const kpj = getKpjDuaDigit(obj.KPJ);
    const tahun = getTahun(obj.TTL);
    const jk = formatJK(obj.JK);
    const sensor = getJumlahKartuDisplay(obj.JmlKartu);
    const saldo = formatRupiah(obj.SaldoJMO);
    const itTahun = getTahunIuran(obj.IuranTerakhir);
    const lasik = formatLasik(obj.LasikError);

    return `ABH ${String(jsNum).padStart(3, '0')}
━━━━━━━━━━━━━━━━━━━
📍KAB : ${kab}
📍KEC : ${kec}
📍KEL : ${kel}

💰 SALDO : ${saldo}

🆔 KELAMIN : ${jk} ${tahun}
💳 KPJ : ${kpj}
🔰 SENSOR: ${sensor}
📆 IT : ${itTahun}
🏛 PT : ${pt}

🏆 DPT JMO LASIK ${lasik}`;
};

const buildFullOutputText = (obj, jsNum) => {
    const kab = obj.Kabupaten || '-';
    const kec = obj.Kecamatan || '-';
    const kel = obj.Kelurahan || '-';
    const pt = obj.PT || '-';
    const nama = obj.Nama || '-';
    const nik = obj.NIK || '-';
    const kpj = obj.KPJ || '-';
    const ttl = obj.TTL || '-';
    const jk = formatJK(obj.JK);
    const sensor = getJumlahKartuDisplay(obj.JmlKartu);
    const saldo = formatRupiah(obj.SaldoJMO);
    const itTahun = getTahunIuran(obj.IuranTerakhir);
    const lasik = formatLasik(obj.LasikError);
    const tahun = getTahun(ttl);

    return `ABH ${String(jsNum).padStart(3, '0')}
━━━━━━━━━━━━━━━━━━━
📍KAB : ${kab}
📍KEC : ${kec}
📍KEL : ${kel}

💰 SALDO : ${saldo}

🆔 KELAMIN : ${jk} ${tahun}
💳 KPJ : ${kpj}
🔰 SENSOR: ${sensor}
📆 IT : ${itTahun}
🏛 PT : ${pt}

🏆 DPT JMO LASIK
━━━━━━━━━━━━━━━━━━━
📋 <b>DATA LENGKAP</b>
👤 Nama : ${nama}
🆔 NIK  : ${nik}
📅 TTL  : ${ttl}
💳 KPJ  : ${kpj}
🔰 SENSOR: ${sensor}`;
};

const processExcel = async (filePath) => {
    try {
        console.log(`📊 Processing: ${filePath}`);
        
        const workbook = XLSX.readFile(filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: "", header: 1 });
        
        const headers = jsonData[0] || [];
        console.log('📋 HEADER:', headers);
        
        const findColumn = (name) => {
            const lower = name.toLowerCase();
            for (let i = 0; i < headers.length; i++) {
                const h = String(headers[i] || '').toLowerCase().trim();
                if (h === lower || h.includes(lower)) {
                    return i;
                }
            }
            return -1;
        };
        
        const idxNama = findColumn('nama');
        const idxNIK = findColumn('nik');
        const idxKPJ = findColumn('kpj');
        const idxTglLahir = findColumn('tgl lahir');
        const idxSaldo = findColumn('saldo');
        const idxJmlKartu = findColumn('jml kartu');
        const idxIuran = findColumn('iuran terakhir');
        const idxLasik = findColumn('lasik error');
        const idxKabupaten = findColumn('kabupaten/kota');
        const idxKecamatan = findColumn('kecamatan');
        const idxKelurahan = findColumn('kelurahan');
        const idxKelamin = findColumn('kelamin');
        const idxPT = findColumn('pt');
        const idxHarga = findColumn('harga');
        
        console.log('📍 Index kolom:');
        console.log('  - Nama:', idxNama);
        console.log('  - NIK:', idxNIK);
        console.log('  - KPJ:', idxKPJ);
        console.log('  - Tgl Lahir:', idxTglLahir);
        console.log('  - Kabupaten:', idxKabupaten);
        console.log('  - Harga:', idxHarga);
        
        let rows = [];
        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (!row || row.length === 0) continue;
            const isEmpty = row.every(cell => !cell || String(cell).trim() === '');
            if (isEmpty) continue;
            rows.push(row);
        }
        
        if (!rows.length) throw new Error('Data kosong!');
        
        console.log(`📊 Total rows: ${rows.length}`);
        
        const results = [];
        let jsCounter = 1;
        
        for (const row of rows) {
            const getVal = (idx) => {
                if (idx === -1 || idx >= row.length) return '';
                return String(row[idx] || '').trim();
            };
            
            const hargaRaw = getVal(idxHarga);
            let hargaFinal = 5000;
            
            if (hargaRaw) {
                const cleanHarga = String(hargaRaw).replace(/[^\d]/g, '');
                const parsed = parseInt(cleanHarga);
                if (!isNaN(parsed) && parsed > 0) {
                    hargaFinal = parsed;
                }
            }
            
            console.log(`💰 Harga row ${jsCounter}: "${hargaRaw}" → ${hargaFinal}`);
            
            const obj = {
                Nama: getVal(idxNama) || '-',
                NIK: getVal(idxNIK) || '-',
                Kabupaten: getVal(idxKabupaten) || '-',
                Kecamatan: getVal(idxKecamatan) || '-',
                Kelurahan: getVal(idxKelurahan) || '-',
                PT: getVal(idxPT) || '-',
                KPJ: getVal(idxKPJ) || '-',
                TTL: getVal(idxTglLahir) || '-',
                JK: getVal(idxKelamin) || '-',
                SaldoJMO: parseSaldo(getVal(idxSaldo)),
                JmlKartu: parseInt(getVal(idxJmlKartu)) || 1,
                IuranTerakhir: getVal(idxIuran) || '-',
                LasikError: getVal(idxLasik) || '-',
                Harga: hargaFinal,
                sold: false,
                soldTo: null,
                soldAt: null,
                transactionId: null
            };
            
            const formatted = buildOutputText(obj, jsCounter);
            const fullFormatted = buildFullOutputText(obj, jsCounter);
            results.push({
                ...obj,
                jsNumber: jsCounter,
                formatted: formatted,
                fullFormatted: fullFormatted,
                harga: obj.Harga
            });
            
            jsCounter++;
        }
        
        return {
            success: true,
            data: results,
            total: results.length
        };
        
    } catch (error) {
        console.error('❌ Process error:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
};

const deleteTempFile = (filePath) => {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`🗑️ Deleted: ${filePath}`);
        }
    } catch (error) {}
};

// ============================
// DOWNLOAD FILE
// ============================
const downloadFile = async (fileId) => {
    try {
        const fileInfo = await bot.getFile(fileId);
        const filePath = fileInfo.file_path;
        const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
        
        console.log(`📥 Downloading: ${url}`);
        
        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'arraybuffer',
            timeout: 60000
        });
        
        return response.data;
    } catch (error) {
        console.error('❌ Download error:', error.message);
        throw new Error(`Gagal download file: ${error.message}`);
    }
};

// ============================
// 🔥 FUNGSI KIRIM NOTIFIKASI KE BOT LAIN
// ============================
const sendNotification = async (abhNumber, item, userId, username, transactionId, amount) => {
    if (!NOTIF_ENABLED) {
        console.log('ℹ️ Notifications disabled');
        return;
    }
    
    if (!notifBot) {
        console.log('⚠️ Notification bot not initialized');
        return;
    }
    
    try {
        const message = `
🔔 <b>PEMBELIAN DATA ABH</b>
━━━━━━━━━━━━━━━━━━━━

📌 <b>Data:</b> ABH ${String(abhNumber).padStart(3, '0')}
📍 <b>Kabupaten:</b> ${item.Kabupaten}
📍 <b>Kecamatan:</b> ${item.Kecamatan}
📍 <b>Kelurahan:</b> ${item.Kelurahan}

👤 <b>Pembeli:</b> ${username || 'Unknown'}
🆔 <b>User ID:</b> <code>${userId}</code>
💵 <b>Harga:</b> Rp${formatRupiah(amount)}
🆔 <b>Transaksi:</b> ${transactionId}
📅 <b>Tanggal:</b> ${new Date().toLocaleString('id-ID')}

━━━━━━━━━━━━━━━━━━━━
✅ <b>STATUS: BERHASIL</b>
`;

        if (NOTIF_CHAT_ID) {
            await notifBot.sendMessage(NOTIF_CHAT_ID, message, { parse_mode: "HTML" });
            console.log(`📨 Notification sent to channel: ${NOTIF_CHAT_ID}`);
        }
        
        if (NOTIF_TO_OWNER) {
            await notifBot.sendMessage(OWNER_ID, message, { parse_mode: "HTML" });
            console.log(`📨 Notification sent to owner: ${OWNER_ID}`);
        }
        
    } catch (error) {
        console.error('❌ Failed to send notification:', error.message);
    }
};

// ============================
// 🛒 FUNGSI TROLI BELANJA
// ============================

const addToCart = async (chatId, num) => {
    const data = dataStore.data || [];
    const index = num - 1;
    
    if (index < 0 || index >= data.length) {
        await bot.sendMessage(chatId, '❌ Data tidak ditemukan!');
        return false;
    }
    
    const item = data[index];
    
    if (item.sold) {
        await bot.sendMessage(chatId, `
❌ <b>DATA SUDAH TERJUAL!</b>

ABH ${String(num).padStart(3, '0')}
📍 ${item.Kabupaten} - ${item.Kecamatan}

💡 Data ini sudah dibeli oleh user lain.
        `, { parse_mode: "HTML" });
        return false;
    }
    
    if (!cartSessions[chatId]) {
        cartSessions[chatId] = [];
    }
    
    const existing = cartSessions[chatId].find(c => c.jsNumber === num);
    if (existing) {
        await bot.sendMessage(chatId, `
⚠️ <b>DATA SUDAH DI TROLI!</b>

ABH ${String(num).padStart(3, '0')}
📍 ${item.Kabupaten} - ${item.Kecamatan}

💡 Data ini sudah Anda tambahkan ke TROLI.
📌 Klik "🛒 Lihat TROLI" untuk melihat semua.
        `, { parse_mode: "HTML" });
        return false;
    }
    
    cartSessions[chatId].push({
        jsNumber: num,
        item: item,
        harga: item.harga || 5000,
        formatted: item.formatted,
        fullFormatted: item.fullFormatted
    });
    
    updateCartTotal(chatId);
    
    const totalItems = cartSessions[chatId].length;
    const totalHarga = cartSessions[chatId].reduce((sum, c) => sum + c.harga, 0);
    
    await bot.sendMessage(chatId, `
✅ <b>DATA DITAMBAHKAN KE TROLI!</b>

ABH ${String(num).padStart(3, '0')}
📍 ${item.Kabupaten} - ${item.Kecamatan}
💵 Harga: Rp${formatRupiah(item.harga || 5000)}

━━━━━━━━━━━━━━━━━━━━
🛒 <b>TROLI:</b> ${totalItems} data
💰 <b>Total:</b> Rp${formatRupiah(totalHarga)}

📌 Klik tombol di bawah untuk:
├ ➕ Tambah data lain
├ 🛒 Lihat TROLI
└ 💳 Bayar sekarang
    `, {
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [{ text: "➕ Tambah Lagi", callback_data: "cart_add_more" }],
                [{ text: "🛒 Lihat TROLI", callback_data: "cart_view" }],
                [{ text: "💳 Bayar Sekarang", callback_data: "cart_checkout" }]
            ]
        }
    });
    
    return true;
};

const updateCartTotal = (chatId) => {
    if (!cartSessions[chatId] || cartSessions[chatId].length === 0) {
        delete cartTotalSessions[chatId];
        return;
    }
    const total = cartSessions[chatId].reduce((sum, c) => sum + c.harga, 0);
    cartTotalSessions[chatId] = total;
};

const viewCart = async (chatId) => {
    if (!cartSessions[chatId] || cartSessions[chatId].length === 0) {
        await bot.sendMessage(chatId, `
🛒 <b>TROLI KOSONG!</b>

💡 Cari data dan klik "🛒 Tambah ke TROLI" untuk mulai belanja.
        `, { parse_mode: "HTML" });
        return;
    }
    
    const items = cartSessions[chatId];
    const totalItems = items.length;
    const totalHarga = items.reduce((sum, c) => sum + c.harga, 0);
    
    let text = `
🛒 <b>TROLI BELANJA</b>
━━━━━━━━━━━━━━━━━━━━
📊 <b>Total Data:</b> ${totalItems}
💰 <b>Total Harga:</b> Rp${formatRupiah(totalHarga)}
━━━━━━━━━━━━━━━━━━━━
`;

    for (let i = 0; i < items.length; i++) {
        const c = items[i];
        const num = String(c.jsNumber).padStart(3, '0');
        text += `
${i+1}. ABH ${num} | ${c.item.Kabupaten}
   💵 Rp${formatRupiah(c.harga)}
   📌 <code>${c.item.Nama}</code>
`;
    }

    text += `
━━━━━━━━━━━━━━━━━━━━
📌 <b>Total:</b> Rp${formatRupiah(totalHarga)}
💡 Klik tombol di bawah untuk melanjutkan.
`;

    await bot.sendMessage(chatId, text, {
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [{ text: "➕ Tambah Data", callback_data: "cart_add_more" }],
                [{ text: "🗑️ Kosongkan TROLI", callback_data: "cart_clear" }],
                [{ text: "💳 Bayar Sekarang", callback_data: "cart_checkout" }],
                [{ text: "🔙 KEMBALI KE MENU", callback_data: "back_to_main" }]
            ]
        }
    });
};

const checkoutCart = async (chatId, userId) => {
    if (!cartSessions[chatId] || cartSessions[chatId].length === 0) {
        await bot.sendMessage(chatId, '🛒 TROLI kosong!');
        return;
    }
    
    const items = cartSessions[chatId];
    const totalItems = items.length;
    const totalHarga = items.reduce((sum, c) => sum + c.harga, 0);
    
    const soldItems = [];
    for (const c of items) {
        const dataIndex = dataStore.data.findIndex(d => d.jsNumber === c.jsNumber);
        if (dataIndex !== -1 && dataStore.data[dataIndex].sold === true) {
            soldItems.push(c.jsNumber);
        }
    }
    
    if (soldItems.length > 0) {
        const soldList = soldItems.map(n => `ABH ${String(n).padStart(3, '0')}`).join(', ');
        cartSessions[chatId] = cartSessions[chatId].filter(c => !soldItems.includes(c.jsNumber));
        updateCartTotal(chatId);
        
        await bot.sendMessage(chatId, `
⚠️ <b>BEBERAPA DATA SUDAH TERJUAL!</b>

❌ Data yang sudah terjual:
${soldList}

🛒 Data ini telah dihapus dari TROLI Anda.
        `, { parse_mode: "HTML" });
        
        if (cartSessions[chatId].length === 0) {
            delete cartSessions[chatId];
            delete cartTotalSessions[chatId];
            return;
        }
        
        const remainingItems = cartSessions[chatId];
        const remainingTotal = remainingItems.reduce((sum, c) => sum + c.harga, 0);
        await bot.sendMessage(chatId, `
🛒 <b>DATA TERSISA DI TROLI:</b> ${remainingItems.length} data
💰 <b>Total:</b> Rp${formatRupiah(remainingTotal)}
        `, { parse_mode: "HTML" });
        return;
    }
    
    const description = `Beli ${totalItems} data ABH`;
    const loadingMsg = await bot.sendMessage(chatId, `⏳ <b>Generate QRIS untuk Rp${formatRupiah(totalHarga)}...</b>`, { parse_mode: "HTML" });
    
    try {
        const result = await generateQRIS(totalHarga, description);
        
        if (!result.success) {
            await bot.editMessageText(`
❌ <b>Gagal generate QRIS!</b>
📌 Error: ${result.error}
💡 Silakan coba lagi atau hubungi admin.
👑 Owner: @AbahKonoha
            `, {
                chat_id: chatId,
                message_id: loadingMsg.message_id,
                parse_mode: "HTML"
            });
            return;
        }
        
        paymentSessions[chatId] = {
            abhNumber: 'multiple',
            transactionId: result.transaction_id,
            amount: totalHarga,
            timestamp: Date.now(),
            userId: userId,
            data: items,
            fullData: items.map(c => c.fullFormatted || c.formatted).join('\n\n━━━━━━━━━━━━━━━━━━━\n\n'),
            loadingMsgId: loadingMsg.message_id,
            isCart: true,
            cartItems: items
        };
        
        try {
            await bot.deleteMessage(chatId, loadingMsg.message_id);
        } catch (e) {}
        
        const itemList = items.map(c => `ABH ${String(c.jsNumber).padStart(3, '0')} - ${c.item.Kabupaten}`).join('\n');
        
        if (result.image_data) {
            const buffer = Buffer.from(result.image_data.split(',')[1], 'base64');
            const sentMsg = await bot.sendPhoto(chatId, buffer, {
                caption: `
💰 <b>QRIS PEMBAYARAN</b>

🛒 <b>Total Data:</b> ${items.length}
📌 <b>Data:</b>
${itemList}

💵 <b>Total Harga:</b> Rp${formatRupiah(totalHarga)}
🆔 <b>Transaksi:</b> ${result.transaction_id}

⏳ Scan QRIS di atas untuk membayar.
⏰ QRIS berlaku 15 menit.

📌 Setelah bayar, klik "✅ CEK PEMBAYARAN"
`,
                parse_mode: "HTML",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "✅ CEK PEMBAYARAN", callback_data: `check_payment_${result.transaction_id}` }],
                        [{ text: "❌ BATAL", callback_data: "buy_cancel" }]
                    ]
                }
            });
            if (sentMsg) qrisMessageIds[chatId] = sentMsg.message_id;
        } else if (result.qr_url) {
            const sentMsg = await bot.sendPhoto(chatId, result.qr_url, {
                caption: `
💰 <b>QRIS PEMBAYARAN</b>

🛒 <b>Total Data:</b> ${items.length}
💵 <b>Total Harga:</b> Rp${formatRupiah(totalHarga)}
🆔 <b>Transaksi:</b> ${result.transaction_id}

⏳ Scan QRIS di atas untuk membayar.
⏰ QRIS berlaku 15 menit.

📌 Setelah bayar, klik "✅ CEK PEMBAYARAN"
`,
                parse_mode: "HTML",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "✅ CEK PEMBAYARAN", callback_data: `check_payment_${result.transaction_id}` }],
                        [{ text: "❌ BATAL", callback_data: "buy_cancel" }]
                    ]
                }
            });
            if (sentMsg) qrisMessageIds[chatId] = sentMsg.message_id;
        } else {
            await bot.sendMessage(chatId, `
❌ <b>QRIS tidak tersedia!</b>
Silakan hubungi admin untuk pembelian.
👑 Owner: @AbahKonoha
            `, { parse_mode: "HTML" });
        }
        
    } catch (error) {
        console.error('❌ Checkout error:', error.message);
        await bot.sendMessage(chatId, `❌ <b>Error checkout!</b>\n\n${error.message}`, { parse_mode: "HTML" });
    }
};

const clearCart = async (chatId) => {
    delete cartSessions[chatId];
    delete cartTotalSessions[chatId];
    await bot.sendMessage(chatId, `
🗑️ <b>TROLI DIKOSONGKAN!</b>
🛒 TROLI belanja Anda telah dikosongkan.
💡 Cari data baru untuk mulai belanja.
    `, { parse_mode: "HTML" });
};

// ============================
// 🔍 FUNGSI SEARCH DENGAN PAGINATION + TOMBOL ANGKA
// ============================

const searchByKabupaten = async (chatId, keyword, page = 0) => {
    const data = dataStore.data || [];
    
    if (data.length === 0) {
        await bot.sendMessage(chatId, '📋 Belum ada data. Upload file Excel dulu!');
        return;
    }
    
    const searchLower = keyword.toLowerCase().trim();
    
    // ===== ANIMASI LOADING =====
    const loadingMsg = await bot.sendMessage(chatId, '⏳ <b>Mencari data</b> 🔍', { parse_mode: "HTML" });
    
    // Animasi loading berkedip (3 kali)
    const loadingFrames = [
        '⏳ <b>Mencari data</b> 🔍',
        '⏳ <b>Mencari data.</b> 🔍',
        '⏳ <b>Mencari data..</b> 🔍',
        '⏳ <b>Mencari data...</b> 🔍'
    ];
    
    for (let i = 0; i < 3; i++) {
        for (const frame of loadingFrames) {
            try {
                await bot.editMessageText(frame, {
                    chat_id: chatId,
                    message_id: loadingMsg.message_id,
                    parse_mode: "HTML"
                });
                await new Promise(r => setTimeout(r, 150));
            } catch (e) {}
        }
    }
    
    // Cari semua data yang cocok (termasuk yang sudah sold)
    const allFound = data.filter(item => 
        item.Kabupaten.toLowerCase().includes(searchLower) ||
        item.Kecamatan.toLowerCase().includes(searchLower) ||
        item.Kelurahan.toLowerCase().includes(searchLower)
    );
    
    // Data yang tersedia (belum sold)
    const availableResults = allFound.filter(item => !item.sold);
    
    // Hapus pesan loading
    try {
        await bot.deleteMessage(chatId, loadingMsg.message_id);
    } catch (e) {}
    
    if (availableResults.length === 0) {
        if (allFound.length > 0) {
            await bot.sendMessage(chatId, `
❌ <b>DATA SUDAH HABIS!</b>
🔍 Keyword: "${keyword}"
📊 Ditemukan ${allFound.length} data, tapi SEMUA sudah terjual.
💡 Cari daerah lain yang masih tersedia.
            `, { parse_mode: "HTML" });
        } else {
            await bot.sendMessage(chatId, `
❌ <b>TIDAK DITEMUKAN!</b>
🔍 Keyword: "${keyword}"
💡 Coba gunakan kata kunci lain.
📌 Contoh: Aceh, Medan, Jakarta, Surabaya
        `, { parse_mode: "HTML" });
        }
        return;
    }
    
    // Simpan session pencarian
    searchSessions[chatId] = {
        keyword: keyword,
        results: availableResults,
        total: availableResults.length,
        page: page
    };
    
    // Tampilkan data sesuai halaman
    await renderSearchPage(chatId, page);
};

const renderSearchPage = async (chatId, page) => {
    const session = searchSessions[chatId];
    if (!session) {
        await bot.sendMessage(chatId, '❌ Session pencarian habis. Silakan cari ulang.');
        return;
    }
    
    const { results, total, keyword } = session;
    const itemsPerPage = 5;
    const totalPages = Math.ceil(total / itemsPerPage);
    const startIndex = page * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, total);
    const pageResults = results.slice(startIndex, endIndex);
    
    if (pageResults.length === 0) {
        await bot.sendMessage(chatId, '❌ Tidak ada data di halaman ini.');
        return;
    }
    
    // Bangun pesan
    let text = `
🔍 <b>HASIL PENCARIAN: ${keyword.toUpperCase()}</b>
━━━━━━━━━━━━━━━━━━━━
📊 <b>Total ditemukan:</b> ${total} data tersedia
📄 <b>Halaman:</b> ${page + 1} dari ${totalPages}
📌 <b>Menampilkan:</b> ${startIndex + 1} - ${endIndex} dari ${total}
━━━━━━━━━━━━━━━━━━━━

`;
    
    // Tampilkan data dalam format compact
    for (let i = 0; i < pageResults.length; i++) {
        const item = pageResults[i];
        const num = String(item.jsNumber).padStart(3, '0');
        const harga = item.harga || 5000;
        const saldo = formatRupiah(item.SaldoJMO || 0);
        
        text += `
<b>${i + 1}. ABH ${num}</b>
📍 ${item.Kabupaten} - ${item.Kecamatan}
👤 ${item.Nama || '-'}
💰 SALDO : ${saldo}
💵 HARGA DATA : Rp${formatRupiah(harga)}
`;
    }
    
    text += `
━━━━━━━━━━━━━━━━━━━━
💡 Klik tombol angka di bawah untuk lihat detail
`;
    
    // Buat tombol navigasi + tombol angka
    const keyboard = [];
    
    // Tombol angka untuk setiap data di halaman ini
    const numberButtons = [];
    for (const item of pageResults) {
        numberButtons.push({ 
            text: `${item.jsNumber}`, 
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
        navButtons.push({ text: "◀️ Sebelumnya", callback_data: `search_page_${page - 1}` });
    }
    if (page < totalPages - 1) {
        navButtons.push({ text: "Berikutnya ▶️", callback_data: `search_page_${page + 1}` });
    }
    if (navButtons.length > 0) {
        keyboard.push(navButtons);
    }
    
    // Tombol kembali
    keyboard.push([{ text: "🔙 Kembali ke Menu", callback_data: "back_to_main" }]);
    
    // Kirim pesan
    await bot.sendMessage(chatId, text, {
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: keyboard
        }
    });
};

// ============================
// FUNGSI SHOW DATA DETAIL (RINGKAS - PAKAI formatted, BUKAN fullFormatted)
// ============================

const showDataDetail = async (chatId, num, fromSearch = false) => {
    const data = dataStore.data || [];
    const index = num - 1;
    
    if (index < 0 || index >= data.length) {
        await bot.sendMessage(chatId, `❌ Data ABH ${String(num).padStart(3, '0')} tidak ditemukan!`);
        return;
    }
    
    const item = data[index];
    const harga = item.harga || 5000; // HARGA JUAL
    
    if (item.sold) {
        await bot.sendMessage(chatId, `
❌ <b>DATA SUDAH TERJUAL!</b>
ABH ${String(num).padStart(3, '0')}
📍 ${item.Kabupaten} - ${item.Kecamatan}
💡 Data ini sudah dibeli oleh user lain.
        `, { parse_mode: "HTML" });
        return;
    }
    
    // ===== PAKAI formatted (RINGKAS), BUKAN fullFormatted =====
    let caption = item.formatted;
    caption += `

━━━━━━━━━━━━━━━━━━━
💵 <b>HARGA JUAL: Rp${formatRupiah(harga)}</b>
`;

    const replyMarkup = {
        inline_keyboard: [
            [{ text: `🛒 TROLI`, callback_data: `cart_add_${num}` }],
            [{ text: `💰 BELI Rp${formatRupiah(harga)}`, callback_data: `buy_confirm_${num}` }]
        ]
    };
    
    // Jika dari search, tambahkan tombol kembali
    if (fromSearch || searchSessions[chatId]) {
        replyMarkup.inline_keyboard.push([{ text: "🔙 KEMBALI KE HASIL", callback_data: "back_to_search" }]);
    } else {
        replyMarkup.inline_keyboard.push([{ text: "🔙 KEMBALI KE MENU", callback_data: "back_to_main" }]);
    }

    await bot.sendMessage(chatId, caption, {
        parse_mode: "HTML",
        reply_markup: replyMarkup
    });
};

// ============================
// 🔥 GENERATE PAYMENT QRIS
// ============================
const generatePaymentQRIS = async (chatId, userId, num) => {
    const data = dataStore.data || [];
    const index = num - 1;
    
    if (index < 0 || index >= data.length) {
        await bot.sendMessage(chatId, '❌ Data tidak ditemukan!');
        return;
    }
    
    const item = data[index];
    
    if (item.sold) {
        await bot.sendMessage(chatId, `
❌ <b>DATA SUDAH TERJUAL!</b>
ABH ${String(num).padStart(3, '0')}
📍 ${item.Kabupaten} - ${item.Kecamatan}
💡 Data ini sudah dibeli oleh user lain.
💡 Cari data lain yang masih tersedia.
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
    
    const harga = item.harga || 5000;
    const description = `Beli Data ABH ${String(num).padStart(3, '0')} - ${item.Kabupaten}`;
    
    const loadingMsg = await bot.sendMessage(chatId, `⏳ <b>Generate QRIS untuk Rp${formatRupiah(harga)}...</b>`, { parse_mode: "HTML" });
    
    try {
        const result = await generateQRIS(harga, description);
        
        if (!result.success) {
            await bot.editMessageText(`
❌ <b>Gagal generate QRIS!</b>
📌 Error: ${result.error}
💡 Silakan coba lagi atau hubungi admin.
👑 Owner: @AbahKonoha
            `, {
                chat_id: chatId,
                message_id: loadingMsg.message_id,
                parse_mode: "HTML"
            });
            return;
        }
        
        paymentSessions[chatId] = {
            abhNumber: num,
            transactionId: result.transaction_id,
            amount: harga,
            timestamp: Date.now(),
            userId: userId,
            data: item,
            fullData: item.fullFormatted || item.formatted,
            loadingMsgId: loadingMsg.message_id
        };
        
        try {
            await bot.deleteMessage(chatId, loadingMsg.message_id);
        } catch (e) {}
        
        let sentMsg;
        if (result.image_data) {
            const buffer = Buffer.from(result.image_data.split(',')[1], 'base64');
            sentMsg = await bot.sendPhoto(chatId, buffer, {
                caption: `
💰 <b>QRIS PEMBAYARAN</b>
📌 Data: ABH ${String(num).padStart(3, '0')}
📍 ${item.Kabupaten} - ${item.Kecamatan}
💵 Harga: Rp${formatRupiah(harga)}
🆔 Transaksi: ${result.transaction_id}
⏳ Scan QRIS di atas untuk membayar.
⏰ QRIS berlaku 15 menit.
📌 Setelah bayar, klik "✅ CEK PEMBAYARAN"
`,
                parse_mode: "HTML",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "✅ CEK PEMBAYARAN", callback_data: `check_payment_${result.transaction_id}` }],
                        [{ text: "❌ BATAL", callback_data: "buy_cancel" }]
                    ]
                }
            });
        } else if (result.qr_url) {
            sentMsg = await bot.sendPhoto(chatId, result.qr_url, {
                caption: `
💰 <b>QRIS PEMBAYARAN</b>
📌 Data: ABH ${String(num).padStart(3, '0')}
📍 ${item.Kabupaten} - ${item.Kecamatan}
💵 Harga: Rp${formatRupiah(harga)}
🆔 Transaksi: ${result.transaction_id}
⏳ Scan QRIS di atas untuk membayar.
⏰ QRIS berlaku 15 menit.
📌 Setelah bayar, klik "✅ CEK PEMBAYARAN"
`,
                parse_mode: "HTML",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "✅ CEK PEMBAYARAN", callback_data: `check_payment_${result.transaction_id}` }],
                        [{ text: "❌ BATAL", callback_data: "buy_cancel" }]
                    ]
                }
            });
        } else {
            sentMsg = await bot.sendMessage(chatId, `
❌ <b>QRIS tidak tersedia!</b>
Silakan hubungi admin untuk pembelian.
👑 Owner: @AbahKonoha
            `, { parse_mode: "HTML" });
        }
        
        if (sentMsg) {
            qrisMessageIds[chatId] = sentMsg.message_id;
        }
        
    } catch (error) {
        console.error('❌ Payment error:', error.message);
        await bot.sendMessage(chatId, `❌ <b>Error payment!</b>\n\n${error.message}`, { parse_mode: "HTML" });
    }
};

// ============================
// 🔥 CEK PAYMENT STATUS
// ============================
const checkPaymentStatus = async (chatId, userId, transactionId) => {
    const session = paymentSessions[chatId];
    if (!session) {
        await bot.sendMessage(chatId, '❌ Sesi tidak ditemukan! Silakan beli ulang.');
        return;
    }
    
    const statusMsg = await bot.sendMessage(chatId, '⏳ <b>Mengecek status pembayaran...</b>', { parse_mode: "HTML" });
    
    try {
        const result = await cekStatusDualWithRetry(
            transactionId,
            session.amount,
            'AUTOGOPAY',
            session.timestamp,
            5
        );
        
        if (result.matched || result.status === 'settlement' || result.status === 'success' || result.status === 'paid') {
            if (qrisMessageIds[chatId]) {
                try {
                    await bot.deleteMessage(chatId, qrisMessageIds[chatId]);
                    console.log(`🗑️ QRIS message deleted for ${chatId}`);
                } catch (e) {}
                delete qrisMessageIds[chatId];
            }
            
            try {
                await bot.deleteMessage(chatId, statusMsg.message_id);
            } catch (e) {}
            
            const username = users[userId]?.username || 'Unknown';
            
            if (session.isCart && session.cartItems) {
                const items = session.cartItems;
                
                for (const c of items) {
                    const dataIndex = dataStore.data.findIndex(d => d.jsNumber === c.jsNumber);
                    if (dataIndex !== -1) {
                        dataStore.data[dataIndex].sold = true;
                        dataStore.data[dataIndex].soldTo = userId;
                        dataStore.data[dataIndex].soldAt = new Date().toISOString();
                        dataStore.data[dataIndex].transactionId = transactionId;
                        dataStore.data[dataIndex].buyerUsername = username;
                    }
                }
                saveJSON(DATA_FILE, dataStore);
                
                // Kirim FULL DATA setelah bayar sukses
                for (const c of items) {
                    await bot.sendMessage(chatId, c.fullFormatted || c.formatted, { parse_mode: "HTML" });
                }
                
                delete cartSessions[chatId];
                delete cartTotalSessions[chatId];
                
                await bot.sendMessage(chatId, `
✅ <b>PEMBAYARAN BERHASIL!</b>
━━━━━━━━━━━━━━━━━━━━

🛒 <b>Total Data:</b> ${items.length} data
💵 <b>Total Harga:</b> Rp${formatRupiah(session.amount)}
🆔 <b>Transaksi:</b> ${transactionId}
📅 <b>Tanggal:</b> ${new Date().toLocaleString('id-ID')}

📌 Semua data telah disimpan di riwayat pembelian Anda.
📌 Data dapat diakses melalui menu "👤 Akun" → "📜 Riwayat Beli"

━━━━━━━━━━━━━━━━━━━━
🙏 Terima kasih telah membeli data ABH!
👑 Owner: @AbahKonoha
`, { 
                    parse_mode: "HTML",
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "🔙 KEMBALI KE MENU", callback_data: "back_to_main" }]
                        ]
                    }
                });
                
                if (!users[userId].purchases) {
                    users[userId].purchases = [];
                }
                for (const c of items) {
                    users[userId].purchases.push({
                        abhNumber: c.jsNumber,
                        data: c.item,
                        fullData: c.fullFormatted || c.formatted,
                        purchasedAt: new Date().toISOString(),
                        price: c.harga,
                        transactionId: transactionId
                    });
                }
                saveJSON(USERS_FILE, users);
                
                for (const c of items) {
                    await sendNotification(
                        c.jsNumber,
                        c.item,
                        userId,
                        username,
                        transactionId,
                        c.harga
                    );
                }
                
                delete paymentSessions[chatId];
                return;
                
            } else {
                const item = session.data;
                const fullData = session.fullData || item.formatted;
                const abhNumber = session.abhNumber;
                
                const dataIndex = dataStore.data.findIndex(d => d.jsNumber === abhNumber);
                if (dataIndex !== -1) {
                    dataStore.data[dataIndex].sold = true;
                    dataStore.data[dataIndex].soldTo = userId;
                    dataStore.data[dataIndex].soldAt = new Date().toISOString();
                    dataStore.data[dataIndex].transactionId = transactionId;
                    dataStore.data[dataIndex].buyerUsername = username;
                    saveJSON(DATA_FILE, dataStore);
                    console.log(`✅ Data ABH ${String(abhNumber).padStart(3, '0')} marked as SOLD`);
                }
                
                await sendNotification(
                    abhNumber,
                    item,
                    userId,
                    username,
                    transactionId,
                    session.amount
                );
                
                // Kirim FULL DATA setelah bayar sukses
                await bot.sendMessage(chatId, fullData, { parse_mode: "HTML" });
                
                await bot.sendMessage(chatId, `
✅ <b>PEMBAYARAN BERHASIL!</b>
━━━━━━━━━━━━━━━━━━━━

💵 <b>HARGA:</b> Rp${formatRupiah(session.amount)}
🆔 <b>Transaksi:</b> ${transactionId}
📅 <b>Tanggal:</b> ${new Date().toLocaleString('id-ID')}

📌 Data telah disimpan di riwayat pembelian Anda.
📌 Data dapat diakses kembali melalui menu "👤 Akun" → "📜 Riwayat Beli"

━━━━━━━━━━━━━━━━━━━━
🙏 Terima kasih telah membeli data ABH!
👑 Owner: @AbahKonoha
`, { 
                    parse_mode: "HTML",
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "🔙 KEMBALI KE MENU", callback_data: "back_to_main" }]
                        ]
                    }
                });
                
                if (!users[userId].purchases) {
                    users[userId].purchases = [];
                }
                users[userId].purchases.push({
                    abhNumber: session.abhNumber,
                    data: item,
                    fullData: fullData,
                    purchasedAt: new Date().toISOString(),
                    price: session.amount,
                    transactionId: transactionId
                });
                saveJSON(USERS_FILE, users);
                
                delete paymentSessions[chatId];
                return;
            }
            
        } else if (result.status === 'pending') {
            await bot.editMessageText(`
⏳ <b>PEMBAYARAN BELUM DITERIMA</b>
Status: PENDING
🆔 Transaksi: ${transactionId}
Silakan scan QRIS dan lakukan pembayaran.
Klik "CEK PEMBAYARAN" lagi setelah bayar.
`, {
                chat_id: chatId,
                message_id: statusMsg.message_id,
                parse_mode: "HTML",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "✅ CEK LAGI", callback_data: `check_payment_${transactionId}` }],
                        [{ text: "❌ BATAL", callback_data: "buy_cancel" }]
                    ]
                }
            });
        } else {
            await bot.editMessageText(`
❌ <b>PEMBAYARAN GAGAL</b>
Status: ${result.status || 'error'}
${result.error ? `Error: ${result.error}` : ''}
Silakan coba lagi atau hubungi admin.
👑 Owner: @AbahKonoha
`, {
                chat_id: chatId,
                message_id: statusMsg.message_id,
                parse_mode: "HTML"
            });
            delete paymentSessions[chatId];
            delete qrisMessageIds[chatId];
        }
        
    } catch (error) {
        console.error('❌ Check payment error:', error.message);
        await bot.editMessageText(`❌ <b>Error cek payment!</b>\n\n${error.message}`, {
            chat_id: chatId,
            message_id: statusMsg.message_id,
            parse_mode: "HTML"
        });
    }
};

// ============================
// HANDLE UPLOAD DATA
// ============================
const handleUploadData = async (chatId, doc) => {
    try {
        const statusMsg = await bot.sendMessage(chatId, '⏳ <b>Uploading & Processing file...</b>', { parse_mode: "HTML" });
        
        console.log(`📁 Processing: ${doc.file_name} (${doc.file_size} bytes)`);
        
        const fileBuffer = await downloadFile(doc.file_id);
        const tempPath = path.join(TEMP_DIR, `data_${Date.now()}.xlsx`);
        fs.writeFileSync(tempPath, fileBuffer);
        console.log(`💾 Saved: ${tempPath}`);
        
        const result = await processExcel(tempPath);
        deleteTempFile(tempPath);
        
        if (!result.success) {
            await bot.editMessageText(`❌ <b>Gagal proses file!</b>\n\nError: ${result.error}`, {
                chat_id: chatId,
                message_id: statusMsg.message_id,
                parse_mode: "HTML"
            });
            return;
        }
        
        dataStore = {
            data: result.data,
            total: result.total,
            uploadedAt: new Date().toISOString(),
            fileName: doc.file_name
        };
        saveJSON(DATA_FILE, dataStore);
        
        let summary = `✅ <b>DATA BERHASIL DIUPLOAD!</b>\n\n`;
        summary += `📄 File: ${doc.file_name}\n`;
        summary += `📊 Total Data: ${result.total}\n\n`;
        summary += `📌 Gunakan "🔍 Cari Kabupaten" untuk mencari data`;
        
        await bot.editMessageText(summary, {
            chat_id: chatId,
            message_id: statusMsg.message_id,
            parse_mode: "HTML"
        });
        
        console.log(`✅ Upload complete: ${result.total} data`);
        
    } catch (error) {
        console.error('❌ Upload error:', error.message);
        await bot.sendMessage(chatId, `❌ <b>Error upload!</b>\n\n${error.message}`, { parse_mode: "HTML" });
    }
};

// ============================
// HANDLE UPDATE DATA
// ============================
const handleUpdateData = async (chatId, doc) => {
    try {
        const statusMsg = await bot.sendMessage(chatId, '⏳ <b>Updating data...</b>', { parse_mode: "HTML" });
        
        console.log(`🔄 Updating: ${doc.file_name}`);
        
        const fileBuffer = await downloadFile(doc.file_id);
        const tempPath = path.join(TEMP_DIR, `update_${Date.now()}.xlsx`);
        fs.writeFileSync(tempPath, fileBuffer);
        
        const result = await processExcel(tempPath);
        deleteTempFile(tempPath);
        
        if (!result.success) {
            await bot.editMessageText(`❌ <b>Gagal update!</b>\n\nError: ${result.error}`, {
                chat_id: chatId,
                message_id: statusMsg.message_id,
                parse_mode: "HTML"
            });
            return;
        }
        
        const oldData = dataStore;
        const backupFile = `./backup_data_${Date.now()}.json`;
        fs.writeFileSync(backupFile, JSON.stringify(oldData, null, 2));
        
        dataStore = {
            data: result.data,
            total: result.total,
            updatedAt: new Date().toISOString(),
            fileName: doc.file_name,
            previousFile: oldData?.fileName || '-'
        };
        saveJSON(DATA_FILE, dataStore);
        
        let summary = `✅ <b>DATA BERHASIL DIUPDATE!</b>\n\n`;
        summary += `📄 File Baru: ${doc.file_name}\n`;
        summary += `📊 Total Data Baru: ${result.total}\n`;
        summary += `📄 File Lama: ${oldData?.fileName || '-'}\n`;
        summary += `📊 Data Lama: ${oldData?.data?.length || 0}\n\n`;
        summary += `📌 Backup data lama: ${backupFile}`;
        
        await bot.editMessageText(summary, {
            chat_id: chatId,
            message_id: statusMsg.message_id,
            parse_mode: "HTML"
        });
        
        console.log(`✅ Update complete: ${result.total} data`);
        
    } catch (error) {
        console.error('❌ Update error:', error.message);
        await bot.sendMessage(chatId, `❌ <b>Error update!</b>\n\n${error.message}`, { parse_mode: "HTML" });
    }
};

// ============================
// HANDLE BROADCAST
// ============================
const handleBroadcast = async (chatId, text) => {
    try {
        const userList = Object.keys(users);
        let success = 0;
        let fail = 0;
        
        const statusMsg = await bot.sendMessage(chatId, `⏳ Mengirim broadcast ke ${userList.length} user...`, { parse_mode: "HTML" });
        
        for (const uid of userList) {
            try {
                await bot.sendMessage(parseInt(uid), `
📢 <b>PENGUMUMAN DARI OWNER</b>

${text}

━━━━━━━━━━━━━━━━━━━━
📌 Bot ABH Data Store
👑 Owner: @AbahKonoha
                `, { parse_mode: "HTML" });
                success++;
            } catch (err) {
                fail++;
            }
            await new Promise(r => setTimeout(r, 100));
        }
        
        await bot.editMessageText(`
✅ <b>BROADCAST SELESAI!</b>
📊 Terkirim: ${success} user
❌ Gagal: ${fail} user
👥 Total: ${userList.length} user
        `, {
            chat_id: chatId,
            message_id: statusMsg.message_id,
            parse_mode: "HTML"
        });
        
    } catch (error) {
        await bot.sendMessage(chatId, `❌ <b>Error broadcast!</b>\n\n${error.message}`, { parse_mode: "HTML" });
    }
};

// ============================
// SHOW DATA LIST (OWNER ONLY)
// ============================
const showDataList = async (chatId) => {
    const data = dataStore.data || [];
    
    if (data.length === 0) {
        await bot.sendMessage(chatId, '📋 Belum ada data. Upload file Excel dulu!');
        return;
    }
    
    const totalData = data.length;
    const soldData = data.filter(d => d.sold).length;
    const availableData = totalData - soldData;
    
    let text = `📋 <b>DAFTAR DATA ABH</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    text += `📊 Total: ${totalData} data\n`;
    text += `✅ Tersedia: ${availableData}\n`;
    text += `❌ Terjual: ${soldData}\n\n`;
    
    const show = data.slice(0, 20);
    for (const item of show) {
        const status = item.sold ? '❌ SOLD' : '✅ AVAILABLE';
        text += `├ ABH ${String(item.jsNumber).padStart(3, '0')} | ${item.Kabupaten} | ${status}\n`;
    }
    
    if (data.length > 20) {
        text += `└ ... dan ${data.length - 20} data lainnya\n`;
    }
    
    text += `\n💡 Ketik nomor ABH untuk beli data.`;
    text += `\nContoh: <code>7</code> untuk beli data ABH 007`;
    
    buySessions[chatId] = { waitingNumber: true };
    
    await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
};

// ============================
// HANDLE BUY DATA
// ============================
const handleBuyData = async (chatId, num) => {
    const data = dataStore.data || [];
    
    if (data.length === 0) {
        await bot.sendMessage(chatId, '❌ Belum ada data!');
        delete buySessions[chatId];
        return;
    }
    
    const index = num - 1;
    if (index < 0 || index >= data.length) {
        await bot.sendMessage(chatId, `❌ Data ABH ${String(num).padStart(3, '0')} tidak ditemukan!`);
        delete buySessions[chatId];
        return;
    }
    
    const item = data[index];
    
    if (item.sold) {
        await bot.sendMessage(chatId, `
❌ <b>DATA SUDAH TERJUAL!</b>
ABH ${String(num).padStart(3, '0')}
📍 ${item.Kabupaten} - ${item.Kecamatan}
💡 Data ini sudah dibeli oleh user lain.
💡 Cari data lain yang masih tersedia.
        `, { 
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🔙 KEMBALI KE MENU", callback_data: "back_to_main" }]
                ]
            }
        });
        delete buySessions[chatId];
        return;
    }
    
    const harga = item.harga || 5000;
    
    const caption = `
${item.formatted}

━━━━━━━━━━━━━━━━━━━
💵 <b>HARGA JUAL: Rp${formatRupiah(harga)}</b>
`;

    await bot.sendMessage(chatId, caption, {
    parse_mode: "HTML",
    reply_markup: {
        inline_keyboard: [
            [{ text: `🛒 TAMBAH TROLI`, callback_data: `cart_add_${num}` }],
            [{ text: `💰 BELI Rp${formatRupiah(harga)}`, callback_data: `buy_confirm_${num}` }]
        ]
    }
});

delete buySessions[chatId];
};

// ============================
// BOT MESSAGE HANDLER
// ============================
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text || '';
    const username = msg.from.username || 'no_username';
    const firstName = msg.from.first_name || 'User';
    
    try {
        const broadcastHandled = await broadcast.handleBroadcastMessage(bot, msg);
        if (broadcastHandled) {
            console.log(`✅ [BROADCAST] Pesan ditangani oleh broadcast handler`);
            return;
        }
    } catch (err) {
        console.log(`❌ [BROADCAST] Error: ${err.message}`);
    }

    if (msg.document) {
        const doc = msg.document;
        const ext = path.extname(doc.file_name || '').toLowerCase();
        
        console.log(`📁 [DOCUMENT] ${doc.file_name} dari ${userId}`);
        
        if (userId !== OWNER_ID) {
            await bot.sendMessage(chatId, '❌ <b>Khusus Owner!</b>', { parse_mode: "HTML" });
            return;
        }
        
        if (ext !== '.xlsx' && ext !== '.xls') {
            await bot.sendMessage(chatId, `❌ File harus .xlsx atau .xls\n\nFile Anda: ${doc.file_name}`, { parse_mode: "HTML" });
            return;
        }
        
        if (buySessions[chatId] && buySessions[chatId].mode === 'update') {
            await handleUpdateData(chatId, doc);
            delete buySessions[chatId];
        } else {
            await handleUploadData(chatId, doc);
        }
        return;
    }

    // ===== COMMAND /nomor =====
    if (text.startsWith('/')) {
        const num = parseInt(text.replace('/', '').trim());
        if (!isNaN(num) && num > 0) {
            await showDataDetail(chatId, num, true);
            return;
        }
    }

    if (text === '/start' || text === '/menu') {
        if (processingUsers.has(chatId)) {
            console.log(`⏳ [DOUBLE] User ${chatId} sedang diproses, skip...`);
            return;
        }
        processingUsers.add(chatId);
        
        try {
            if (!users[userId]) {
                users[userId] = {
                    id: userId,
                    username: username,
                    firstName: firstName,
                    date: new Date().toISOString()
                };
                saveJSON(USERS_FILE, users);
            }
            
            try {
                await bot.sendMessage(chatId, '🔄', {
                    reply_markup: { remove_keyboard: true }
                });
            } catch (e) {}
            
            await new Promise(resolve => setTimeout(resolve, 300));
            await showMenu(bot, chatId, users);
            
        } catch (err) {
            console.log(`❌ Error:`, err.message);
        } finally {
            setTimeout(() => {
                processingUsers.delete(chatId);
            }, 3000);
        }
        return;
    }

    if (!users[userId] && userId !== OWNER_ID) {
        users[userId] = {
            id: userId,
            username: username,
            firstName: firstName,
            date: new Date().toISOString()
        };
        saveJSON(USERS_FILE, users);
    }

    if (text === '📋 Menu') {
        if (processingUsers.has(chatId)) return;
        processingUsers.add(chatId);
        try {
            await showMenu(bot, chatId, users);
        } finally {
            setTimeout(() => processingUsers.delete(chatId), 2000);
        }
        return;
    }

    if (text === '👤 Akun') {
        await showAkun(bot, chatId, userId, users);
        return;
    }

    if (text === '❓ Bantuan') {
        await showBantuan(bot, chatId);
        return;
    }
    
    if (text === '📞 Hubungi Owner') {
        await showHubungiOwner(bot, chatId);
        return;
    }

    if (text === '♲ Refresh') {
        users = loadJSON(USERS_FILE);
        await bot.sendMessage(chatId, "✅ Status direfresh!");
        setTimeout(() => showMenu(bot, chatId, users), 1000);
        return;
    }

    if (text === '🔍 Cari Data') {
    await bot.sendMessage(chatId, `
🔍 <b>CARI DATA BERDASARKAN DAERAH</b>
Masukkan nama Kabupaten/Kota yang ingin dicari.
📌 Contoh:
├ Pesisir Selatan
├ Aceh Tengah
├ Medan
├ Jakarta
└ Surabaya
💡 Bisa juga cari berdasarkan Kecamatan atau Kelurahan.
📌 Ketik nama daerah sekarang.
    `, {
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [{ text: "❌ BATAL", callback_data: "cancel_search" }]
            ]
        }
    });
    searchSessions[chatId] = { waitingSearch: true };
    return;
}

    if (searchSessions[chatId] && searchSessions[chatId].waitingSearch) {
        const keyword = text.trim();
        if (keyword.length < 2) {
            await bot.sendMessage(chatId, '❌ Minimal 2 karakter!');
            return;
        }
        delete searchSessions[chatId].waitingSearch;
        await searchByKabupaten(chatId, keyword, 0);
        return;
    }

    if (text === '📊 List Data ABH') {
        if (userId !== OWNER_ID) {
            await bot.sendMessage(chatId, '❌ <b>Khusus Owner!</b>', { parse_mode: "HTML" });
            return;
        }
        await showDataList(chatId);
        return;
    }

    if (userId === OWNER_ID) {
        if (text === '📁 Upload Data') {
            await bot.sendMessage(chatId, `
📁 <b>UPLOAD DATA BARU</b>
Kirim file Excel (.xlsx) ke chat ini.
📌 File akan MENIMPA data yang lama.
📌 Pastikan format file sudah benar.
📋 Format yang diharapkan:
├ Nama | NIK | KPJ | Tgl Lahir
├ Saldo | Jml Kartu | Iuran Terakhir
├ Lasik Error | Kabupaten/Kota
├ Kecamatan | Kelurahan | Kelamin | PT | Harga
📌 Kirim file Excel sekarang.
            `, { parse_mode: "HTML" });
            return;
        }
        
        if (text === '🔄 Update Data') {
            buySessions[chatId] = { mode: 'update' };
            await bot.sendMessage(chatId, `
🔄 <b>UPDATE DATA</b>
Kirim file Excel (.xlsx) dengan data terbaru.
📌 Data LAMA akan di-backup terlebih dahulu.
📌 Data BARU akan menggantikan data lama.
⚠️ Pastikan file sudah benar sebelum mengirim!
📌 Kirim file Excel sekarang.
            `, { parse_mode: "HTML" });
            return;
        }
        
        if (text === '📢 Broadcast') {
            await broadcast.showBroadcastMenu(bot, chatId, userId);
            return;
        }
        
        if (text === '📊 Statistik') {
            const totalUsers = Object.keys(users).length;
            const totalData = dataStore.data?.length || 0;
            const soldData = dataStore.data?.filter(d => d.sold).length || 0;
            const availableData = totalData - soldData;
            const lastUpload = dataStore.uploadedAt || '-';
            const fileName = dataStore.fileName || '-';
            
            await bot.sendMessage(chatId, `
📊 <b>STATISTIK BOT</b>
━━━━━━━━━━━━━━━━━━━━
👥 <b>Total User:</b> ${totalUsers}
📄 <b>Total Data ABH:</b> ${totalData}
✅ <b>Tersedia:</b> ${availableData}
❌ <b>Terjual:</b> ${soldData}
📁 <b>File Terakhir:</b> ${fileName}
📅 <b>Upload Terakhir:</b> ${lastUpload}
━━━━━━━━━━━━━━━━━━━━
👑 <b>Owner ID:</b> ${OWNER_ID}
💾 <b>Memory:</b> ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB
            `, { parse_mode: "HTML" });
            return;
        }
    }

    if (buySessions[chatId] && buySessions[chatId].waitingNumber) {
        const num = parseInt(text.trim());
        if (isNaN(num) || num < 1) {
            await bot.sendMessage(chatId, '❌ Masukkan nomor ABH yang valid! (contoh: 7)');
            return;
        }
        await handleBuyData(chatId, num);
        return;
    }

    if (userId === OWNER_ID && text.startsWith('/broadcast ')) {
        const broadcastText = text.replace('/broadcast ', '');
        if (broadcastText.trim().length < 3) {
            await bot.sendMessage(chatId, '❌ Pesan terlalu pendek! Minimal 3 karakter.');
            return;
        }
        await handleBroadcast(chatId, broadcastText);
        return;
    }
});

// ============================
// CALLBACK QUERY HANDLER
// ============================
bot.on("callback_query", async (q) => {
    const data = q.data;
    const chatId = q.message.chat.id;
    const userId = q.from.id;

    try {
        await bot.answerCallbackQuery(q.id);
    } catch (err) {}
    
    // ===== 🔥 1. BACK TO MAIN =====
    if (data === "back_to_main") {
        console.log(`🔙 [BACK] User ${userId} kembali ke menu`);
        try {
            try {
                await bot.deleteMessage(chatId, q.message.message_id);
            } catch (e) {
                console.log('Gagal hapus pesan:', e.message);
            }
            await showMenu(bot, chatId, users);
        } catch (err) {
            console.log(`❌ Error back_to_main: ${err.message}`);
            await bot.sendMessage(chatId, "❌ Gagal kembali ke menu. Ketik /menu");
        }
        return;
    }
    
    // ===== 🔥 2. BACK TO SEARCH =====
    if (data === "back_to_search") {
        const session = searchSessions[chatId];
        if (session) {
            try {
                await bot.deleteMessage(chatId, q.message.message_id);
            } catch (e) {}
            await renderSearchPage(chatId, session.page);
        } else {
            await bot.sendMessage(chatId, "❌ Session pencarian habis. Silakan cari ulang.");
        }
        return;
    }
    
    // ===== 🔥 CANCEL SEARCH =====
if (data === "cancel_search") {
    delete searchSessions[chatId];
    await bot.sendMessage(chatId, "❌ Pencarian dibatalkan.", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🔙 KEMBALI KE MENU", callback_data: "back_to_main" }]
            ]
        }
    });
    return;
}
    
    // ===== 🔥 3. DETAIL DATA VIA TOMBOL ANGKA =====
    if (data.startsWith("detail_")) {
        const num = parseInt(data.replace("detail_", ""));
        await showDataDetail(chatId, num, true);
        return;
    }
    
    // ===== 🔥 4. SEARCH PAGE NAVIGATION =====
    if (data.startsWith("search_page_")) {
        const page = parseInt(data.replace("search_page_", ""));
        const session = searchSessions[chatId];
        
        if (!session) {
            await bot.sendMessage(chatId, '❌ Session pencarian habis. Silakan cari ulang.');
            return;
        }
        
        try {
            await bot.deleteMessage(chatId, q.message.message_id);
        } catch (e) {}
        
        await renderSearchPage(chatId, page);
        return;
    }
    
    // ===== 🔥 5. BROADCAST CALLBACK =====
    if (data === "broadcast_text" || data === "broadcast_photo" || 
        data === "broadcast_video" || data === "broadcast_tag_toggle" ||
        data === "broadcast_reply" || data === "broadcast_skip_reply" ||
        data === "broadcast_confirm" || data === "broadcast_send" ||
        data === "broadcast_cancel" || data === "broadcast_history") {
        
        await broadcast.handleBroadcastCallback(bot, q);
        return;
    }
    
    // ===== 🔥 6. BUY CANCEL =====
    if (data === "buy_cancel") {
        delete buySessions[chatId];
        delete paymentSessions[chatId];
        delete qrisMessageIds[chatId];
        await bot.sendMessage(chatId, "❌ Pembelian dibatalkan.", {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🔙 KEMBALI KE MENU", callback_data: "back_to_main" }]
                ]
            }
        });
        return;
    }
    
    // ===== 🔥 7. BUY CONFIRM =====
    if (data.startsWith("buy_confirm_")) {
        const num = parseInt(data.replace("buy_confirm_", ""));
        await generatePaymentQRIS(chatId, userId, num);
        return;
    }
    
    // ===== 🔥 8. CHECK PAYMENT =====
    if (data.startsWith("check_payment_")) {
        const transactionId = data.replace("check_payment_", "");
        await checkPaymentStatus(chatId, userId, transactionId);
        return;
    }
    
    // ===== 🔥 9. CART CALLBACKS =====
    if (data.startsWith("cart_add_")) {
        const num = parseInt(data.replace("cart_add_", ""));
        await addToCart(chatId, num);
        return;
    }

    if (data === "cart_view") {
        await viewCart(chatId);
        return;
    }

    if (data === "cart_checkout") {
        await checkoutCart(chatId, userId);
        return;
    }

    if (data === "cart_clear") {
        await clearCart(chatId);
        return;
    }

    if (data === "cart_add_more") {
        await bot.sendMessage(chatId, `
🔍 <b>CARI DATA UNTUK DITAMBAHKAN</b>
📌 Klik "🔍 Cari Data" di menu utama untuk mencari data.
📌 Atau ketik nama kabupaten/kota.
        `, { parse_mode: "HTML" });
        return;
    }
});

// ============================
// ERROR HANDLER
// ============================
process.on("uncaughtException", (err) => {
    console.log("❌ ERROR CRASH:", err);
});

process.on("unhandledRejection", (err) => {
    console.log("❌ PROMISE ERROR:", err);
});

// ============================
// BOT READY
// ============================
console.log('✅ BOT ABH SIAP DIGUNAKAN...');
console.log(`👑 Owner ID: ${OWNER_ID}`);
console.log(`📅 ${new Date().toLocaleString('id-ID')}`);