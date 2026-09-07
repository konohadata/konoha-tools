// payment_autogopay.js - AUTOGOPAY DENGAN CREATED_AT

const axios = require('axios');
const config = require('./config');

const AUTOGOPAY_CONFIG = config.AUTOGOPAY || {};

// ============================
// GENERATE QRIS AUTOGOPAY
// ============================
const generateQRIS = async (amount, description = '') => {
    try {
        console.log(`💰 [AUTOGOPAY] Generating QRIS for Rp${amount}`);
        
        if (!AUTOGOPAY_CONFIG.ENABLED) {
            throw new Error("AutoGoPay dinonaktifkan di config");
        }
        
        const response = await axios.post(
            `${AUTOGOPAY_CONFIG.API_URL}/qris/generate`,
            { amount, description: description || 'Topup Coin' },
            {
                headers: {
                    'Authorization': `Bearer ${AUTOGOPAY_CONFIG.API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: AUTOGOPAY_CONFIG.TIMEOUT || 30000
            }
        );
        
        if (response.data?.success) {
            const data = response.data.data;
            const createdTime = Date.now();
            
            console.log(`✅ [AUTOGOPAY] QRIS Generated! ID: ${data.transaction_id}`);
            
            return {
                success: true,
                method: 'AUTOGOPAY',
                transaction_id: data.transaction_id,
                qr_url: data.qr_url,
                amount: data.amount || amount,
                amount_original: data.amount || amount,
                random_add: 0, // AutoGoPay tidak punya random add
                expiry_time: data.expiry_time || Date.now() + (15 * 60 * 1000),
                image_data: data.image_data || null,
                brand: 'AUTOGOPAY',
                merchant: data.merchant || 'AutoGoPay',
                created_at: createdTime, // 🔥 WAKTU QRIS DIBUAT
                // 🔥 INFORMASI TAMBAHAN
                display: {
                    harga: data.amount || amount,
                    kode_unik: 0,
                    total: data.amount || amount,
                }
            };
        }
        throw new Error(response.data?.message || 'Gagal generate QRIS AutoGoPay');
    } catch (error) {
        console.error('❌ [AUTOGOPAY] Error:', error.message);
        return { success: false, method: 'AUTOGOPAY', error: error.message };
    }
};

// ============================
// CEK STATUS AUTOGOPAY
// ============================
const cekStatus = async (transactionId) => {
    try {
        if (!AUTOGOPAY_CONFIG.ENABLED) {
            throw new Error("AutoGoPay dinonaktifkan di config");
        }
        
        console.log(`🔍 [AUTOGOPAY] Checking status for ${transactionId}...`);
        
        const response = await axios.post(
            `${AUTOGOPAY_CONFIG.API_URL}/qris/status`,
            { transaction_id: transactionId },
            {
                headers: {
                    'Authorization': `Bearer ${AUTOGOPAY_CONFIG.API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: AUTOGOPAY_CONFIG.TIMEOUT || 10000
            }
        );
        
        console.log(`📊 [AUTOGOPAY] Status: ${response.data?.data?.transaction_status || 'pending'}`);
        
        if (response.data?.success) {
            const status = response.data.data?.transaction_status || 'pending';
            const isSettlement = status === 'settlement' || status === 'success' || status === 'paid';
            
            if (isSettlement) {
                console.log(`✅ [AUTOGOPAY] Payment found!`);
            }
            
            return {
                success: true,
                status: status,
                method: 'AUTOGOPAY',
                brand: response.data.data?.brand || 'AUTOGOPAY',
                transaction: response.data.data,
                matched: isSettlement,
            };
        }
        return { 
            success: false, 
            status: 'pending', 
            method: 'AUTOGOPAY',
            matched: false,
            error: response.data?.message || 'Unknown error'
        };
    } catch (error) {
        console.error('❌ [AUTOGOPAY] Error:', error.message);
        return { 
            success: false, 
            status: 'pending', 
            method: 'AUTOGOPAY',
            matched: false,
            error: error.message
        };
    }
};

// ============================
// CEK STATUS DENGAN RETRY
// ============================
const cekStatusWithRetry = async (transactionId, maxRetry = 3) => {
    let lastError = null;
    
    for (let i = 0; i < maxRetry; i++) {
        console.log(`🔄 [AUTOGOPAY] Cek status attempt ${i + 1}/${maxRetry}`);
        
        const result = await cekStatus(transactionId);
        
        // Jika berhasil atau status settlement, return
        if (result.success || result.status === 'settlement' || result.status === 'success') {
            return result;
        }
        
        // Jika error, tunggu lalu retry
        if (!result.success && i < maxRetry - 1) {
            const waitTime = 3000 * (i + 1);
            console.log(`⏳ [AUTOGOPAY] Retry dalam ${waitTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        lastError = result.error;
    }
    
    return { 
        success: false, 
        status: 'error', 
        error: lastError || 'Max retry exceeded',
        method: 'AUTOGOPAY' 
    };
};

module.exports = {
    generateQRIS,
    cekStatus,
    cekStatusWithRetry,
};