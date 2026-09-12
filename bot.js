// ============================
// BOT.JS - ABH DATA STORE (AUTOGOPAY ONLY)
// ============================

const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");
const XLSX = require('xlsx');
const axios = require('axios');
const broadcast = require('./broadcast.js');
const discountModule = require('./discount.js');
const backupModule = require('./backup.js');

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
const SOLD_FILE = "./sold_data.json";
const REVENUE_FILE = "./revenue.json";
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
let soldStore = loadJSON(SOLD_FILE);
let revenueStore = loadJSON(REVENUE_FILE);

// 🔥 Pastikan struktur benar
if (!soldStore.items) soldStore.items = [];
if (!revenueStore.total) revenueStore.total = 0;
if (!revenueStore.transactions) revenueStore.transactions = [];

// ============================
// 🔥 SIMPAN DATA TERJUAL PERMANEN
// ============================
const saveSoldItem = (jsNumber, item, userId, username, transactionId, harga) => {
    const existing = soldStore.items.find(s => s.jsNumber === jsNumber);
    if (existing) return;

    soldStore.items.push({
        jsNumber: jsNumber,
        data: item,
        soldTo: userId,
        buyerUsername: username || 'Unknown',
        soldAt: new Date().toISOString(),
        transactionId: transactionId,
        harga: harga || 5000
    });
    saveJSON(SOLD_FILE, soldStore);
    console.log(`💾 [SOLD] ABH ${String(jsNumber).padStart(3, '0')} disimpan permanen`);
};

const addRevenue = (amount, transactionId, userId, itemCount) => {
    revenueStore.total = (revenueStore.total || 0) + amount;
    revenueStore.transactions.push({
        transactionId: transactionId,
        userId: userId,
        amount: amount,
        itemCount: itemCount,
        at: new Date().toISOString()
    });
    saveJSON(REVENUE_FILE, revenueStore);
    console.log(`💰 [REVENUE] +Rp${amount} (total: Rp${revenueStore.total})`);
};

const isSoldPermanently = (jsNumber) => {
    return soldStore.items.some(s => s.jsNumber === jsNumber);
};

const getTotalRevenue = () => revenueStore.total || 0;
const getTotalSold = () => soldStore.items.length;

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
const processingFiles = new Set();

// ============================
// SESSION CLEANUP UTILITY
// ============================
const cleanupSessions = (chatId) => {
    delete buySessions[chatId];
    delete searchSessions[chatId];
    delete paymentSessions[chatId];
    delete qrisMessageIds[chatId];
    delete cartSessions[chatId];
    delete cartTotalSessions[chatId];

    if (global.searchSessions && global.searchSessions[chatId]) {
        delete global.searchSessions[chatId];
    }

    console.log(`🧹 Session cleaned for chatId: ${chatId}`);
};

