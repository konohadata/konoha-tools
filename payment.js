// payment.js - ROUTER DUAL PAYMENT DENGAN RATE LIMIT HANDLING + FILTER WAKTU

const autogopay = require('./payment_autogopay.js');
const config = require('./config');

// ============================
// 🔥 KONFIGURASI
// ============================
const TOPUP_CONFIG = config.TOPUP || {};
const IS_DEV = process.env.NODE_ENV === 'development';

// ============================
// 🔥 HELPERS
// ============================
const log = (msg, ...args) => console.log(`🔍 [PAYMENT] ${msg}`, ...args);
const warn = (msg, ...args) => console.warn(`⚠️ [PAYMENT] ${msg}`, ...args);
const error = (msg, ...args) => console.error(`❌ [PAYMENT] ${msg}`, ...args);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ============================
// 🔥 GENERATE QRIS
// ============================
const generateQRIS = async (amount, description = '') => {
    log(`Generating QRIS for Rp${amount}...`);
    
    // 🔥 COBA AUTOGOPAY DULU
    const result = await autogopay.generateQRIS(amount, description);
    if (result.success) {
        log(`✅ AutoGopay success: ${result.transaction_id}`);
        return result;
    }
    
    // 🔥 FALLBACK KE ORDERKUOTA
    if (TOPUP_CONFIG.FALLBACK_AUTO !== false) {
        warn(`AutoGopay failed, trying OrderKuota...`);
        const fallback = await orderkuota.generateQRIS(amount);
        if (fallback.success) {
            log(`✅ OrderKuota fallback success: ${fallback.transaction_id}`);
            return { ...fallback, fallback: true };
        }
        warn(`OrderKuota fallback failed: ${fallback.error}`);
        return fallback;
    }
    
    return result;
};

const generateQRISAutogopay = async (amount, description = '') => {
    return autogopay.generateQRIS(amount, description);
};

const generateQRISOrderkuota = async (amount) => {
    return orderkuota.generateQRIS(amount);
};

// ============================
// 🔥 CEK STATUS DUAL
// ============================
const cekStatusDual = async (transactionId, amount, method, startTime = null) => {
    log(`Checking: ${transactionId}, method: ${method || 'auto'}, startTime: ${startTime || 'auto'}`);
    
    try {
        // 🔥 METHOD DITENTUKAN
        if (method === 'AUTOGOPAY') {
            return await cekAutogopay(transactionId);
        }
        
        if (method === 'ORDERKUOTA') {
            return await cekOrderkuota(transactionId, amount, startTime);
        }
        
        // 🔥 AUTO: CEK KEDUA
        return await cekAuto(transactionId, amount, startTime);
        
    } catch (err) {
        error(`Dual check error: ${err.message}`);
        return await fallbackError(transactionId, err.message);
    }
};

// ============================
// 🔥 CEK AUTOGOPAY
// ============================
const cekAutogopay = async (transactionId) => {
    const result = await autogopay.cekStatus(transactionId);
    return {
        ...result,
        method: 'AUTOGOPAY',
        source: 'autogopay'
    };
};

// ============================
// 🔥 CEK ORDERKUOTA
// ============================
const cekOrderkuota = async (transactionId, amount, startTime) => {
    const result = await orderkuota.cekStatus(amount, startTime);
    
    // 🔥 BLOCKED
    if (result.blocked) {
        warn(`OrderKuota blocked, fallback to AutoGopay`);
        const fallback = await autogopay.cekStatus(transactionId);
        if (isSuccess(fallback)) {
            return { ...fallback, method: 'AUTOGOPAY', source: 'fallback' };
        }
        return {
            success: true,
            status: 'pending',
            method: 'none',
            note: 'OrderKuota blocked',
            source: 'blocked'
        };
    }
    
    // 🔥 RATE LIMIT
    if (result.rateLimit) {
        warn(`OrderKuota rate limited, fallback to AutoGopay`);
        const fallback = await autogopay.cekStatus(transactionId);
        if (isSuccess(fallback)) {
            return { ...fallback, method: 'AUTOGOPAY', source: 'fallback' };
        }
        return {
            success: true,
            status: 'pending',
            method: 'none',
            rateLimit: true,
            note: 'OrderKuota rate limited',
            source: 'rate_limited'
        };
    }
    
    // 🔥 SUCCESS
    if (result.success && result.matched) {
        log(`✅ OrderKuota found!`);
        return { ...result, method: 'ORDERKUOTA', source: 'orderkuota' };
    }
    
    // 🔥 PENDING
    return { ...result, method: 'ORDERKUOTA', source: 'orderkuota' };
};

