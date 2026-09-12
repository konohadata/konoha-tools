// ============================
// PAYMENT.JS - AUTOGOPAY ONLY
// ============================

const config = require('./config');

// ============================
// 🔥 KONFIGURASI
// ============================
const IS_DEV = process.env.NODE_ENV === 'development';
const MAINTENANCE_MODE = false;

// ============================
// 🔥 HELPERS
// ============================
const log = (msg, ...args) => console.log(`🔍 [PAYMENT] ${msg}`, ...args);
const warn = (msg, ...args) => console.warn(`⚠️ [PAYMENT] ${msg}`, ...args);
const error = (msg, ...args) => console.error(`❌ [PAYMENT] ${msg}`, ...args);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ============================
// 🔥 LAZY REQUIRE AUTOGOPAY
// ============================
const getAutogopay = () => require('./payment_autogopay.js');

// ============================
// 🔥 GENERATE QRIS
// ============================
const generateQRIS = async (amount, description = '') => {
    log(`Generate QRIS untuk Rp${amount} - ${description}`);

    if (MAINTENANCE_MODE) {
        return {
            success: false,
            error: 'MAINTENANCE',
            message: '⚠️ QRIS sedang dalam maintenance!'
        };
    }

    try {
        const autogopay = getAutogopay();
        const result = await autogopay.generateQRIS(amount, description);

        if (result.success) {
            log(`✅ AutoGoPay berhasil: ${result.transaction_id}`);
            result.method = 'AUTOGOPAY';
            return result;
        }

        warn(`AutoGoPay gagal: ${result.error || 'unknown'}`);
        return {
            success: false,
            error: result.error || 'Gagal generate QRIS'
        };

    } catch (err) {
        error(`AutoGoPay error: ${err.message}`);
        return {
            success: false,
            error: err.message || 'Gagal generate QRIS'
        };
    }
};

// ============================
// 🔥 GENERATE QRIS AUTOGOPAY (EXPORT)
// ============================
const generateQRISAutogopay = async (amount, description = '') => {
    return generateQRIS(amount, description);
};

// ============================
// 🔥 CEK STATUS
// ============================
const cekStatusDual = async (transactionId, amount, method, startTime = null) => {
    log(`Cek status: ${transactionId} via AUTOGOPAY`);

    if (MAINTENANCE_MODE) {
        return {
            success: false,
            status: 'maintenance',
            method: 'none',
            source: 'maintenance',
            error: '⚠️ QRIS sedang dalam maintenance!'
        };
    }

    try {
        const autogopay = getAutogopay();
        const result = await autogopay.cekStatus(transactionId);

        if (result && (result.matched ||
            ['settlement', 'success', 'paid'].includes(result.status))) {
            log(`✅ AutoGoPay menemukan pembayaran!`);
            return {
                ...result,
                matched: true,
                method: 'AUTOGOPAY',
                source: 'autogopay'
            };
        }

        return result || {
            success: false,
            status: 'pending',
            matched: false,
            method: 'AUTOGOPAY',
            error: 'Pembayaran belum ditemukan'
        };

    } catch (err) {
        error(`Cek status error: ${err.message}`);
        return {
            success: false,
            status: 'error',
            matched: false,
            method: 'AUTOGOPAY',
            error: err.message
        };
    }
};

// ============================
// 🔥 CEK STATUS DENGAN RETRY
// ============================
const cekStatusDualWithRetry = async (transactionId, amount, method, startTime = null, maxRetry = 10) => {
    log(`Cek status with retry: ${transactionId}`);

    if (MAINTENANCE_MODE) {
        return {
            success: false,
            status: 'maintenance',
            method: 'none',
            source: 'maintenance',
            error: '⚠️ QRIS sedang dalam maintenance!',
            retryCount: 0
        };
    }

    const autogopay = getAutogopay();
    let lastResult = null;

    for (let i = 0; i < maxRetry; i++) {
        log(`🔄 Cek attempt ${i + 1}/${maxRetry} via AUTOGOPAY`);

        try {
            const result = await autogopay.cekStatus(transactionId);
            lastResult = result;

            if (result && (result.matched ||
                ['settlement', 'success', 'paid'].includes(result.status))) {
                log(`✅ AutoGoPay payment found!`);
                return {
                    ...result,
                    matched: true,
                    method: 'AUTOGOPAY',
                    source: 'autogopay'
                };
            }

            if (result && result.status === 'pending') {
                log(`⏳ AutoGoPay masih pending, menunggu...`);
            }

        } catch (err) {
            log(`⚠️ AutoGoPay retry ${i + 1} error: ${err.message}`);
        }

        if (i < maxRetry - 1) {
            await sleep(3000);
        }
    }

    return lastResult || {
        success: false,
        status: 'pending',
        matched: false,
        method: 'AUTOGOPAY',
        error: 'Waktu cek habis, silakan cek manual'
    };
};

// ============================
// 🔥 CEK STATUS AUTOGOPAY (EXPORT)
// ============================
const cekStatusAutogopay = async (transactionId) => {
    try {
        const autogopay = getAutogopay();
        return await autogopay.cekStatus(transactionId);
    } catch (err) {
        return {
            success: false,
            status: 'error',
            method: 'AUTOGOPAY',
            error: err.message
        };
    }
};

// ============================
// 🔥 GET STATUS
// ============================
const getStatus = () => ({
    autogopay: {
        available: !MAINTENANCE_MODE,
        source: 'payment_autogopay'
    },
    maintenance: MAINTENANCE_MODE,
    environment: process.env.NODE_ENV || 'development',
    message: MAINTENANCE_MODE
        ? '⚠️ QRIS sedang dalam maintenance!'
        : '✅ Sistem QRIS aktif'
});

// ============================
// 🔥 EXPORT
// ============================
module.exports = {
    generateQRIS,
    generateQRISAutogopay,
    cekStatusDual,
    cekStatusAutogopay,
    cekStatusDualWithRetry,
    getStatus,
    METHODS: {
        AUTOGOPAY: 'AUTOGOPAY'
    }
};