// ============================
// IMPORT MENU
// ============================
const { showMenu, showAkun, showBantuan, isOwner, showHubungiOwner, showDiskonMenu, showCekDiskon } = require('./menu.js');
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

    return `ABH ${String(jsNum).padStart(2, '0')}
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

🏆 DPT JMO LASIK`;
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

    return `ABH ${String(jsNum).padStart(2, '0')}
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

// ============================
// 🔥 PARSE KODE ABH DARI KOLOM A
// ============================
const parseKodeABH = (val) => {
    if (val === undefined || val === null || val === '') return null;
    const str = String(val).trim().toUpperCase();

    // Match "ABH 001", "ABH-001", "ABH 1000", "ABH-1000"
    const m = str.match(/ABH[\s\-]*(\d+)/);
    if (m) return parseInt(m[1], 10);

    // Fallback: ambil semua digit
    const n = parseInt(str.replace(/\D/g, ''), 10);
    return isNaN(n) ? null : n;
};

// ============================
// FUNGSI PARSING HARGA
// ============================
const parseHarga = (value) => {
    if (!value) return 5000;

    // 🔥 Kalau formula Excel (=...), fallback ke default
    if (typeof value === 'string' && value.trim().startsWith('=')) {
        return 5000;
    }

    if (typeof value === 'number') {
        return Math.floor(value);
    }

    let str = String(value).trim();
    str = str.replace(/rp/gi, '');
    str = str.replace(/\./g, '');
    str = str.replace(/\s/g, '');
    str = str.replace(/,.*$/, '');
    str = str.replace(/[^\d]/g, '');

    const result = parseInt(str);

    if (!isNaN(result) && result > 0) {
        return result;
    }

    return 5000;
};

const processExcel = async (filePath) => {
    try {
        console.log(`📊 Processing: ${filePath}`);

        const workbook = XLSX.readFile(filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        if (!jsonData || jsonData.length === 0) {
            throw new Error('Data kosong!');
        }

        console.log(`📊 Total rows: ${jsonData.length}`);

        const headers = Object.keys(jsonData[0] || {});
        console.log('📋 HEADER:', headers);

        const findColumn = (name) => {
            const lower = name.toLowerCase();
            for (const h of headers) {
                if (h.toLowerCase().includes(lower)) {
                    return h;
                }
            }
            return null;
        };

// 🔥 Kolom A = kode ABH
const colNo = headers[0];

const colNama = findColumn('nama');
const colNIK = findColumn('nik');
const colKPJ = findColumn('kpj');
const colTglLahir = findColumn('tgl lahir');
const colSaldo = findColumn('saldo');
const colJmlKartu = findColumn('jml kartu');
const colIuran = findColumn('iuran terakhir');
const colLasik = findColumn('lasik error');
const colKabupaten = findColumn('kabupaten/kota');
const colKecamatan = findColumn('kecamatan');
const colKelurahan = findColumn('kelurahan');
const colKelamin = findColumn('kelamin');
const colPT = findColumn('pt');
const colHarga = findColumn('harga');

// 🔥 KOLOM TAMBAHAN
const colUsia = findColumn('usia') || findColumn('umur') || findColumn('age');
const colPensiun = findColumn('pensiun') || findColumn('pension');
const colSegmen = findColumn('segmen');
const colPaket = findColumn('paket');
const colStatus = findColumn('status') || findColumn('status jmo');
const colReaktivasi = findColumn('reaktivasi');
const colStatusPengkinian = findColumn('status pengkinian');
const colSuspendKlaim = findColumn('suspend klaim');
const colKodeKlaim = findColumn('kode klaim');
const colSuspendPengkinian = findColumn('suspend pengkinian');
const colKodePengkinian = findColumn('kode pengkinian');
const colRedirectJMO = findColumn('redirect jmo');
const colKlaim = findColumn('klaim');
const colKet = findColumn('ket');
const colPengkinian = findColumn('pengkinian') || findColumn('akun jmo');
const colAkunJMO = findColumn('akun jmo');

        console.log('📍 Mapping kolom:', {
    Nama: colNama,
    Kabupaten: colKabupaten,
    Harga: colHarga,
    Usia: colUsia,
    Pensiun: colPensiun,
    Segmen: colSegmen,
    Paket: colPaket,
    Status: colStatus,
    Reaktivasi: colReaktivasi,
    StatusPengkinian: colStatusPengkinian,
    SuspendKlaim: colSuspendKlaim,
    KodeKlaim: colKodeKlaim,
    SuspendPengkinian: colSuspendPengkinian,
    KodePengkinian: colKodePengkinian,
    RedirectJMO: colRedirectJMO,
    Klaim: colKlaim,
    Ket: colKet,
    Pengkinian: colPengkinian,
    AkunJMO: colAkunJMO
});

        if (!colNama || !colKabupaten) {
            throw new Error('Kolom Nama dan Kabupaten/Kota wajib ada!');
        }

        const results = [];
        let fallbackCounter = 1; // kalau kolom A kosong

        for (const row of jsonData) {
            const getVal = (col) => {
                if (!col) return '';
                const val = row[col];
                if (val === undefined || val === null) return '';
                return String(val).trim();
            };

            // 🔥 Ambil kode ABH dari kolom A
            const kodeRaw = getVal(colNo);
            const kodeABH = parseKodeABH(kodeRaw);

            const nik = getVal(colNIK);
            const kpj = getVal(colKPJ);
            const nama = getVal(colNama);

            // 🔥 Skip baris kosong (Nama, NIK, KPJ semua kosong)
            if (!nama && !nik && !kpj) {
                console.log(`⏭️ Skip baris kosong: "${kodeRaw}"`);
                continue;
            }

            // 🔥 Pakai kode dari Excel, fallback ke counter kalau kosong
            const jsNum = kodeABH || fallbackCounter;
            fallbackCounter = jsNum + 1;

            const hargaRaw = getVal(colHarga);
            const hargaFinal = parseHarga(hargaRaw);

const obj = {
    Nama: nama || '-',
    NIK: nik || '-',
    Kabupaten: getVal(colKabupaten) || '-',
    Kecamatan: getVal(colKecamatan) || '-',
    Kelurahan: getVal(colKelurahan) || '-',
    PT: getVal(colPT) || '-',
    KPJ: kpj || '-',
    TTL: getVal(colTglLahir) || '-',
    JK: getVal(colKelamin) || '-',
    SaldoJMO: parseSaldo(getVal(colSaldo)),
    JmlKartu: parseInt(getVal(colJmlKartu)) || 1,
    IuranTerakhir: getVal(colIuran) || '-',
    LasikError: getVal(colLasik) || '-',
    Harga: hargaFinal,

    // 🔥 KOLOM TAMBAHAN
    Usia: getVal(colUsia) || '-',
    Pensiun: getVal(colPensiun) || '-',
    Segmen: getVal(colSegmen) || '-',
    Paket: getVal(colPaket) || '-',
    Status: getVal(colStatus) || '-',
    Reaktivasi: getVal(colReaktivasi) || '-',
    StatusPengkinian: getVal(colStatusPengkinian) || '-',
    SuspendKlaim: getVal(colSuspendKlaim) || '-',
    KodeKlaim: getVal(colKodeKlaim) || '-',
    SuspendPengkinian: getVal(colSuspendPengkinian) || '-',
    KodePengkinian: getVal(colKodePengkinian) || '-',
    RedirectJMO: getVal(colRedirectJMO) || '-',
    Klaim: getVal(colKlaim) || '-',
    Ket: getVal(colKet) || '-',
    Pengkinian: getVal(colPengkinian) || '-',
    AkunJMO: getVal(colAkunJMO) || '-',

    sold: false,
    soldTo: null,
    soldAt: null,
    transactionId: null
};

            const formatted = buildOutputText(obj, jsNum);
            const fullFormatted = buildFullOutputText(obj, jsNum);

                        results.push({
                ...obj,
                jsNumber: jsNum,
                formatted: formatted,
                fullFormatted: fullFormatted,
                harga: obj.Harga
            });
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
            timeout: 30000,
            maxContentLength: 50 * 1024 * 1024
        });

        console.log(`✅ Download complete: ${response.data.length} bytes`);
        return response.data;
    } catch (error) {
        console.error('❌ Download error:', error.message);
        throw new Error(`Gagal download file: ${error.message}`);
    }
};

// ============================
// 🔥 GENERATE EXCEL UNTUK NOTIFIKASI PEMBELIAN
// ============================
// ============================
const generateExcelNotif = (items, pembeli, userId, transactionId) => {
    try {
        const rows = [];

        // 🔥 Tanggal sekali biar konsisten
        const tanggal = new Date().toLocaleString('id-ID');

        for (const c of items) {
            const it = c.item || c;
            const jsNum = c.jsNumber || it.jsNumber || 0;

            rows.push({
                'No': String(jsNum).padStart(3, '0'),
                'KPJ': it.KPJ || '-',
                'NIK': it.NIK || '-',
                'Nama': it.Nama || '-',
                'TGL LAHIR': it.TTL || '-',
                'Usia': it.Usia || '-',
                'Pensiun': it.Pensiun || '-',
                'Segmen': it.Segmen || '-',
                'Paket': it.Paket || '-',
                'Saldo': it.SaldoJMO || 0,
                'Status': it.Status || '-',
                'Jml Kartu': it.JmlKartu || 1,
                'Iuran Terakhir': it.IuranTerakhir || '-',
                'Reaktivasi': it.Reaktivasi || '-',
                'Status Pengkinian': it.StatusPengkinian || '-',
                'Suspend Klaim': it.SuspendKlaim || '-',
                'Kode Klaim': it.KodeKlaim || '-',
                'Suspend Pengkinian': it.SuspendPengkinian || '-',
                'Kode Pengkinian': it.KodePengkinian || '-',
                'Redirect JMO': it.RedirectJMO || '-',
                'Klaim': it.Klaim || '-',
                'Ket': it.Ket || '-',
                'Pengkinian': it.Pengkinian || '-',
                'Akun JMO': it.AkunJMO || '-',
                'LASIK ERROR': it.LasikError || '-',
                'Kabupaten/kota': it.Kabupaten || '-',
                'Kecamatan': it.Kecamatan || '-',
                'Kelurahan': it.Kelurahan || '-',
                'kelamin': it.JK || '-',
                'Harga': c.harga || it.harga || 0,
                'PT': it.PT || '-',
                'STATUS': 'TERJUAL',

                // 🔥 4 KOLOM BARU — SEJAJAR DI UJUNG
                'PEMBELI': pembeli || 'Unknown',
                'USER ID': String(userId),
                'TRANSAKSI': transactionId,
                'TANGGAL': tanggal
            });
        }

        const ws = XLSX.utils.json_to_sheet(rows);

        // 🔥 Lebar kolom (32 data + 4 info pembeli = 36 kolom)
        ws['!cols'] = [
            { wch: 10 },  // No
            { wch: 15 },  // KPJ
            { wch: 20 },  // NIK
            { wch: 25 },  // Nama
            { wch: 15 },  // TGL LAHIR
            { wch: 10 },  // Usia
            { wch: 12 },  // Pensiun
            { wch: 20 },  // Segmen
            { wch: 20 },  // Paket
            { wch: 15 },  // Saldo
            { wch: 20 },  // Status
            { wch: 10 },  // Jml Kartu
            { wch: 18 },  // Iuran Terakhir
            { wch: 12 },  // Reaktivasi
            { wch: 18 },  // Status Pengkinian
            { wch: 15 },  // Suspend Klaim
            { wch: 12 },  // Kode Klaim
            { wch: 18 },  // Suspend Pengkinian
            { wch: 15 },  // Kode Pengkinian
            { wch: 15 },  // Redirect JMO
            { wch: 30 },  // Klaim
            { wch: 30 },  // Ket
            { wch: 15 },  // Pengkinian
            { wch: 18 },  // Akun JMO
            { wch: 25 },  // LASIK ERROR
            { wch: 20 },  // Kabupaten/kota
            { wch: 20 },  // Kecamatan
            { wch: 20 },  // Kelurahan
            { wch: 12 },  // kelamin
            { wch: 12 },  // Harga
            { wch: 15 },  // PT
            { wch: 12 },  // STATUS
            { wch: 20 },  // PEMBELI
            { wch: 15 },  // USER ID
            { wch: 38 },  // TRANSAKSI
            { wch: 22 }   // TANGGAL
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Data Terjual');

        return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    } catch (err) {
        console.error('❌ Generate Excel error:', err.message);
        return null;
    }
};

// ============================
// 🔥 FUNGSI KIRIM NOTIFIKASI (EXCEL + CAPTION)
// ============================
// ============================
// 🔥 FUNGSI KIRIM NOTIFIKASI (EXCEL + CAPTION)
// ============================
const sendNotification = async (abhNumber, item, userId, username, transactionId, amount, isCart = false, totalItems = 1, allItems = null) => {
    if (!NOTIF_ENABLED) {
        console.log('ℹ️ Notifications disabled');
        return;
    }

    if (!notifBot) {
        console.log('⚠️ Notification bot not initialized');
        return;
    }

    try {
        const waktu = new Date().toLocaleString('id-ID', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        // ============================
        // 🔥 BUILD CAPTION
        // ============================
        let caption = '';

        if (isCart && totalItems > 1) {
            caption = `🔔 PEMBELIAN DATA ABH\n\n` +
                `📌 Data : ABH ${String(abhNumber).padStart(2, '0')} ... dan ${totalItems - 1} lainnya\n` +
                `📍 Kabupaten : ${item.Kabupaten}\n` +
                `📍 Kecamatan : ${item.Kecamatan}\n` +
                `👤 Nama : ${item.Nama || '-'}\n` +
                `🆔 NIK : ${item.NIK || '-'}\n\n` +
                `👤 Pembeli : ${username || 'Unknown'}\n` +
                `🆔 User ID : ${userId}\n` +
                `💵 Harga per Data : Rp${formatRupiah(amount)}\n` +
                `💵 Total Harga : Rp${formatRupiah(amount * totalItems)}\n` +
                `🆔 Transaksi : ${transactionId}\n` +
                `📅 Tanggal : ${waktu}\n\n` +
                `✅ STATUS : BERHASIL`;
        } else {
            caption = `🔔 PEMBELIAN DATA ABH\n\n` +
                `📌 Data : ABH ${String(abhNumber).padStart(2, '0')}\n` +
                `📍 Kabupaten : ${item.Kabupaten}\n` +
                `📍 Kecamatan : ${item.Kecamatan}\n` +
                `📍 Kelurahan : ${item.Kelurahan || '-'}\n` +
                `👤 Nama : ${item.Nama || '-'}\n` +
                `🆔 NIK : ${item.NIK || '-'}\n\n` +
                `👤 Pembeli : ${username || 'Unknown'}\n` +
                `🆔 User ID : ${userId}\n` +
                `💵 Harga : Rp${formatRupiah(amount)}\n` +
                `🆔 Transaksi : ${transactionId}\n` +
                `📅 Tanggal : ${waktu}\n\n` +
                `✅ STATUS : BERHASIL`;
        }

        // ============================
        // 🔥 CEGAH DUPLIKAT
        // ============================
        const notifKey = `${transactionId}_${userId}`;

        if (!global._sentNotifs) {
            global._sentNotifs = new Set();
        }

        if (global._sentNotifs.has(notifKey)) {
            console.log(`⏩ Notifikasi ${notifKey} sudah terkirim, skip...`);
            return;
        }

        global._sentNotifs.add(notifKey);

        // ============================
        // 🔥 TENTUKAN TARGET
        // ============================
        let targetChatId = null;

        if (NOTIF_CHAT_ID && NOTIF_CHAT_ID !== OWNER_ID) {
            targetChatId = NOTIF_CHAT_ID;
            console.log(`📨 Target: Channel ${NOTIF_CHAT_ID}`);
        }
        else if (NOTIF_TO_OWNER) {
            targetChatId = OWNER_ID;
            console.log(`📨 Target: Owner ${OWNER_ID}`);
        }

        if (!targetChatId) {
            console.log('⚠️ No target chat ID found for notification');
            return;
        }

        // ============================
        // 🔥 KUMPULKAN ITEMS
        // ============================
        let excelItems = [];

        if (allItems && allItems.length > 0) {
            excelItems = allItems;
        } else {
            excelItems = [{
                jsNumber: abhNumber,
                item: item,
                harga: amount
            }];
        }

        // ============================
        // 🔥 GENERATE EXCEL
        // ============================
        const excelBuffer = generateExcelNotif(
            excelItems,
            username || 'Unknown',
            userId,
            transactionId
        );

        // ============================
        // 🔥 KIRIM FILE EXCEL + CAPTION
        // 🔥 PENTING: TANPA parse_mode HTML
        // ============================
                        if (excelBuffer) {
            const filename = `Pembelian_ABH_${String(abhNumber).padStart(2, '0')}_${Date.now()}.xlsx`;

            // 🔥 BUILD BUTTON
            const buttons = [];

            // Cek username valid
            const hasUsername = username &&
                                username !== 'no_username' &&
                                username !== 'Unknown' &&
                                username.trim() !== '';

            if (hasUsername) {
                // PRIORITAS 1: username publik (paling reliable)
                buttons.push([{
                    text: `💬 Chat @${username}`,
                    url: `https://t.me/${username}`
                }]);
            }

            // Selalu tampilkan button via User ID (sebagai alternatif)
            buttons.push([{
                text: `👤 Lihat Profil (ID: ${userId})`,
                url: `tg://user?id=${userId}`
            }]);

                        await notifBot.sendDocument(
                targetChatId,
                excelBuffer,
                {
                    caption: caption,
                    reply_markup: {
                        inline_keyboard: buttons
                    }
                },
                {
                    filename: filename,
                    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                }
            );

            console.log(`✅ Notifikasi + Excel terkirim ke ${targetChatId}`);
            console.log(`📄 File: ${filename}`);
        } else {
            console.log('⚠️ Gagal generate Excel, kirim teks saja');
            await notifBot.sendMessage(targetChatId, caption);
        }

        setTimeout(() => {
            if (global._sentNotifs) {
                global._sentNotifs.delete(notifKey);
            }
        }, 5000);

    } catch (error) {
        console.error('❌ Failed to send notification:', error.message);
    }
};

// ============================
// 🛒 FUNGSI TROLI BELANJA
// ============================

