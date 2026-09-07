// ============================
// DATA_PROCESSOR.JS
// ============================

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// ============================
// PARSE SALDO
// ============================
const parseSaldo = (str) => {
    if (!str) return 0;
    if (typeof str === 'number') return Math.floor(str);
    const clean = String(str).replace(/[^\d]/g, '');
    return parseInt(clean) || 0;
};

// ============================
// FORMAT RUPIAH
// ============================
const formatRupiah = (val) => {
    if (!val) return '0';
    return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

// ============================
// GET 2 DIGIT AWAL KPJ
// ============================
const getKpjDuaDigit = (kpj) => {
    if (!kpj) return '-';
    const clean = String(kpj).replace(/\D/g, '');
    if (clean.length === 0) return '-';
    return clean.substring(0, 2);
};

// ============================
// GET JUMLAH KARTU DISPLAY
// ============================
const getJumlahKartuDisplay = (jml) => {
    const num = parseInt(jml) || 1;
    if (num <= 1) return 'TUNGGAL';
    return num - 1;
};

// ============================
// GET TAHUN DARI TTL
// ============================
const getTahun = (ttl) => {
    if (!ttl) return '-';
    const match = String(ttl).match(/\d{4}/);
    return match ? match[0] : '-';
};

// ============================
// GET TAHUN DARI IURAN
// ============================
const getTahunIuran = (iuran) => {
    if (!iuran) return '-';
    const match = String(iuran).match(/\d{4}/);
    return match ? match[0] : '-';
};

// ============================
// FORMAT JENIS KELAMIN
// ============================
const formatJK = (jk) => {
    if (!jk) return '-';
    const upper = jk.toUpperCase();
    if (upper.includes('LAKI') || upper.includes('L')) return 'L';
    if (upper.includes('PEREMPUAN') || upper.includes('P')) return 'P';
    return jk;
};

// ============================
// FORMAT LASIK
// ============================
const formatLasik = (lasik) => {
    if (!lasik) return '⚠️ BELUM DILAKUKAN';
    const upper = lasik.toUpperCase();
    if (upper.includes('GO JMO') || upper.includes('SUDAH')) return '✅ SUDAH';
    if (upper.includes('BELUM')) return '⚠️ BELUM';
    return lasik;
};

// ============================
// BUILD OUTPUT TEXT (FORMAT ABH)
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

// ============================
// PROSES FILE EXCEL
// ============================
const processExcel = async (filePath) => {
    try {
        console.log(`📊 Processing Excel: ${filePath}`);
        
        const workbook = XLSX.readFile(filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: "", header: 1 });
        
        const headers = jsonData[0] || [];
        console.log('📋 HEADER:', headers);
        
        // Cari index kolom
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
        console.log('  - Kabupaten:', idxKabupaten);
        console.log('  - Kecamatan:', idxKecamatan);
        console.log('  - Kelurahan:', idxKelurahan);
        console.log('  - KPJ:', idxKPJ);
        console.log('  - Harga:', idxHarga);
        
        // Ambil data rows
        let rows = [];
        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (!row || row.length === 0) continue;
            const isEmpty = row.every(cell => !cell || String(cell).trim() === '');
            if (isEmpty) continue;
            rows.push(row);
        }
        
        if (!rows.length) throw new Error('Data kosong!');
        
        console.log(`📊 Total data: ${rows.length} baris`);
        
        const results = [];
        let jsCounter = 1;
        
        for (const row of rows) {
            const getVal = (idx) => {
                if (idx === -1 || idx >= row.length) return '';
                return String(row[idx] || '').trim();
            };
            
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
                Harga: parseInt(getVal(idxHarga)) || 5000 // Default 5rb
            };
            
            const formatted = buildOutputText(obj, jsCounter);
            results.push({
                ...obj,
                jsNumber: jsCounter,
                formatted: formatted,
                harga: obj.Harga
            });
            
            jsCounter++;
        }
        
        return {
            success: true,
            data: results,
            total: results.length,
            filePath: filePath
        };
        
    } catch (error) {
        console.error('❌ Error processing Excel:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
};

// ============================
// DELETE FILE TEMP
// ============================
const deleteTempFile = (filePath) => {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`🗑️ Deleted temp file: ${filePath}`);
        }
    } catch (error) {
        console.log(`⚠️ Failed to delete temp file: ${error.message}`);
    }
};

module.exports = {
    processExcel,
    buildOutputText,
    deleteTempFile,
    parseSaldo,
    formatRupiah,
    getKpjDuaDigit,
    getJumlahKartuDisplay,
    formatJK,
    formatLasik
};