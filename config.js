// ==========================================
// 🔥 CONFIG.JS - FULL CONFIGURATION
// ==========================================

module.exports = {
  // ============================
  // 🤖 BOT CONFIG
  // ============================
  BOT: {
    TOKEN: process.env.BOT_TOKEN || "8859610854:AAGwMdEfjG7v6YM1UgCEmd6Hp5BWXbPCwRc",
    OWNER_ID: Number(process.env.OWNER_ID || "8677011932")
  },
  
  // ============================
  // 🔥 PAYMENT AUTOGOPAY
  // ============================
  AUTOGOPAY: {
    ENABLED: true,
    API_URL: "https://v1-gateway.autogopay.site",
    API_KEY: "agp_84944d4c7b14cf80eb23a154fa9e6c200b0297068ee9478abd1d8a3d9a5a82f0",
    TIMEOUT: 30000,
  },

  // ============================
  // 🔥🔥🔥 NOTIFIKASI KE OWNER & CHANNEL
  // ============================
  NOTIFICATION: {
    BOT_TOKEN: "TOKEN-BOT",
    CHAT_ID: true,
    ENABLED: true,
    SEND_TO_OWNER: true,
  }
};