const addToCart = async (chatId, num) => {
    const data = dataStore.data || [];

    const item = data.find(d => d.jsNumber === num);

    if (!item) {
        await bot.sendMessage(chatId, `❌ Data ABH ${String(num).padStart(3, '0')} tidak ditemukan!`);
        return false;
    }

    if (item.sold) {
        await bot.sendMessage(chatId, `
❌ <b>DATA SUDAH TERJUAL!</b>

ABH ${String(num).padStart(2, '0')}
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

ABH ${String(num).padStart(2, '0')}
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

    const discountResult = discountModule.applyDiscount(totalHarga, chatId, users);
    let discountText = '';
    if (discountResult.discountPercent > 0) {
        discountText = `\n🎯 Diskon ${discountResult.discountPercent}%: -Rp${formatRupiah(discountResult.discountAmount)}`;
    }

await bot.sendMessage(chatId, `
✅ <b>DATA DITAMBAHKAN KE TROLI!</b>

ABH ${String(num).padStart(2, '0')}
📍 ${item.Kabupaten} - ${item.Kecamatan}
💵 Harga: Rp${formatRupiah(item.harga || 5000)}

━━━━━━━━━━━━━━━━━━━━
🛒 <b>TROLI:</b> ${totalItems} data
💰 <b>Total:</b> Rp${formatRupiah(totalHarga)}${discountText}

📌 <b>CARA TAMBAH DATA LAIN:</b>
├ Kirim nomor ABH langsung (contoh: 5)
├ Atau klik "🛒 Lihat TROLI" lalu pilih "➕ Tambah Data"

📌 Gunakan tombol di bawah:
`, {
    parse_mode: "HTML",
    reply_markup: {
        inline_keyboard: [
            [{ text: "🛒 Lihat TROLI", callback_data: "cart_view" }],
            [{ text: "💳 Bayar Sekarang", callback_data: "cart_checkout" }],
            [{ text: "🔙 KEMBALI KE MENU", callback_data: "back_to_main" }]
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

    const discountResult = discountModule.applyDiscount(totalHarga, chatId, users);

    let text = `
🛒 <b>TROLI BELANJA</b>
━━━━━━━━━━━━━━━━━━━━
📊 <b>Total Data:</b> ${totalItems}
💰 <b>Subtotal:</b> Rp${formatRupiah(totalHarga)}
`;

    if (discountResult.discountPercent > 0) {
        text += `🎯 <b>Diskon ${discountResult.discountPercent}%:</b> -Rp${formatRupiah(discountResult.discountAmount)}
💵 <b>Total Bayar:</b> Rp${formatRupiah(discountResult.finalPrice)}
`;
    } else {
        text += `💵 <b>Total Bayar:</b> Rp${formatRupiah(totalHarga)}
`;
    }

    text += `━━━━━━━━━━━━━━━━━━━━
`;

    for (let i = 0; i < items.length; i++) {
        const c = items[i];
        const num = String(c.jsNumber).padStart(2, '0');
        text += `
${i+1}. ABH ${num} | ${c.item.Kabupaten}
   💵 Rp${formatRupiah(c.harga)}
   📌 <code>${c.item.Nama}</code>
`;
    }

    text += `
━━━━━━━━━━━━━━━━━━━━
📌 Klik tombol di bawah untuk melanjutkan.
`;

    await bot.sendMessage(chatId, text, {
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [{ text: "🔍 Cari & Tambah Data", callback_data: "cart_search_add" }],
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
    const subtotal = items.reduce((sum, c) => sum + c.harga, 0);

    const discountResult = discountModule.applyDiscount(subtotal, userId, users);
    const finalTotal = discountResult.finalPrice;
    const discountAmount = discountResult.discountAmount;
    const discountPercent = discountResult.discountPercent;
    const discountLabel = discountResult.discountLabel;

    const soldItems = [];
    for (const c of items) {
        const dataIndex = dataStore.data.findIndex(d => d.jsNumber === c.jsNumber);
        if (dataIndex !== -1 && dataStore.data[dataIndex].sold === true) {
            soldItems.push(c.jsNumber);
        }
    }

    if (soldItems.length > 0) {
        const soldList = soldItems.map(n => `ABH ${String(n).padStart(2, '0')}`).join(', ');
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

    const description = `Beli ${totalItems} data ABH${discountPercent > 0 ? ` (diskon ${discountPercent}%)` : ''}`;
    const loadingMsg = await bot.sendMessage(chatId, `⏳ <b>Generate QRIS untuk Rp${formatRupiah(finalTotal)}...</b>`, { parse_mode: "HTML" });

    try {
        const result = await generateQRIS(finalTotal, description);

        if (!result.success) {
            await bot.editMessageText(`
⚠️ <b>QRIS SEDANG MAINTENANCE!</b>

📌 Mohon maaf, sistem pembayaran QRIS sedang dalam perbaikan.

━━━━━━━━━━━━━━━━━━━━
🙏 Terima kasih atas pengertiannya.
    `, {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [{ text: "🔙 KEMBALI KE MENU", callback_data: "back_to_main" }]
            ]
        }
    });
    return;
}

        paymentSessions[chatId] = {
            abhNumber: 'multiple',
            transactionId: result.transaction_id,
            amount: finalTotal,
            subtotal: subtotal,
            discountAmount: discountAmount,
            discountPercent: discountPercent,
            discountLabel: discountLabel,
            timestamp: Date.now(),
            userId: userId,
            data: items,
            fullData: items.map(c => c.fullFormatted || c.formatted).join('\n\n━━━━━━━━━━━━━━━━━━━\n\n'),
            loadingMsgId: loadingMsg.message_id,
            isCart: true,
            cartItems: items,
            paymentMethod: 'AUTOGOPAY'
        };

        try {
            await bot.deleteMessage(chatId, loadingMsg.message_id);
        } catch (e) {}

        const itemList = items.map(c => `ABH ${String(c.jsNumber).padStart(2, '0')} - ${c.item.Kabupaten}`).join('\n');

        let caption = `
💰 <b>QRIS PEMBAYARAN</b>

🛒 <b>Total Data:</b> ${items.length}
📌 <b>Data:</b>
${itemList}

💵 <b>Subtotal:</b> Rp${formatRupiah(subtotal)}
`;

        if (discountPercent > 0) {
            caption += `
🎯 <b>DISKON ${discountPercent}%</b>
├ 💰 Potongan: -Rp${formatRupiah(discountAmount)}
└ 💵 <b>Total Bayar: Rp${formatRupiah(finalTotal)}</b>
`;
        } else {
            caption += `💵 <b>Total Bayar: Rp${formatRupiah(finalTotal)}</b>
`;
        }

        caption += `
🆔 <b>Transaksi:</b> ${result.transaction_id}
💳 <b>Metode:</b> AutoGoPay

⏳ Scan QRIS di atas untuk membayar.
⏰ QRIS berlaku 15 menit.

📌 Setelah bayar, klik "✅ CEK PEMBAYARAN"
`;

        let sentMsg;
        if (result.image_data) {
            const buffer = Buffer.from(result.image_data.split(',')[1], 'base64');
            sentMsg = await bot.sendPhoto(chatId, buffer, {
                caption: caption,
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
                caption: caption,
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

            const startAutoCheck = async () => {
                let checkCount = 0;
                const maxChecks = 30;
                const checkInterval = 5000;

                const intervalId = setInterval(async () => {
                    checkCount++;

                    if (!paymentSessions[chatId]) {
                        clearInterval(intervalId);
                        return;
                    }

                    if (!qrisMessageIds[chatId]) {
                        clearInterval(intervalId);
                        return;
                    }

                    console.log(`🔄 [AUTOCHECK] #${checkCount} - Checking payment for ${chatId}...`);

                    try {
                        const session = paymentSessions[chatId];
                        if (!session) {
                            clearInterval(intervalId);
                            return;
                        }

                        const result = await cekStatusDualWithRetry(
                            session.transactionId,
                            session.amount,
                            'AUTOGOPAY',
                            session.timestamp,
                            1
                        );

                        if (result.matched || result.status === 'settlement' || result.status === 'success' || result.status === 'paid') {
                            console.log(`✅ [AUTOCHECK] Payment found for ${chatId}!`);
                            clearInterval(intervalId);
                            await processPaymentSuccess(chatId, userId, result, session);
                            return;
                        }

                        if (checkCount >= maxChecks) {
                            console.log(`⏰ [AUTOCHECK] Max checks reached for ${chatId}`);
                            clearInterval(intervalId);
                        }

                    } catch (error) {
                        console.error('❌ [AUTOCHECK] Error:', error.message);
                    }
                }, checkInterval);

                if (!global.autoCheckIntervals) global.autoCheckIntervals = {};
                global.autoCheckIntervals[chatId] = intervalId;
            };

            await startAutoCheck();
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
// 🔍 FUNGSI SEARCH
// ============================

