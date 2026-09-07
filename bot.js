// ============================
// BOT.JS - ABH DATA STORE (TANPA MENU)
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
// IMPORT MENU
// ============================
const { showMenu, showAkun, showBantuan, isOwner } = require('./menu.js');
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
                Harga: hargaFinal
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
// 🔍 FUNGSI SEARCH KABUPATEN
// ============================
const searchByKabupaten = async (chatId, keyword) => {
    const data = dataStore.data || [];
    
    if (data.length === 0) {
        await bot.sendMessage(chatId, '📋 Belum ada data. Upload file Excel dulu!');
        return;
    }
    
    const searchLower = keyword.toLowerCase().trim();
    const results = data.filter(item => 
        item.Kabupaten.toLowerCase().includes(searchLower) ||
        item.Kecamatan.toLowerCase().includes(searchLower) ||
        item.Kelurahan.toLowerCase().includes(searchLower)
    );
    
    if (results.length === 0) {
        await bot.sendMessage(chatId, `
❌ <b>TIDAK DITEMUKAN!</b>

🔍 Keyword: "${keyword}"

💡 Coba gunakan kata kunci lain:
├ Cari berdasarkan Kabupaten
├ Cari berdasarkan Kecamatan
└ Cari berdasarkan Kelurahan

📌 Contoh: Aceh, Medan, Jakarta, Surabaya
        `, { parse_mode: "HTML" });
        return;
    }
    
    let total = results.length;
    let sent = 0;
    
    await bot.sendMessage(chatId, `
🔍 <b>HASIL PENCARIAN: ${keyword.toUpperCase()}</b>
━━━━━━━━━━━━━━━━━━━━
📊 Ditemukan: ${total} data

⏳ Mengirim data satu per satu...
    `, { parse_mode: "HTML" });
    
    for (const item of results) {
        sent++;
        const harga = item.harga || 5000;
        
        const caption = `
${item.formatted}

━━━━━━━━━━━━━━━━━━━
📌 <b>Data ${sent} dari ${total}</b>
💵 <b>HARGA: Rp${formatRupiah(harga)}</b>

📌 Klik tombol di bawah untuk membeli data ini.
`;

        await bot.sendMessage(chatId, caption, {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [{ text: `💰 BELI (Rp${formatRupiah(harga)})`, callback_data: `buy_confirm_${item.jsNumber}` }],
                    [{ text: "⏭️ LEWATI", callback_data: `skip_data_${item.jsNumber}` }]
                ]
            }
        });
        
        await new Promise(r => setTimeout(r, 500));
    }
    
    await bot.sendMessage(chatId, `
✅ <b>SEMUA DATA ${keyword.toUpperCase()} TELAH DITAMPILKAN!</b>

📊 Total: ${total} data

💡 Klik "BELI" pada data yang diinginkan.
👑 Owner: @Kjsstore_own
    `, { parse_mode: "HTML" });
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
👑 Owner: @Kjsstore_own
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

👑 Owner: @Kjsstore_own
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
                } catch (e) {
                    console.log(`⚠️ Gagal hapus QRIS: ${e.message}`);
                }
                delete qrisMessageIds[chatId];
            }
            
            try {
                await bot.deleteMessage(chatId, statusMsg.message_id);
            } catch (e) {}
            
            const item = session.data;
            const fullData = session.fullData || item.formatted;
            
            await bot.sendMessage(chatId, `
${fullData}

━━━━━━━━━━━━━━━━━━━
✅ <b>PEMBAYARAN BERHASIL!</b>
💵 <b>HARGA: Rp${formatRupiah(session.amount)}</b>
🆔 Transaksi: ${transactionId}
📅 ${new Date().toLocaleString('id-ID')}

📌 Data telah disimpan di riwayat pembelian Anda.
`, { parse_mode: "HTML" });
            
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
👑 Owner: @Kjsstore_own
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
👑 Owner: @Kjsstore_own
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
    
    let text = `📋 <b>DAFTAR DATA ABH</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    text += `📊 Total: ${data.length} data\n\n`;
    
    const show = data.slice(0, 20);
    for (const item of show) {
        text += `├ ABH ${String(item.jsNumber).padStart(3, '0')} | ${item.Kabupaten} | Rp${formatRupiah(item.harga)}\n`;
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
    const harga = item.harga || 5000;
    
    const caption = `
${item.formatted}

━━━━━━━━━━━━━━━━━━━
💵 <b>HARGA: Rp${formatRupiah(harga)}</b>

📌 Klik tombol BELI untuk melanjutkan ke pembayaran.
`;

    await bot.sendMessage(chatId, caption, {
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [{ text: `💰 BELI (Rp${formatRupiah(harga)})`, callback_data: `buy_confirm_${num}` }],
                [{ text: "❌ BATAL", callback_data: "buy_cancel" }]
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
    
    // ===== 🔥 HANDLE BROADCAST INPUT =====
try {
    const broadcastHandled = await broadcast.handleBroadcastMessage(bot, msg);
    if (broadcastHandled) {
        console.log(`✅ [BROADCAST] Pesan ditangani oleh broadcast handler`);
        return;
    }
} catch (err) {
    console.log(`❌ [BROADCAST] Error: ${err.message}`);
}

    // ===== HANDLE UPLOAD/UPDATE EXCEL (OWNER ONLY) =====
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

    // ===== HANDLE /start ATAU /menu - HANYA SEKALI =====
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

    // REGISTER USER
    if (!users[userId] && userId !== OWNER_ID) {
        users[userId] = {
            id: userId,
            username: username,
            firstName: firstName,
            date: new Date().toISOString()
        };
        saveJSON(USERS_FILE, users);
    }

    // ===== HANDLE BUTTONS =====
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

    if (text === '♲ Refresh') {
        users = loadJSON(USERS_FILE);
        await bot.sendMessage(chatId, "✅ Status direfresh!");
        setTimeout(() => showMenu(bot, chatId, users), 1000);
        return;
    }

    // ===== 🔍 HANDLE SEARCH KABUPATEN =====
    if (text === '🔍 Cari Data') {
        await bot.sendMessage(chatId, `