// ============================
// 🔥 CEK AUTO (BOTH METHODS)
// ============================
const cekAuto = async (transactionId, amount, startTime) => {
    log(`Auto mode: checking both methods...`);
    
    // 🔥 CEK AUTOGOPAY
    const result1 = await autogopay.cekStatus(transactionId);
    log(`AutoGopay: ${result1.status}`);
    
    if (isSuccess(result1)) {
        log(`✅ Found via AutoGopay`);
        return { ...result1, method: 'AUTOGOPAY', source: 'autogopay' };
    }
    
    // 🔥 CEK ORDERKUOTA
    const result2 = await orderkuota.cekStatus(amount, startTime);
    log(`OrderKuota: ${result2.status || 'pending'}`);
    
    // 🔥 ORDERKUOTA ISSUE
    if (result2.blocked || result2.rateLimit) {
        const issue = result2.blocked ? 'blocked' : 'rate limited';
        warn(`OrderKuota ${issue}, using AutoGopay result`);
        return {
            success: true,
            status: result1.status || 'pending',
            method: 'AUTOGOPAY',
            note: `OrderKuota ${issue}`,
            source: 'fallback'
        };
    }
    
    // 🔥 ORDERKUOTA SUCCESS
    if (result2.success && result2.matched) {
        log(`✅ Found via OrderKuota: Rp${result2.amount}`);
        return { ...result2, method: 'ORDERKUOTA', source: 'orderkuota' };
    }
    
    // 🔥 BOTH PENDING
    return {
        success: true,
        status: 'pending',
        method: 'none',
        autogopay: result1,
        orderkuota: result2,
        source: 'pending'
    };
};

// ============================
// 🔥 FALLBACK ERROR
// ============================
const fallbackError = async (transactionId, errorMsg) => {
    try {
        const fallback = await autogopay.cekStatus(transactionId);
        if (fallback.success) {
            return { ...fallback, method: 'AUTOGOPAY', source: 'error_fallback' };
        }
    } catch {
        // Ignore
    }
    
    return {
        success: false,
        status: 'error',
        method: 'none',
        error: errorMsg,
        source: 'error'
    };
};

// ============================
// 🔥 HELPER: IS SUCCESS
// ============================
const isSuccess = (result) => {
    return result?.success && (result.status === 'settlement' || result.status === 'success');
};

// ============================
// 🔥 CEK STATUS AUTOGOPAY
// ============================
const cekStatusAutogopay = async (transactionId) => {
    return autogopay.cekStatus(transactionId);
};

// ============================
// 🔥 CEK STATUS ORDERKUOTA
// ============================
const cekStatusOrderkuota = async (amount, startTime = null) => {
    const result = await orderkuota.cekStatus(amount, startTime);
    
    if (result.blocked) {
        return { ...result, status: 'blocked', note: 'OrderKuota blocked' };
    }
    
    if (result.rateLimit) {
        return { ...result, status: 'rate_limited', note: 'OrderKuota rate limited' };
    }
    
    return result;
};

// ============================
// 🔥 CEK STATUS DUAL DENGAN RETRY
// ============================
const cekStatusDualWithRetry = async (transactionId, amount, method, startTime = null, maxRetry = 3) => {
    let lastResult = null;
    
    for (let i = 0; i < maxRetry; i++) {
        log(`Check attempt ${i + 1}/${maxRetry}`);
        
        const result = await cekStatusDual(transactionId, amount, method, startTime);
        lastResult = result;
        
        // 🔥 SUCCESS
        if (isSuccess(result)) {
            log(`✅ Success on attempt ${i + 1}`);
            return result;
        }
        
        // 🔥 ERROR FATAL
        if (result.status === 'error') {
            return result;
        }
        
        // 🔥 RATE LIMIT -> TUNGGU
        if (result.rateLimit) {
            const wait = 5000 * (i + 1);
            log(`Rate limit, tunggu ${wait/1000} detik...`);
            await sleep(wait);
            continue;
        }
        
        // 🔥 PENDING -> TUNGGU SEBENTAR
        if (i < maxRetry - 1) {
            await sleep(3000);
        }
    }
    
    return lastResult || {
        success: false,
        status: 'error',
        error: 'Max retry exceeded',
        method: 'none',
        source: 'timeout'
    };
};

// ============================
// 🔥 GET STATUS
// ============================
const getStatus = () => ({
    autogopay: {
        available: true,
        source: 'payment_autogopay'
    },
    orderkuota: {
        available: !!config.ORDERKUOTA?.ENABLED,
        source: 'payment_orderkuota'
    },
    fallback: TOPUP_CONFIG.FALLBACK_AUTO !== false,
    dualCheck: TOPUP_CONFIG.DUAL_CHECK !== false,
    environment: process.env.NODE_ENV || 'development'
});

// ============================
// 🔥 EXPORT
// ============================
module.exports = {
    generateQRIS,
    generateQRISAutogopay,
    generateQRISOrderkuota,
    cekStatusDual,
    cekStatusAutogopay,
    cekStatusOrderkuota,
    cekStatusDualWithRetry,
    getStatus,
};