const searchByKabupaten = async (chatId, keyword, page = 0) => {
    const data = dataStore.data || [];

    if (data.length === 0) {
        await bot.sendMessage(chatId, '📋 Belum ada data. Upload file Excel dulu!');
        return;
    }

    const searchLower = keyword.toLowerCase().trim();

    const loadingMsg = await bot.sendMessage(chatId, '⏳ <b>Mencari data</b> 🔍', { parse_mode: "HTML" });

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

    const allFound = data.filter(item =>
        item.Kabupaten.toLowerCase().includes(searchLower) ||
        item.Kecamatan.toLowerCase().includes(searchLower) ||
        item.Kelurahan.toLowerCase().includes(searchLower)
    );

    const availableResults = allFound.filter(item => !item.sold);

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

    searchSessions[chatId] = {
        keyword: keyword,
        results: availableResults,
        total: availableResults.length,
        page: page
    };

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
🔍 <b>HASIL PENCARIAN: ${keyword.toUpperCase()}</b>
━━━━━━━━━━━━━━━━━━━━
📊 <b>Total ditemukan:</b> ${total} data tersedia
📄 <b>Halaman:</b> ${page + 1} dari ${totalPages}
📌 <b>Menampilkan:</b> ${startIndex + 1} - ${endIndex} dari ${total}
━━━━━━━━━━━━━━━━━━━━

`;

    for (let i = 0; i < pageResults.length; i++) {
        const item = pageResults[i];
        const num = String(item.jsNumber).padStart(2, '0');
        const harga = item.harga || 5000;
        const saldo = formatRupiah(item.SaldoJMO || 0);
        const namaSensor = sensorNama(item.Nama);

        text += `
<b>${i + 1}. ABH ${num}</b>
📍 ${item.Kabupaten} - ${item.Kecamatan}
👤 ${namaSensor}
💰 SALDO : ${saldo}
💵 HARGA DATA : Rp${formatRupiah(harga)}
`;
    }

    text += `
━━━━━━━━━━━━━━━━━━━━
💡 Klik tombol di bawah untuk lihat detail
`;

    const keyboard = [];

    const numberButtons = [];
    for (const item of pageResults) {
        const num = String(item.jsNumber).padStart(2, '0');
        numberButtons.push({
            text: `ABH ${num}`,
            callback_data: `detail_${item.jsNumber}`
        });
    }

    for (let i = 0; i < numberButtons.length; i += 3) {
        keyboard.push(numberButtons.slice(i, i + 3));
    }

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

    keyboard.push([{ text: "🔙 Kembali ke Menu", callback_data: "back_to_main" }]);

    await bot.sendMessage(chatId, text, {
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: keyboard
        }
    });
};

// ============================
// FUNGSI SHOW DATA DETAIL
// ============================

const showDataDetail = async (chatId, num, fromSearch = false) => {
    const data = dataStore.data || [];

    const item = data.find(d => d.jsNumber === num);

    if (!item) {
        await bot.sendMessage(chatId, `❌ Data ABH ${String(num).padStart(3, '0')} tidak ditemukan!`);
        return;
    }

    const harga = item.harga || 5000;

    if (item.sold) {
        await bot.sendMessage(chatId, `
❌ <b>DATA SUDAH TERJUAL!</b>
ABH ${String(num).padStart(3, '0')}
📍 ${item.Kabupaten} - ${item.Kecamatan}
💡 Data ini sudah dibeli oleh user lain.
        `, { parse_mode: "HTML" });
        return;
    }

    const discountResult = discountModule.applyDiscount(harga, chatId, users);
    const displayPrice = discountResult.finalPrice;
    const discountPercent = discountResult.discountPercent;
    const discountAmount = discountResult.discountAmount;

    let caption = item.formatted;
    caption += `

━━━━━━━━━━━━━━━━━━━
💵 <b>HARGA ASLI: Rp${formatRupiah(harga)}</b>
`;

    if (discountPercent > 0) {
        caption += `🎯 <b>DISKON ${discountPercent}%</b>
├ 💰 Potongan: -Rp${formatRupiah(discountAmount)}
└ 💵 <b>HARGA JUAL: Rp${formatRupiah(displayPrice)}</b>
`;
    } else {
        caption += `💵 <b>HARGA JUAL: Rp${formatRupiah(displayPrice)}</b>
`;
    }

    const replyMarkup = {
        inline_keyboard: [
            [{ text: `🛒 TAMBAH TROLI`, callback_data: `cart_add_${num}` }],
            [{ text: `💰 BELI Rp${formatRupiah(displayPrice)}`, callback_data: `buy_confirm_${num}` }]
        ]
    };

    const hasSearchSession = searchSessions[chatId] !== undefined && searchSessions[chatId] !== null;

    if (fromSearch || hasSearchSession) {
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
// 🔥 GENERATE PAYMENT QRIS (AUTOGOPAY ONLY) + AUTO CHECK
// ============================
const generatePaymentQRIS = async (chatId, userId, num) => {
    const data = dataStore.data || [];

    const item = data.find(d => d.jsNumber === num);

    if (!item) {
        await bot.sendMessage(chatId, `❌ Data ABH ${String(num).padStart(3, '0')} tidak ditemukan!`);
        return;
    }

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

    const discountResult = discountModule.applyDiscount(harga, userId, users);
    const finalPrice = discountResult.finalPrice;
    const discountAmount = discountResult.discountAmount;
    const discountPercent = discountResult.discountPercent;
    const discountLabel = discountResult.discountLabel;

    const description = `Beli Data ABH ${String(num).padStart(2, '0')} - ${item.Kabupaten}${discountPercent > 0 ? ` (diskon ${discountPercent}%)` : ''}`;

    const loadingMsg = await bot.sendMessage(chatId, `⏳ <b>Generate QRIS untuk Rp${formatRupiah(finalPrice)}...</b>`, { parse_mode: "HTML" });

    try {
        const result = await generateQRIS(finalPrice, description);

        if (!result.success) {
            await bot.editMessageText(`
⚠️ <b>QRIS SEDANG MAINTENANCE!</b>

📌 Mohon maaf, sistem pembayaran QRIS sedang dalam perbaikan.

💡 <b>Solusi:</b>
├ Coba beberapa menit lagi
└ Atau hubungi admin untuk pembelian manual

👑 Owner: @AbahKonoha
━━━━━━━━━━━━━━━━━━━━
🙏 Terima kasih atas pengertiannya.
    `, {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [{ text: "🔙 KEMBALI KE MENU", callback_data: "back_to_main" }]
            ]
        }
    });
    return;
}

        paymentSessions[chatId] = {
            abhNumber: num,
            transactionId: result.transaction_id,
            amount: finalPrice,
            originalPrice: harga,
            discountAmount: discountAmount,
            discountPercent: discountPercent,
            discountLabel: discountLabel,
            timestamp: Date.now(),
            userId: userId,
            data: item,
            fullData: item.fullFormatted || item.formatted,
            loadingMsgId: loadingMsg.message_id,
            paymentMethod: 'AUTOGOPAY'
        };

        try {
            await bot.deleteMessage(chatId, loadingMsg.message_id);
        } catch (e) {}

        let caption = `
💰 <b>QRIS PEMBAYARAN</b>
📌 Data: ABH ${String(num).padStart(2, '0')}
📍 ${item.Kabupaten} - ${item.Kecamatan}
💳 Metode: AutoGoPay
`;

        if (discountPercent > 0) {
            caption += `
💵 <b>Harga Asli:</b> Rp${formatRupiah(harga)}
🎯 <b>DISKON ${discountPercent}%</b>
├ 💰 Potongan: -Rp${formatRupiah(discountAmount)}
└ 💵 <b>Total Bayar: Rp${formatRupiah(finalPrice)}</b>
`;
        } else {
            caption += `💵 <b>Harga:</b> Rp${formatRupiah(harga)}
`;
        }

        caption += `
🆔 Transaksi: ${result.transaction_id}
⏳ Scan QRIS di atas untuk membayar.
⏰ QRIS berlaku 15 menit.
📌 Setelah bayar, klik "✅ CEK PEMBAYARAN"
`;

        let sentMsg;
        if (result.image_data) {
            const buffer = Buffer.from(result.image_data.split(',')[1], 'base64');
            sentMsg = await bot.sendPhoto(chatId, buffer, {
                caption: caption,
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
                caption: caption,
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

            const startAutoCheck = async () => {
                let checkCount = 0;
                const maxChecks = 30;
                const checkInterval = 5000;

                const intervalId = setInterval(async () => {
                    checkCount++;

                    if (!paymentSessions[chatId]) {
                        clearInterval(intervalId);
                        return;
                    }

                    if (!qrisMessageIds[chatId]) {
                        clearInterval(intervalId);
                        return;
                    }

                    console.log(`🔄 [AUTOCHECK] #${checkCount} - Checking payment for ${chatId}...`);

                    try {
                        const session = paymentSessions[chatId];
                        if (!session) {
                            clearInterval(intervalId);
                            return;
                        }

                        const result = await cekStatusDualWithRetry(
                            session.transactionId,
                            session.amount,
                            'AUTOGOPAY',
                            session.timestamp,
                            1
                        );

                        if (result.matched || result.status === 'settlement' || result.status === 'success' || result.status === 'paid') {
                            console.log(`✅ [AUTOCHECK] Payment found for ${chatId}!`);
                            clearInterval(intervalId);
                            await processPaymentSuccess(chatId, userId, result, session);
                            return;
                        }

                        if (checkCount >= maxChecks) {
                            console.log(`⏰ [AUTOCHECK] Max checks reached for ${chatId}`);
                            clearInterval(intervalId);
                        }

                    } catch (error) {
                        console.error('❌ [AUTOCHECK] Error:', error.message);
                    }
                }, checkInterval);

                if (!global.autoCheckIntervals) global.autoCheckIntervals = {};
                global.autoCheckIntervals[chatId] = intervalId;
            };

            await startAutoCheck();
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
            try {
                await bot.deleteMessage(chatId, statusMsg.message_id);
            } catch (e) {}

            await processPaymentSuccess(chatId, userId, result, session);
            return;
        }

        if (result.status === 'pending') {
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
            return;
        }

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
    const fileKey = `${chatId}_${doc.file_id}`;
    if (processingFiles.has(fileKey)) {
        console.log(`⚠️ File ${doc.file_name} sedang diproses, skip...`);
        await bot.sendMessage(chatId, `⏳ File sedang diproses, mohon tunggu...`);
        return;
    }

    processingFiles.add(fileKey);

    try {
        const statusMsg = await bot.sendMessage(chatId, '⏳ <b>Uploading & Processing file...</b>', { parse_mode: "HTML" });

        console.log(`📁 Processing: ${doc.file_name} (${doc.file_size} bytes)`);

        const fileBuffer = await downloadFile(doc.file_id);

        await bot.editMessageText('⏳ <b>File terunduh, memproses...</b>', {
            chat_id: chatId,
            message_id: statusMsg.message_id,
            parse_mode: "HTML"
        });

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

                // 🔥 RESTORE data terjual ke data baru
        for (const row of result.data) {
            const soldItem = soldStore.items.find(s => s.jsNumber === row.jsNumber);
            if (soldItem) {
                row.sold = true;
                row.soldTo = soldItem.soldTo;
                row.soldAt = soldItem.soldAt;
                row.transactionId = soldItem.transactionId;
                row.buyerUsername = soldItem.buyerUsername;
            }
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
    } finally {
        processingFiles.delete(fileKey);
    }
};