🔍 <b>CARI DATA BERDASARKAN DAERAH</b>

Masukkan nama Kabupaten/Kota yang ingin dicari.

📌 Contoh:
├ Pesisir Selatan
├ Aceh Tengah
├ Medan
├ Jakarta
├ Surabaya

💡 Bisa juga cari berdasarkan Kecamatan atau Kelurahan.

📌 Ketik nama daerah sekarang.
        `, { parse_mode: "HTML" });
        searchSessions[chatId] = { waitingSearch: true };
        return;
    }

    // ===== HANDLE SEARCH INPUT =====
    if (searchSessions[chatId] && searchSessions[chatId].waitingSearch) {
        const keyword = text.trim();
        if (keyword.length < 2) {
            await bot.sendMessage(chatId, '❌ Minimal 2 karakter!');
            return;
        }
        delete searchSessions[chatId];
        await searchByKabupaten(chatId, keyword);
        return;
    }

    // ===== LIST DATA ABH (OWNER ONLY) =====
    if (text === '📊 List Data ABH') {
        if (userId !== OWNER_ID) {
            await bot.sendMessage(chatId, '❌ <b>Khusus Owner!</b>', { parse_mode: "HTML" });
            return;
        }
        await showDataList(chatId);
        return;
    }

    // ===== OWNER BUTTONS =====
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
            const lastUpload = dataStore.uploadedAt || '-';
            const fileName = dataStore.fileName || '-';
            
            await bot.sendMessage(chatId, `
📊 <b>STATISTIK BOT</b>
━━━━━━━━━━━━━━━━━━━━

👥 <b>Total User:</b> ${totalUsers}
📄 <b>Total Data ABH:</b> ${totalData}
📁 <b>File Terakhir:</b> ${fileName}
📅 <b>Upload Terakhir:</b> ${lastUpload}

━━━━━━━━━━━━━━━━━━━━
👑 <b>Owner ID:</b> ${OWNER_ID}
💾 <b>Memory:</b> ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB
            `, { parse_mode: "HTML" });
            return;
        }
    }

    // ===== HANDLE BELI DATA =====
    if (buySessions[chatId] && buySessions[chatId].waitingNumber) {
        const num = parseInt(text.trim());
        if (isNaN(num) || num < 1) {
            await bot.sendMessage(chatId, '❌ Masukkan nomor ABH yang valid! (contoh: 7)');
            return;
        }
        await handleBuyData(chatId, num);
        return;
    }

    // ===== OWNER BROADCAST COMMAND =====
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
    
    // ===== 🔥 1. BACK TO MAIN - PALING ATAS =====
    if (data === "back_to_main") {
        console.log(`🔙 [BACK] User ${userId} kembali ke menu`);
        try {
            // Hapus pesan sebelumnya
            try {
                await bot.deleteMessage(chatId, q.message.message_id);
            } catch (e) {
                console.log('Gagal hapus pesan:', e.message);
            }
            // Tampilkan menu
            await showMenu(bot, chatId, users);
        } catch (err) {
            console.log(`❌ Error back_to_main: ${err.message}`);
            await bot.sendMessage(chatId, "❌ Gagal kembali ke menu. Ketik /menu");
        }
        return;
    }
    
    // ===== 🔥 2. BROADCAST CALLBACK =====
    if (data === "broadcast_text" || data === "broadcast_photo" || 
        data === "broadcast_video" || data === "broadcast_tag_toggle" ||
        data === "broadcast_reply" || data === "broadcast_skip_reply" ||
        data === "broadcast_confirm" || data === "broadcast_send" ||
        data === "broadcast_cancel" || data === "broadcast_history") {
        
        await broadcast.handleBroadcastCallback(bot, q);
        return;
    }
    
    // ===== 🔥 3. BUY CANCEL =====
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
    
    // ===== 🔥 4. SKIP DATA =====
    if (data.startsWith("skip_data_")) {
        await bot.answerCallbackQuery(q.id, { 
            text: "⏭️ Data dilewati", 
            show_alert: false 
        });
        return;
    }
    
    // ===== 🔥 5. BUY CONFIRM =====
    if (data.startsWith("buy_confirm_")) {
        const num = parseInt(data.replace("buy_confirm_", ""));
        await generatePaymentQRIS(chatId, userId, num);
        return;
    }
    
    // ===== 🔥 6. CHECK PAYMENT =====
    if (data.startsWith("check_payment_")) {
        const transactionId = data.replace("check_payment_", "");
        await checkPaymentStatus(chatId, userId, transactionId);
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