// ============================
// HANDLE UPDATE DATA
// ============================
const handleUpdateData = async (chatId, doc) => {
    const fileKey = `${chatId}_${doc.file_id}`;
    if (processingFiles.has(fileKey)) {
        console.log(`⚠️ File ${doc.file_name} sedang diproses, skip...`);
        await bot.sendMessage(chatId, `⏳ File sedang diproses, mohon tunggu...`);
        return;
    }

    processingFiles.add(fileKey);

    try {
        const statusMsg = await bot.sendMessage(chatId, '⏳ <b>Mengunduh file...</b>', { parse_mode: "HTML" });

        console.log(`🔄 Updating: ${doc.file_name} (${doc.file_size} bytes)`);

        const fileBuffer = await downloadFile(doc.file_id);

        await bot.editMessageText('⏳ <b>File terunduh, menyimpan...</b>', {
            chat_id: chatId,
            message_id: statusMsg.message_id,
            parse_mode: "HTML"
        });

        const tempPath = path.join(TEMP_DIR, `update_${Date.now()}.xlsx`);
        fs.writeFileSync(tempPath, fileBuffer);
        console.log(`💾 Saved: ${tempPath}`);

        await bot.editMessageText('⏳ <b>Memproses data Excel...</b>', {
            chat_id: chatId,
            message_id: statusMsg.message_id,
            parse_mode: "HTML"
        });

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

        await bot.editMessageText(`⏳ <b>Backup data lama (${dataStore.data?.length || 0} data)...</b>`, {
            chat_id: chatId,
            message_id: statusMsg.message_id,
            parse_mode: "HTML"
        });

        const oldData = dataStore;
        const backupFile = `./backup_data_${Date.now()}.json`;
        fs.writeFileSync(backupFile, JSON.stringify(oldData, null, 2));
        console.log(`💾 Backup saved: ${backupFile}`);

        await bot.editMessageText(`⏳ <b>Menyimpan ${result.total} data baru...</b>`, {
            chat_id: chatId,
            message_id: statusMsg.message_id,
            parse_mode: "HTML"
        });

                // 🔥 RESTORE data terjual ke data baru
        for (const row of result.data) {
            const soldItem = soldStore.items.find(s => s.jsNumber === row.jsNumber);
            if (soldItem) {
                row.sold = true;
                row.soldTo = soldItem.soldTo;
                row.soldAt = soldItem.soldAt;
                row.transactionId = soldItem.transactionId;
                row.buyerUsername = soldItem.buyerUsername;
            }
        }

        dataStore = {
            data: result.data,
            total: result.total,
            updatedAt: new Date().toISOString(),
            fileName: doc.file_name,
            previousFile: oldData?.fileName || '-',
            previousTotal: oldData?.data?.length || 0
        };
        saveJSON(DATA_FILE, dataStore);

        let summary = `✅ <b>DATA BERHASIL DIUPDATE!</b>\n\n`;
        summary += `📄 File Baru: ${doc.file_name}\n`;
        summary += `📊 Total Data Baru: ${result.total}\n`;
        summary += `📄 File Lama: ${oldData?.fileName || '-'}\n`;
        summary += `📊 Data Lama: ${oldData?.data?.length || 0}\n`;
        summary += `📈 Selisih: ${result.total - (oldData?.data?.length || 0)} data\n\n`;
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
    } finally {
        processingFiles.delete(fileKey);
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
        text += `├ ABH ${String(item.jsNumber).padStart(2, '0')} | ${item.Kabupaten} | ${status}\n`;
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

    const item = data.find(d => d.jsNumber === num);

    if (!item) {
        await bot.sendMessage(chatId, `❌ Data ABH ${String(num).padStart(3, '0')} tidak ditemukan!`);
        delete buySessions[chatId];
        return;
    }

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

    const discountResult = discountModule.applyDiscount(harga, chatId, users);
    const displayPrice = discountResult.finalPrice;
    const discountPercent = discountResult.discountPercent;
    const discountAmount = discountResult.discountAmount;

    let caption = item.formatted;
    caption += `

━━━━━━━━━━━━━━━━━━━
💵 <b>HARGA ASLI: Rp${formatRupiah(harga)}</b>
`;

    if (discountPercent > 0) {
        caption += `🎯 <b>DISKON ${discountPercent}%</b>
├ 💰 Potongan: -Rp${formatRupiah(discountAmount)}
└ 💵 <b>HARGA JUAL: Rp${formatRupiah(displayPrice)}</b>
`;
    } else {
        caption += `💵 <b>HARGA JUAL: Rp${formatRupiah(displayPrice)}</b>
`;
    }

    await bot.sendMessage(chatId, caption, {
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [{ text: `🛒 TAMBAH TROLI`, callback_data: `cart_add_${num}` }],
                [{ text: `💰 BELI Rp${formatRupiah(displayPrice)}`, callback_data: `buy_confirm_${num}` }]
            ]
        }
    });

    delete buySessions[chatId];
};

// ============================
// 🔥 PROSES PEMBAYARAN SUKSES (AUTO)
// ============================
const processPaymentSuccess = async (chatId, userId, result, session) => {
    try {
        if (qrisMessageIds[chatId]) {
            try {
                await bot.deleteMessage(chatId, qrisMessageIds[chatId]);
                console.log(`🗑️ QRIS auto-deleted for ${chatId}`);
            } catch (e) {}
            delete qrisMessageIds[chatId];
        }

        if (global.autoCheckIntervals && global.autoCheckIntervals[chatId]) {
            clearInterval(global.autoCheckIntervals[chatId]);
            delete global.autoCheckIntervals[chatId];
        }

        const username = users[userId]?.username || 'Unknown';
        const transactionId = session.transactionId;

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

                // 🔥 SIMPAN PERMANEN
                saveSoldItem(c.jsNumber, c.item, userId, username, transactionId, c.harga);
            }
            saveJSON(DATA_FILE, dataStore);

            // 🔥 TAMBAH PENDAPATAN
            addRevenue(session.amount, transactionId, userId, items.length);

            for (const c of items) {
                await bot.sendMessage(chatId, c.fullFormatted || c.formatted, { parse_mode: "HTML" });
            }

            delete cartSessions[chatId];
            delete cartTotalSessions[chatId];

            let successMsg = `
✅ <b>PEMBAYARAN BERHASIL!</b>
━━━━━━━━━━━━━━━━━━━━

🛒 <b>Total Data:</b> ${items.length} data
`;

            if (session.discountPercent > 0) {
                successMsg += `
💵 <b>Subtotal:</b> Rp${formatRupiah(session.subtotal)}
🎯 <b>Diskon ${session.discountPercent}%:</b> -Rp${formatRupiah(session.discountAmount)}
💵 <b>Total Bayar:</b> Rp${formatRupiah(session.amount)}
`;
            } else {
                successMsg += `💵 <b>Total Bayar:</b> Rp${formatRupiah(session.amount)}
`;
            }

            successMsg += `
🆔 <b>Transaksi:</b> ${transactionId}
📅 <b>Tanggal:</b> ${new Date().toLocaleString('id-ID')}

📌 Semua data telah disimpan di riwayat pembelian Anda.
📌 Data dapat diakses melalui menu "👤 Akun" → "📜 Riwayat Beli"

━━━━━━━━━━━━━━━━━━━━
🙏 Terima kasih telah membeli data ABH!
👑 Owner: @AbahKonoha
`;

            await bot.sendMessage(chatId, successMsg, {
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
                    finalPrice: session.amount / items.length,
                    discountPercent: session.discountPercent || 0,
                    transactionId: transactionId
                });
            }
            saveJSON(USERS_FILE, users);

            if (items.length > 0) {
    const firstItem = items[0];
    await sendNotification(
        firstItem.jsNumber,
        firstItem.item,
        userId,
        username,
        transactionId,
        firstItem.harga,
        true,
        items.length,
        items  // 🔥 KIRIM SEMUA ITEMS UNTUK EXCEL
    );
}

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

            // 🔥 SIMPAN PERMANEN
            saveSoldItem(abhNumber, item, userId, username, transactionId, session.amount);

            // 🔥 TAMBAH PENDAPATAN
            addRevenue(session.amount, transactionId, userId, 1);

            await sendNotification(
    abhNumber,
    item,
    userId,
    username,
    transactionId,
    session.amount,
    false,
    1,
    [{
        jsNumber: abhNumber,
        item: item,
        harga: session.amount
    }]  // 🔥 BUNGKUS JADI ARRAY
);

            await bot.sendMessage(chatId, fullData, { parse_mode: "HTML" });

            let successMsg = `
✅ <b>PEMBAYARAN BERHASIL!</b>
━━━━━━━━━━━━━━━━━━━━

`;

            if (session.discountPercent > 0) {
                successMsg += `
💵 <b>Harga Asli:</b> Rp${formatRupiah(session.originalPrice)}
🎯 <b>Diskon ${session.discountPercent}%:</b> -Rp${formatRupiah(session.discountAmount)}
💵 <b>Total Bayar:</b> Rp${formatRupiah(session.amount)}
`;
            } else {
                successMsg += `💵 <b>Harga:</b> Rp${formatRupiah(session.amount)}
`;
            }

            successMsg += `
🆔 <b>Transaksi:</b> ${transactionId}
📅 <b>Tanggal:</b> ${new Date().toLocaleString('id-ID')}

📌 Data telah disimpan di riwayat pembelian Anda.
📌 Data dapat diakses kembali melalui menu "👤 Akun" → "📜 Riwayat Beli"

━━━━━━━━━━━━━━━━━━━━
🙏 Terima kasih telah membeli data ABH!
👑 Owner: @AbahKonoha
`;

            await bot.sendMessage(chatId, successMsg, {
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
                price: session.originalPrice || session.amount,
                finalPrice: session.amount,
                discountPercent: session.discountPercent || 0,
                transactionId: transactionId
            });
            saveJSON(USERS_FILE, users);
        }

        delete paymentSessions[chatId];

    } catch (error) {
        console.error('❌ processPaymentSuccess error:', error.message);
    }
};

// ===== HANDLE NIK ke No HP =====
const handleNikToHp = async (bot, chatId, nik) => {
    const cleanNik = nik.replace(/\D/g, '');
    if (cleanNik.length < 10) {
        await bot.sendMessage(chatId, `
❌ <b>NIK tidak valid!</b>

📌 NIK harus minimal 10 digit angka.
📌 Contoh: <code>3273021203890001</code>

💡 Ketik ulang NIK atau klik BATAL.
`, {
            parse_mode: "HTML",
            reply_markup: {
                keyboard: [['❌ BATAL'], ['🔙 KEMBALI KE MENU']],
                resize_keyboard: true,
                one_time_keyboard: false
            }
        });
        return;
    }

    const LAYANAN_KEYBOARD = [
        ['📱 NIK ke No HP', '👤 No HP ke NIK'],
        ['📋 Nama ke NIK'],
        ['🔙 KEMBALI KE MENU']
    ];

    await bot.sendMessage(chatId, `
╭ ───┈ " 🚧 " ── ⬦ ׁ
├  <b>FITUR SEDANG DALAM PENGEMBANGAN</b>
╰─┈꯭─꯭──꯭─꯭─꯭──꯭─╌─꯭─꯭─꯭─꯭──꯭──꯭

📱 <b>NIK ke No HP</b>
━━━━━━━━━━━━━━━━━━━━

🔧 Fitur ini sedang dalam tahap pengembangan.

📌 <b>Informasi:</b>
├ 📱 NIK: <code>${cleanNik}</code>
├ ⏳ Status: <b>COMING SOON</b>
└ 🔄 Silakan cek secara berkala

💡 <b>Tips:</b>
├ Fitur akan segera hadir!
└ Pantau terus channel untuk update

━━━━━━━━━━━━━━━━━━━━
📌 Klik tombol di bawah untuk kembali
`, {
        parse_mode: "HTML",
        reply_markup: {
            keyboard: LAYANAN_KEYBOARD,
            resize_keyboard: true,
            one_time_keyboard: false
        }
    });

    delete global.layananSessions[chatId];
};

// ===== HANDLE No HP ke NIK =====
const handleHpToNik = async (bot, chatId, noHp) => {
    const cleanHp = noHp.replace(/\D/g, '');
    if (cleanHp.length < 9) {
        await bot.sendMessage(chatId, `
❌ <b>Nomor HP tidak valid!</b>

📌 Nomor HP harus minimal 9 digit angka.
📌 Contoh: <code>08123456789</code>

💡 Ketik ulang nomor HP atau klik BATAL.
`, {
            parse_mode: "HTML",
            reply_markup: {
                keyboard: [['❌ BATAL'], ['🔙 KEMBALI KE MENU']],
                resize_keyboard: true,
                one_time_keyboard: false
            }
        });
        return;
    }

    const LAYANAN_KEYBOARD = [
        ['📱 NIK ke No HP', '👤 No HP ke NIK'],
        ['📋 Nama ke NIK'],
        ['🔙 KEMBALI KE MENU']
    ];

    await bot.sendMessage(chatId, `
╭ ───┈ " 🚧 " ── ⬦ ׁ
├  <b>FITUR SEDANG DALAM PENGEMBANGAN</b>
╰─┈꯭─꯭──꯭─꯭─꯭──꯭─╌─꯭─꯭─꯭─꯭──꯭──꯭

👤 <b>No HP ke NIK</b>
━━━━━━━━━━━━━━━━━━━━

🔧 Fitur ini sedang dalam tahap pengembangan.

📌 <b>Informasi:</b>
├ 📞 No HP: <code>${cleanHp}</code>
├ ⏳ Status: <b>COMING SOON</b>
└ 🔄 Silakan cek secara berkala

💡 <b>Tips:</b>
├ Fitur akan segera hadir!
└ Pantau terus channel untuk update

━━━━━━━━━━━━━━━━━━━━
📌 Klik tombol di bawah untuk kembali
`, {
        parse_mode: "HTML",
        reply_markup: {
            keyboard: LAYANAN_KEYBOARD,
            resize_keyboard: true,
            one_time_keyboard: false
        }
    });

    delete global.layananSessions[chatId];
};

// ===== HANDLE Nama ke NIK =====
const handleNamaToNik = async (bot, chatId, nama) => {
    if (nama.length < 2) {
        await bot.sendMessage(chatId, `
❌ <b>Nama terlalu pendek!</b>

📌 Nama harus minimal 2 karakter.
📌 Contoh: <code>Budi</code>

💡 Ketik ulang nama atau klik BATAL.
`, {
            parse_mode: "HTML",
            reply_markup: {
                keyboard: [['❌ BATAL'], ['🔙 KEMBALI KE MENU']],
                resize_keyboard: true,
                one_time_keyboard: false
            }
        });
        return;
    }

    const LAYANAN_KEYBOARD = [
        ['📱 NIK ke No HP', '👤 No HP ke NIK'],
        ['📋 Nama ke NIK'],
        ['🔙 KEMBALI KE MENU']
    ];

    await bot.sendMessage(chatId, `
╭ ───┈ " 🚧 " ── ⬦ ׁ
├  <b>FITUR SEDANG DALAM PENGEMBANGAN</b>
╰─┈꯭─꯭──꯭─꯭─꯭──꯭─╌─꯭─꯭─꯭─꯭──꯭──꯭

📋 <b>Nama ke NIK</b>
━━━━━━━━━━━━━━━━━━━━

🔧 Fitur ini sedang dalam tahap pengembangan.

📌 <b>Informasi:</b>
├ 👤 Nama: <code>${nama}</code>
├ ⏳ Status: <b>COMING SOON</b>
└ 🔄 Silakan cek secara berkala

💡 <b>Tips:</b>
├ Fitur akan segera hadir!
└ Pantau terus channel untuk update

━━━━━━━━━━━━━━━━━━━━
📌 Klik tombol di bawah untuk kembali
`, {
        parse_mode: "HTML",
        reply_markup: {
            keyboard: LAYANAN_KEYBOARD,
            resize_keyboard: true,
            one_time_keyboard: false
        }
    });

    delete global.layananSessions[chatId];
};

// ===== FUNGSI PENCARIAN DATA LAYANAN =====
const cariDataLayanan = async (chatId, keyword, type) => {
    const dummyData = [
        { nik: '3273021203890001', noHp: '08123456789', nama: 'Budi Santoso' },
        { nik: '3273021203890002', noHp: '08123456788', nama: 'Ani Wijaya' },
        { nik: '3273021203890003', noHp: '08123456787', nama: 'Joko Prasetyo' },
    ];

    let found = false;
    let result = { found: false };

    if (type === 'nik') {
        const data = dummyData.find(d => d.nik === keyword);
        if (data) {
            found = true;
            result = { found: true, ...data };
        }
    } else if (type === 'hp') {
        const data = dummyData.find(d => d.noHp === keyword);
        if (data) {
            found = true;
            result = { found: true, ...data };
        }
    } else if (type === 'nama') {
        const list = dummyData.filter(d => d.nama.toLowerCase().includes(keyword.toLowerCase()));
        if (list.length > 0) {
            found = true;
            result = { found: true, list: list, ...list[0] };
        }
    }

    return result;
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
        const discountHandled = await discountModule.handleDiscountCommands(bot, msg);
        if (discountHandled) {
            console.log(`✅ [DISCOUNT] Command ditangani oleh discount handler`);
            return;
        }
    } catch (err) {
        console.log(`❌ [DISCOUNT] Error: ${err.message}`);
    }

    try {
        const broadcastHandled = await broadcast.handleBroadcastMessage(bot, msg);
        if (broadcastHandled) {
            console.log(`✅ [BROADCAST] Pesan ditangani oleh broadcast handler`);
            return;
        }
    } catch (err) {
        console.log(`❌ [BROADCAST] Error: ${err.message}`);
    }

    // ===== HANDLE SET AUTO DISKON =====
    if (buySessions[chatId] && buySessions[chatId].mode === 'discount_set_auto') {
        if (userId !== OWNER_ID) {
            cleanupSessions(chatId);
            await bot.sendMessage(chatId, '❌ Khusus Owner!');
            return;
        }

        const input = text.trim();
        const parts = input.split('|').map(s => s.trim());

        if (parts.length < 2) {
            cleanupSessions(chatId);
            await bot.sendMessage(chatId, '❌ Format salah! Gunakan: <code>persen|min_pembelian</code>', { parse_mode: "HTML" });
            return;
        }

        const percent = parseInt(parts[0]);
        const minPurchase = parseInt(parts[1]);

        if (isNaN(percent) || percent < 1 || percent > 100) {
            cleanupSessions(chatId);
            await bot.sendMessage(chatId, '❌ Persen harus antara 1-100!');
            return;
        }

        if (isNaN(minPurchase) || minPurchase < 1) {
            cleanupSessions(chatId);
            await bot.sendMessage(chatId, '❌ Minimal pembelian harus lebih dari 0!');
            return;
        }

        const result = discountModule.setAutoDiscountConfig(percent, minPurchase);

        await bot.sendMessage(chatId, `
✅ <b>KONFIGURASI DISKON OTOMATIS DIUPDATE!</b>

⚙️ <b>Config Baru:</b>
├ Status: ${result.data.autoDiscount ? '✅ AKTIF' : '❌ NONAKTIF'}
├ Diskon: ${result.data.autoDiscountPercent}%
└ Syarat: ${result.data.autoDiscountMinPurchase}x pembelian

📅 ${new Date().toLocaleString('id-ID')}
    `, { parse_mode: "HTML" });

        cleanupSessions(chatId);
        await showDiskonMenu(bot, chatId);
        return;
    }

    // ===== HANDLE DISKON MANUAL ADD =====
    if (buySessions[chatId] && buySessions[chatId].mode === 'discount_manual_add') {
        if (userId !== OWNER_ID) {
            cleanupSessions(chatId);
            await bot.sendMessage(chatId, '❌ Khusus Owner!');
            return;
        }

        const input = text.trim();

        let targetUserId, percent, label;

        if (input.includes('|')) {
            const parts = input.split('|').map(s => s.trim());
            targetUserId = parts[0];
            percent = parseInt(parts[1]);
            label = parts[2] ? parts[2].trim() : `Diskon ${percent}%`;
        } else {
            const match = input.match(/^(\d+)\s*(\d+)%?$/);
            if (!match) {
                cleanupSessions(chatId);
                await bot.sendMessage(chatId, `
❌ <b>Format salah!</b>

Gunakan format simpel:
<code>user_id 20</code> atau <code>user_id 20%</code>

📋 <b>Contoh:</b>
<code>8714776841 20</code>
<code>8714776841 20%</code>
<code>123456789 10</code>

📌 Akan otomatis jadi "Diskon 20%"
`, { parse_mode: "HTML" });
                return;
            }

            targetUserId = match[1];
            percent = parseInt(match[2]);
            label = `Diskon ${percent}%`;
        }

        if (!targetUserId || isNaN(parseInt(targetUserId))) {
            cleanupSessions(chatId);
            await bot.sendMessage(chatId, '❌ User ID tidak valid! Masukkan ID numerik.');
            return;
        }

        if (isNaN(percent) || percent < 1 || percent > 100) {
            cleanupSessions(chatId);
            await bot.sendMessage(chatId, '❌ Persen harus antara 1-100!');
            return;
        }

        const targetUser = users[targetUserId];
        if (!targetUser) {
            cleanupSessions(chatId);
            await bot.sendMessage(chatId, `
⚠️ <b>User dengan ID ${targetUserId} belum terdaftar!</b>
💡 Pastikan user sudah pernah menggunakan bot ini.
        `, { parse_mode: "HTML" });
            return;
        }

        const result = discountModule.addManualDiscount(targetUserId, percent, label);

        if (result.success) {
            await bot.sendMessage(chatId, `
✅ <b>DISKON MANUAL BERHASIL DITAMBAHKAN!</b>

👤 <b>User:</b> @${targetUser.username || 'no_username'} (${targetUserId})
🎯 <b>Diskon:</b> ${percent}%
🏷️ <b>Label:</b> ${label}
📅 <b>Diberikan:</b> ${new Date().toLocaleString('id-ID')}

📌 Diskon akan otomatis terpakai saat user membeli data ABH.
        `, { parse_mode: "HTML" });
        } else {
            await bot.sendMessage(chatId, `
❌ <b>Gagal menambahkan diskon!</b>
${result.error || 'Terjadi kesalahan tidak diketahui.'}
        `, { parse_mode: "HTML" });
        }

        cleanupSessions(chatId);
        await showDiskonMenu(bot, chatId);
        return;
    }

    if (text === '🎯 Cek Diskon') {
        await showCekDiskon(bot, chatId, userId);
        return;
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

        const fileKey = `${chatId}_${doc.file_id}`;
        if (processingFiles.has(fileKey)) {
            await bot.sendMessage(chatId, `⏳ File ${doc.file_name} sedang diproses, mohon tunggu...`);
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

    if (text === '🔄 Start Ulang') {
        try {
            await bot.sendMessage(chatId, '🔄', {
                reply_markup: { remove_keyboard: true }
            });
        } catch (e) {}

        await showMenu(bot, chatId, users);
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

    // ===== LAYANAN LAINNYA =====
    if (text === '📦 Layanan Lainnya') {
        const { showLayananLainnya } = require('./menu.js');
        await showLayananLainnya(bot, chatId);
        return;
    }

    if (text === '🔙 KEMBALI KE MENU') {
        if (global.layananSessions) {
            delete global.layananSessions[chatId];
        }
        await showMenu(bot, chatId, users);
        return;
    }

    // ===== LAYANAN: NIK ke No HP =====
    if (text === '📱 NIK ke No HP') {
        if (!global.layananSessions) global.layananSessions = {};
        global.layananSessions[chatId] = { mode: 'nik_to_hp' };

        await bot.sendMessage(chatId, `
📱 <b>NIK ke No HP</b>
━━━━━━━━━━━━━━━━━━━━

📌 Masukkan NIK yang ingin dicari.
📌 Contoh: <code>3273021203890001</code>

📌 Ketik <code>batal</code> untuk membatalkan.
`, {
            parse_mode: "HTML",
            reply_markup: {
                keyboard: [['❌ BATAL'], ['🔙 KEMBALI KE MENU']],
                resize_keyboard: true,
                one_time_keyboard: false
            }
        });
        return;
    }

    // ===== LAYANAN: No HP ke NIK =====
    if (text === '👤 No HP ke NIK') {
        if (!global.layananSessions) global.layananSessions = {};
        global.layananSessions[chatId] = { mode: 'hp_to_nik' };

        await bot.sendMessage(chatId, `
👤 <b>No HP ke NIK</b>
━━━━━━━━━━━━━━━━━━━━

📌 Masukkan nomor HP yang ingin dicari.
📌 Contoh: <code>08123456789</code>

📌 Ketik <code>batal</code> untuk membatalkan.
`, {
            parse_mode: "HTML",
            reply_markup: {
                keyboard: [['❌ BATAL'], ['🔙 KEMBALI KE MENU']],
                resize_keyboard: true,
                one_time_keyboard: false
            }
        });
        return;
    }

    // ===== LAYANAN: Nama ke NIK =====
    if (text === '📋 Nama ke NIK') {
        if (!global.layananSessions) global.layananSessions = {};
        global.layananSessions[chatId] = { mode: 'nama_to_nik' };

        await bot.sendMessage(chatId, `
📋 <b>Nama ke NIK</b>
━━━━━━━━━━━━━━━━━━━━

📌 Masukkan Nama yang ingin dicari.
📌 Contoh: <code>Budi Santoso</code>

📌 Ketik <code>batal</code> untuk membatalkan.
`, {
            parse_mode: "HTML",
            reply_markup: {
                keyboard: [['❌ BATAL'], ['🔙 KEMBALI KE MENU']],
                resize_keyboard: true,
                one_time_keyboard: false
            }
        });
        return;
    }

    // ===== HANDLE LAYANAN INPUT =====
    if (global.layananSessions && global.layananSessions[chatId]) {
        const session = global.layananSessions[chatId];

        if (text === '❌ BATAL' || text.toLowerCase() === 'batal') {
            delete global.layananSessions[chatId];
            const { showLayananLainnya } = require('./menu.js');
            await showLayananLainnya(bot, chatId);
            return;
        }

        if (text === '🔙 KEMBALI KE MENU') {
            delete global.layananSessions[chatId];
            const { showLayananLainnya } = require('./menu.js');
            await showLayananLainnya(bot, chatId);
            return;
        }

        const keyword = text.trim();

        if (session.mode === 'nik_to_hp') {
            await handleNikToHp(bot, chatId, keyword);
            return;
        }

        if (session.mode === 'hp_to_nik') {
            await handleHpToNik(bot, chatId, keyword);
            return;
        }

        if (session.mode === 'nama_to_nik') {
            await handleNamaToNik(bot, chatId, keyword);
            return;
        }
    }

    // ===== LIST STOK DATA =====
    if (text === '📋 List Stok Data') {
        const { showListStokData } = require('./menu.js');
        await showListStokData(bot, chatId);
        return;
    }

    if (text === '♲ Refresh') {
        users = loadJSON(USERS_FILE);
        await bot.sendMessage(chatId, "✅ Status direfresh!");
        setTimeout(() => showMenu(bot, chatId, users), 1000);
        return;
    }

    // ===== MENU DISKON (OWNER ONLY) =====
    if (text === '🎯 Diskon') {
        if (userId !== OWNER_ID) {
            await bot.sendMessage(chatId, '❌ <b>Khusus Owner!</b>', { parse_mode: "HTML" });
            return;
        }
        await showDiskonMenu(bot, chatId);
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

        const num = parseInt(keyword);
        if (!isNaN(num) && num > 0) {
            if (searchSessions[chatId].mode === 'add_to_cart') {
                await addToCart(chatId, num);
                delete searchSessions[chatId];
                return;
            }
            await showDataDetail(chatId, num, true);
            delete searchSessions[chatId];
            return;
        }

        delete searchSessions[chatId].waitingSearch;
        await searchByKabupaten(chatId, keyword, 0);
        return;
    }

    // ===== TOMBOL BACKUP =====
    if (text === '💾 Backup') {
        if (userId !== OWNER_ID) {
            await bot.sendMessage(chatId, '❌ <b>Khusus Owner!</b>', { parse_mode: "HTML" });
            return;
        }

        const backups = await backupModule.listBackups();
        let textMsg = `
💾 <b>BACKUP DATA</b>
━━━━━━━━━━━━━━━━━━━━

📌 <b>Perintah:</b>
├ <code>/backup</code> - Backup semua file
├ <code>/listbackup</code> - Lihat daftar backup
└ <code>/restore [nama_file]</code> - Restore backup

━━━━━━━━━━━━━━━━━━━━
📋 <b>Backup Tersimpan (${backups.length})</b>
`;

        if (backups.length === 0) {
            textMsg += `❌ Belum ada backup`;
        } else {
            for (let i = 0; i < Math.min(backups.length, 5); i++) {
                const b = backups[i];
                textMsg += `\n${i+1}. ${b.name}\n   📦 ${b.sizeFormatted} | 📅 ${b.createdFormatted}`;
            }
            if (backups.length > 5) {
                textMsg += `\n└ ... dan ${backups.length - 5} lainnya`;
            }
        }

        textMsg += `
━━━━━━━━━━━━━━━━━━━━
📌 Klik tombol di bawah:
`;

        await bot.sendMessage(chatId, textMsg, {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "💾 Backup Now", callback_data: "backup_now" }],
                    [{ text: "📋 List Backup", callback_data: "backup_list" }],
                    [{ text: "🔙 KEMBALI KE MENU", callback_data: "back_to_main" }]
                ]
            }
        });
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
            // 🔥 Ambil dari file permanen
            const soldData = getTotalSold();
            const availableData = totalData - soldData;
            const totalRevenue = getTotalRevenue();
            const lastUpload = dataStore.uploadedAt || '-';
            const fileName = dataStore.fileName || '-';

            const discountStats = discountModule.getDiscountStats();

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
🎯 <b>STATISTIK DISKON</b>
├ Auto Diskon: ${discountStats.autoDiscount ? '✅ AKTIF' : '❌ NONAKTIF'}
├ Diskon: ${discountStats.autoDiscountPercent}%
├ Syarat: ${discountStats.autoDiscountMinPurchase}x
├ User Eligible: ${discountStats.totalAutoEligible}
└ Diskon Manual Aktif: ${discountStats.totalManualActive}

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

    // ===== BACK TO MAIN =====
    if (data === "back_to_main") {
        cleanupSessions(chatId);
        console.log(`🔙 [BACK] User ${userId} kembali ke menu`);
        try {
            try {
                await bot.deleteMessage(chatId, q.message.message_id);
            } catch (e) {}
            await showMenu(bot, chatId, users);
        } catch (err) {
            console.log(`❌ Error back_to_main: ${err.message}`);
            await bot.sendMessage(chatId, "❌ Gagal kembali ke menu. Ketik /menu");
        }
        return;
    }

    // ===== BACK TO SEARCH =====
    if (data === "back_to_search") {
        const session = searchSessions[chatId];
        if (session && session.results && session.results.length > 0) {
            try {
                await bot.deleteMessage(chatId, q.message.message_id);
            } catch (e) {}
            await renderSearchPage(chatId, session.page || 0);
        } else {
            cleanupSessions(chatId);
            await bot.sendMessage(chatId, "❌ Session pencarian habis. Silakan cari ulang.", {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🔙 KEMBALI KE MENU", callback_data: "back_to_main" }]
                    ]
                }
            });
        }
        return;
    }

    // ===== HANDLE LIST STOK PAGINATION =====
    if (data.startsWith("liststok_page_") || data === "liststok_info" || data === "search_from_list" || data === "liststok_refresh") {
        const { handleListStokCallback } = require('./menu.js');
        const handled = await handleListStokCallback(bot, q);
        if (handled) return;
    }

    // ===== CANCEL SEARCH =====
    if (data === "cancel_search") {
        cleanupSessions(chatId);
        await bot.sendMessage(chatId, "❌ Pencarian dibatalkan.", {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🔙 KEMBALI KE MENU", callback_data: "back_to_main" }]
                ]
            }
        });
        return;
    }

    // ===== DETAIL DATA VIA TOMBOL ANGKA =====
    if (data.startsWith("detail_")) {
        const num = parseInt(data.replace("detail_", ""));
        await showDataDetail(chatId, num, true);
        return;
    }

    // ===== SEARCH PAGE NAVIGATION =====
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

    // ===== BROADCAST CALLBACK =====
    if (data === "broadcast_text" || data === "broadcast_photo" ||
        data === "broadcast_video" || data === "broadcast_tag_toggle" ||
        data === "broadcast_reply" || data === "broadcast_skip_reply" ||
        data === "broadcast_confirm" || data === "broadcast_send" ||
        data === "broadcast_cancel" || data === "broadcast_history") {

        await broadcast.handleBroadcastCallback(bot, q);
        return;
    }

    if (data === "discount_manual_add") {
        if (userId !== OWNER_ID) {
            cleanupSessions(chatId);
            await bot.sendMessage(chatId, '❌ Khusus Owner!');
            return;
        }

        await bot.sendMessage(chatId, `
➕ <b>TAMBAH DISKON MANUAL</b>

Kirim pesan dengan format:
<code>user_id persen</code>

📋 <b>Contoh:</b>
<code>8714776841 20</code>  → Diskon 20%
<code>123456789 10</code>   → Diskon 10%

📌 Bisa juga pakai <code>%</code>:
<code>8714776841 20%</code>

📌 Untuk label khusus, pakai <code>|</code>:
<code>8714776841|20|Diskon Spesial</code>

📌 Kirim sekarang!
    `, { parse_mode: "HTML" });

        buySessions[chatId] = { mode: 'discount_manual_add' };
        return;
    }

    // Diskon remove
    if (data === "discount_remove") {
        if (userId !== OWNER_ID) {
            await bot.sendMessage(chatId, '❌ Khusus Owner!');
            return;
        }

        const discounts = discountModule.loadDiscounts();
        const usersData = discountModule.loadUsers();
        let textMsg = `❌ <b>HAPUS DISKON USER</b>\n\n`;
        textMsg += `📋 Daftar user dengan diskon aktif:\n`;

        const activeUsers = Object.keys(discounts.users).filter(id => discounts.users[id].active !== false);
        if (activeUsers.length === 0) {
            textMsg += `❌ Tidak ada user dengan diskon aktif`;
            await bot.sendMessage(chatId, textMsg, { parse_mode: "HTML" });
            return;
        }

        const keyboard = [];
        for (const id of activeUsers) {
            const d = discounts.users[id];
            const userData = usersData[id] || {};
            const username = userData.username || 'Unknown';
            keyboard.push([{
                text: `❌ ${username} (${d.percent}%)`,
                callback_data: `discount_remove_${id}`
            }]);
        }
        keyboard.push([{ text: "🔙 KEMBALI", callback_data: "discount_back" }]);

        await bot.sendMessage(chatId, textMsg, {
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: keyboard }
        });
        return;
    }

    // Eksekusi hapus diskon
    if (data.startsWith("discount_remove_")) {
        if (userId !== OWNER_ID) {
            await bot.sendMessage(chatId, '❌ Khusus Owner!');
            return;
        }

        const targetId = data.replace("discount_remove_", "");
        const result = discountModule.removeManualDiscount(targetId);

        if (result.success) {
            await bot.sendMessage(chatId, `✅ Diskon untuk user ${targetId} telah dihapus!`);
        } else {
            await bot.sendMessage(chatId, `❌ ${result.error}`);
        }

        await showDiskonMenu(bot, chatId);
        return;
    }

    // Diskon auto toggle
    if (data === "discount_auto_toggle") {
        if (userId !== OWNER_ID) {
            await bot.sendMessage(chatId, '❌ Khusus Owner!');
            return;
        }

        const discountConfig = discountModule.loadDiscounts();
        const isAutoEnabled = discountConfig.autoDiscount !== false;

        await bot.sendMessage(chatId, `
⚙️ <b>ATUR DISKON OTOMATIS</b>

🎯 Diskon otomatis diberikan kepada user yang telah melakukan ${discountConfig.autoDiscountMinPurchase || 5}x pembelian.

📌 <b>Status saat ini:</b> ${isAutoEnabled ? '✅ AKTIF' : '❌ NONAKTIF'}
📌 <b>Diskon:</b> ${discountConfig.autoDiscountPercent || 10}% dari total pembelian
📌 <b>Syarat:</b> ${discountConfig.autoDiscountMinPurchase || 5}x pembelian

Pilih aksi:
    `, {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [{ text: isAutoEnabled ? "❌ Nonaktifkan" : "✅ Aktifkan", callback_data: `discount_auto_${isAutoEnabled ? 'off' : 'on'}` }],
                    [{ text: "🔙 KEMBALI", callback_data: "discount_back" }]
                ]
            }
        });
        return;
    }

    // Toggle auto diskon
    if (data.startsWith("discount_auto_")) {
        if (userId !== OWNER_ID) {
            await bot.sendMessage(chatId, '❌ Khusus Owner!');
            return;
        }

        const action = data.replace("discount_auto_", "");
        const status = action === 'on';
        const result = discountModule.toggleAutoDiscount(status);

        await bot.sendMessage(chatId, `
⚙️ <b>DISKON OTOMATIS</b>
${result.status === 'activated' ? '✅ Diaktifkan' : '❌ Dinonaktifkan'}

📌 Status: ${result.status === 'activated' ? 'AKTIF' : 'NONAKTIF'}
📅 ${new Date().toLocaleString('id-ID')}
        `, { parse_mode: "HTML" });

        await showDiskonMenu(bot, chatId);
        return;
    }

    // List diskon
    if (data === "discount_list") {
        if (userId !== OWNER_ID) {
            await bot.sendMessage(chatId, '❌ Khusus Owner!');
            return;
        }

        const allDiscounts = discountModule.getAllDiscounts();
        const usersData = discountModule.loadUsers();

        let textMsg = `
📊 <b>SEMUA DISKON</b>
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
        return;
    }

    // ===== SET AUTO DISKON =====
    if (data === "discount_set_auto") {
        if (userId !== OWNER_ID) {
            cleanupSessions(chatId);
            await bot.sendMessage(chatId, '❌ Khusus Owner!');
            return;
        }

        const discountConfig = discountModule.loadDiscounts();
        const isAutoEnabled = discountConfig.autoDiscount !== false;

        await bot.sendMessage(chatId, `
🔧 <b>SET DISKON OTOMATIS</b>

📌 <b>Status saat ini:</b> ${isAutoEnabled ? '✅ AKTIF' : '❌ NONAKTIF'}
📌 <b>Diskon:</b> ${discountConfig.autoDiscountPercent || 10}%
📌 <b>Syarat:</b> ${discountConfig.autoDiscountMinPurchase || 5}x pembelian

━━━━━━━━━━━━━━━━━━━━
📌 Kirim pesan dengan format:
<code>persen|min_pembelian</code>

📋 <b>Contoh:</b>
<code>20|5</code> → Diskon 20% setelah 5x pembelian
<code>10|3</code> → Diskon 10% setelah 3x pembelian
<code>2|5</code> → Diskon 2% setelah 5x pembelian

📌 <b>Keterangan:</b>
├ persen: 1-100
└ min_pembelian: minimal berapa kali beli

📌 Kirim sekarang!
    `, {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: isAutoEnabled ? "❌ Nonaktifkan Auto Diskon" : "✅ Aktifkan Auto Diskon",
                            callback_data: `discount_auto_${isAutoEnabled ? 'off' : 'on'}`
                        }
                    ],
                    [{ text: "❌ BATAL", callback_data: "discount_set_auto_cancel" }],
                    [{ text: "🔙 KEMBALI KE MENU DISKON", callback_data: "discount_back" }]
                ]
            }
        });

        buySessions[chatId] = { mode: 'discount_set_auto' };
        return;
    }

    // ===== BATAL SET AUTO DISKON =====
    if (data === "discount_set_auto_cancel") {
        cleanupSessions(chatId);
        try {
            await bot.deleteMessage(chatId, q.message.message_id);
        } catch (e) {}
        await showDiskonMenu(bot, chatId);
        return;
    }

    // Kembali ke menu diskon
    if (data === "discount_back") {
        await showDiskonMenu(bot, chatId);
        return;
    }

    // ===== CEK DISKON CALLBACK =====
    if (data === "cek_diskon") {
        try {
            await bot.deleteMessage(chatId, q.message.message_id);
        } catch (e) {}
        await showCekDiskon(bot, chatId, userId);
        return;
    }

    // ===== BUY CANCEL =====
    if (data === "buy_cancel") {
        console.log(`❌ [CANCEL] User ${userId} membatalkan pembelian`);

        if (qrisMessageIds[chatId]) {
            try {
                await bot.deleteMessage(chatId, qrisMessageIds[chatId]);
                console.log(`🗑️ QRIS dihapus untuk chat ${chatId}`);
            } catch (e) {
                console.log(`⚠️ Gagal hapus QRIS: ${e.message}`);
            }
            delete qrisMessageIds[chatId];
        }

        cleanupSessions(chatId);
        delete paymentSessions[chatId];

        if (global.autoCheckIntervals && global.autoCheckIntervals[chatId]) {
            clearInterval(global.autoCheckIntervals[chatId]);
            delete global.autoCheckIntervals[chatId];
        }

        await showMenu(bot, chatId, users);
        return;
    }

    // ===== BACKUP CALLBACKS =====
    if (data === "backup_now") {
        if (userId !== OWNER_ID) {
            await bot.sendMessage(chatId, '❌ Khusus Owner!');
            return;
        }

        try {
            await bot.deleteMessage(chatId, q.message.message_id);
        } catch (e) {}

        const result = await backupModule.createBackup(chatId, bot);

        await bot.sendDocument(chatId, result.path, {
            caption: `
✅ <b>BACKUP BERHASIL!</b>

📁 Nama: ${result.name}.zip
📦 Ukuran: ${backupModule.formatSize(result.size)}
📅 Tanggal: ${new Date().toLocaleString('id-ID')}

📋 <b>File yang di-backup:</b>
${result.files.map(f => `├ ${f}`).join('\n')}
`,
            parse_mode: "HTML"
        });
        return;
    }

    if (data === "backup_list") {
        if (userId !== OWNER_ID) {
            await bot.sendMessage(chatId, '❌ Khusus Owner!');
            return;
        }

        try {
            await bot.deleteMessage(chatId, q.message.message_id);
        } catch (e) {}

        const backups = await backupModule.listBackups();
        let textMsg = `
📋 <b>DAFTAR BACKUP</b>
━━━━━━━━━━━━━━━━━━━━

📊 Total: ${backups.length} backup
`;

        if (backups.length === 0) {
            textMsg += `\n❌ Belum ada backup.\n\n📌 Buat backup dengan <code>/backup</code>`;
        } else {
            for (let i = 0; i < Math.min(backups.length, 10); i++) {
                const b = backups[i];
                textMsg += `
${i+1}. 📁 ${b.name}
   📦 ${b.sizeFormatted}
   📅 ${b.createdFormatted}
`;
            }
            if (backups.length > 10) {
                textMsg += `\n└ ... dan ${backups.length - 10} lainnya`;
            }
        }

        await bot.sendMessage(chatId, textMsg, { parse_mode: "HTML" });
        return;
    }

    // ===== BUY CONFIRM =====
    if (data.startsWith("buy_confirm_")) {
        const num = parseInt(data.replace("buy_confirm_", ""));
        await generatePaymentQRIS(chatId, userId, num);
        return;
    }

    // ===== CHECK PAYMENT =====
    if (data.startsWith("check_payment_")) {
        const transactionId = data.replace("check_payment_", "");
        await checkPaymentStatus(chatId, userId, transactionId);
        return;
    }

    // ===== CART CALLBACKS =====
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

    // ===== CART SEARCH & ADD =====
    if (data === "cart_search_add") {
        try {
            await bot.deleteMessage(chatId, q.message.message_id);
        } catch (e) {}

        await bot.sendMessage(chatId, `
🔍 <b>CARI DATA UNTUK TAMBAH KE TROLI</b>

📌 Masukkan nama Kabupaten/Kota yang ingin dicari.
📌 Contoh: Aceh Utara, Medan, Jakarta

📌 Atau kirim langsung <b>NOMOR ABH</b> (contoh: 5)

💡 Klik tombol di bawah untuk batal:
    `, {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "❌ BATAL", callback_data: "cart_cancel_add" }]
                ]
            }
        });

        searchSessions[chatId] = {
            waitingSearch: true,
            mode: 'add_to_cart'
        };
        return;
    }

    // ===== CART CANCEL ADD =====
    if (data === "cart_cancel_add") {
        cleanupSessions(chatId);
        try {
            await bot.deleteMessage(chatId, q.message.message_id);
        } catch (e) {}
        await bot.sendMessage(chatId, "❌ Penambahan data dibatalkan.", {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🔙 KEMBALI KE MENU", callback_data: "back_to_main" }]
                ]
            }
        });
        return;
    }

    if (data === "cart_add_more") {
        try {
            await bot.deleteMessage(chatId, q.message.message_id);
        } catch (e) {}

        await bot.sendMessage(chatId, `
🔍 <b>TAMBAH DATA KE TROLI</b>

📌 Kirim <b>NOMOR ABH</b> yang ingin ditambahkan.
📌 Contoh: <code>7</code> untuk tambah ABH 007

📌 Atau ketik <b>NAMA KABUPATEN</b> untuk mencari.

💡 Klik tombol di bawah untuk batal:
    `, {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "❌ BATAL", callback_data: "cart_cancel_add" }]
                ]
            }
        });

        searchSessions[chatId] = {
            waitingSearch: true,
            mode: 'add_to_cart'
        };
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