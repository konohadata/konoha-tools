// ============================
// BROADCAST.JS - BROADCAST LENGKAP
// ============================

const fs = require('fs');
const path = require('path');

// ============================
// STATE BROADCAST PER USER
// ============================
const broadcastState = {};

// ============================
// LOAD USERS
// ============================
const loadUsers = () => {
    try {
        const USERS_FILE = "./users.json";
        if (fs.existsSync(USERS_FILE)) {
            const data = fs.readFileSync(USERS_FILE, 'utf8');
            return JSON.parse(data) || {};
        }
        return {};
    } catch (err) {
        console.log('❌ Load users error:', err.message);
        return {};
    }
};

// ============================
// SHOW BROADCAST MENU
// ============================
// ============================
// SHOW BROADCAST MENU
// ============================
const showBroadcastMenu = async (bot, chatId, userId) => {
    const users = loadUsers();
    const totalUsers = Object.keys(users).length;
    
    if (!broadcastState[userId]) {
        broadcastState[userId] = {
            text: null,
            photo: null,
            video: null,
            caption: null,
            tagAll: false,
            replyTo: null,
            mode: null
        };
    }
    
    const state = broadcastState[userId];
    const tagStatus = state.tagAll ? '✅ AKTIF' : '❌ NONAKTIF';
    
    const caption = `
📢 <b>BROADCAST CENTER</b>
━━━━━━━━━━━━━━━━━━━━

📊 <b>STATUS</b>
├ 👥 Total User: ${totalUsers}
├ 📝 Pesan: ${state.text ? '✅ Ada' : '❌ Kosong'}
├ 🖼️ Foto: ${state.photo ? '✅ Ada' : '❌ Kosong'}
├ 🎬 Video: ${state.video ? '✅ Ada' : '❌ Kosong'}
├ 🏷️ Tag All: ${tagStatus}
└ 📎 Reply: ${state.replyTo ? '✅ Ada' : '❌ Kosong'}

📌 <b>Pilih aksi di bawah:</b>
`;

    await bot.sendMessage(chatId, caption, {
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [{ text: "📝 KIRIM PESAN", callback_data: "broadcast_text" }],
                [{ text: "🖼️ KIRIM FOTO", callback_data: "broadcast_photo" }],
                [{ text: "🎬 KIRIM VIDEO", callback_data: "broadcast_video" }],
                [{ text: "🏷️ TAG ALL", callback_data: "broadcast_tag_toggle" }],
                [{ text: "📎 SEMAT PESAN", callback_data: "broadcast_reply" }],
                [{ text: "📊 KONFIRMASI KIRIM", callback_data: "broadcast_confirm" }],
                [{ text: "❌ BATAL", callback_data: "broadcast_cancel" }],
                // 🔥 TAMBAHKAN INI
                [{ text: "🔙 KEMBALI KE MENU", callback_data: "back_to_main" }]
            ]
        }
    });
};

// ============================
// HANDLE BROADCAST MESSAGE INPUT
// ============================
const handleBroadcastMessage = async (bot, msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const state = broadcastState[userId];
    
    if (!state) return false;
    
    // ===== HANDLE TEXT INPUT =====
    if (msg.text && state.mode === 'waiting_text') {
        const text = msg.text.trim();
        
        if (text.toLowerCase() === '/batal') {
            delete broadcastState[userId];
            await bot.sendMessage(chatId, "❌ Broadcast dibatalkan.");
            return true;
        }
        
        state.text = text;
        state.mode = 'idle';
        
        await bot.sendMessage(chatId, `
✅ <b>PESAN TERSIMPAN!</b>

📝 Preview:
${text}

📌 Kirim FOTO/VIDEO (optional) atau langsung konfirmasi.
        `, {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "📊 KONFIRMASI", callback_data: "broadcast_confirm" }],
                    [{ text: "📎 SEMAT PESAN", callback_data: "broadcast_reply" }],
                    [{ text: "❌ BATAL", callback_data: "broadcast_cancel" }]
                ]
            }
        });
        return true;
    }
    
    // ===== HANDLE PHOTO INPUT =====
    if (msg.photo && state.mode === 'waiting_photo') {
        const photoId = msg.photo[msg.photo.length - 1].file_id;
        const caption = msg.caption || '';
        
        state.photo = photoId;
        state.caption = caption;
        state.mode = 'idle';
        
        await bot.sendMessage(chatId, `
✅ <b>FOTO TERSIMPAN!</b>

🖼️ Foto siap dikirim
📝 Caption: ${caption || '(kosong)'}

📌 Kirim VIDEO (optional) atau langsung konfirmasi.
        `, {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "📊 KONFIRMASI", callback_data: "broadcast_confirm" }],
                    [{ text: "📎 SEMAT PESAN", callback_data: "broadcast_reply" }],
                    [{ text: "❌ BATAL", callback_data: "broadcast_cancel" }]
                ]
            }
        });
        return true;
    }
    
    // ===== HANDLE VIDEO INPUT =====
    if (msg.video && state.mode === 'waiting_video') {
        const videoId = msg.video.file_id;
        const caption = msg.caption || '';
        
        state.video = videoId;
        state.caption = caption || state.caption || '';
        state.mode = 'idle';
        
        await bot.sendMessage(chatId, `
✅ <b>VIDEO TERSIMPAN!</b>

🎬 Video siap dikirim
📝 Caption: ${caption || '(kosong)'}

📌 Langsung konfirmasi untuk mengirim.
        `, {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "📊 KONFIRMASI", callback_data: "broadcast_confirm" }],
                    [{ text: "📎 SEMAT PESAN", callback_data: "broadcast_reply" }],
                    [{ text: "❌ BATAL", callback_data: "broadcast_cancel" }]
                ]
            }
        });
        return true;
    }
    
    // ===== HANDLE REPLY (SEMATAN) =====
    if (state.mode === 'waiting_reply') {
        const replyTo = msg.reply_to_message;
        
        if (replyTo) {
            state.replyTo = replyTo.message_id;
            state.mode = 'idle';
            
            await bot.sendMessage(chatId, `
✅ <b>PESAN DISEMATKAN!</b>

📎 Reply ke pesan ID: ${replyTo.message_id}
📝 Preview: ${replyTo.text ? replyTo.text.substring(0, 100) : '(Media)'}

📌 Sekarang kirim konten broadcast (teks/foto/video).
            `, {
                parse_mode: "HTML",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "📊 KONFIRMASI", callback_data: "broadcast_confirm" }],
                        [{ text: "❌ BATAL", callback_data: "broadcast_cancel" }]
                    ]
                }
            });
        } else {
            await bot.sendMessage(chatId, `
❌ <b>BUKAN REPLY!</b>

📌 Caranya:
1. Tekan dan tahan pesan yang mau disemat
2. Pilih "Reply" atau "Balas"
3. Kirim sebagai reply ke pesan ini
            `, {
                parse_mode: "HTML",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "⏭️ SKIP SEMATAN", callback_data: "broadcast_skip_reply" }],
                        [{ text: "❌ BATAL", callback_data: "broadcast_cancel" }]
                    ]
                }
            });
        }
        return true;
    }
    
    return false;
};

// ============================
// HANDLE BROADCAST CALLBACK
// ============================
const handleBroadcastCallback = async (bot, q) => {
    const data = q.data;
    const chatId = q.message.chat.id;
    const userId = q.from.id;
    
    // Inisialisasi state
    if (!broadcastState[userId]) {
        broadcastState[userId] = {
            text: null,
            photo: null,
            video: null,
            caption: null,
            tagAll: false,
            replyTo: null,
            mode: null
        };
    }
    
    const state = broadcastState[userId];
    
    // ===== BROADCAST TEXT =====
    if (data === "broadcast_text") {
        state.mode = 'waiting_text';
        await bot.sendMessage(chatId, `
📝 <b>KIRIM PESAN</b>

Kirim pesan yang akan disiarkan ke semua user.

📌 Ketik pesan Anda sekarang.
❌ Ketik <code>/batal</code> untuk membatalkan.
        `, { parse_mode: "HTML" });
        await bot.answerCallbackQuery(q.id);
        return;
    }
    
    // ===== BROADCAST PHOTO =====
    if (data === "broadcast_photo") {
        state.mode = 'waiting_photo';
        await bot.sendMessage(chatId, `
🖼️ <b>KIRIM FOTO</b>

Kirim foto yang akan disiarkan ke semua user.

📌 Kirim foto sekarang (bisa dengan caption).
❌ Ketik <code>/batal</code> untuk membatalkan.
        `, { parse_mode: "HTML" });
        await bot.answerCallbackQuery(q.id);
        return;
    }
    
    // ===== BROADCAST VIDEO =====
    if (data === "broadcast_video") {
        state.mode = 'waiting_video';
        await bot.sendMessage(chatId, `
🎬 <b>KIRIM VIDEO</b>

Kirim video yang akan disiarkan ke semua user.

📌 Kirim video sekarang (bisa dengan caption).
❌ Ketik <code>/batal</code> untuk membatalkan.
        `, { parse_mode: "HTML" });
        await bot.answerCallbackQuery(q.id);
        return;
    }
    
    // ===== TAG ALL TOGGLE =====
    if (data === "broadcast_tag_toggle") {
        state.tagAll = !state.tagAll;
        const status = state.tagAll ? '✅ AKTIF' : '❌ NONAKTIF';
        await bot.answerCallbackQuery(q.id, { 
            text: `🏷️ Tag All ${status}`, 
            show_alert: true 
        });
        await showBroadcastMenu(bot, chatId, userId);
        return;
    }
    
    // ===== REPLY (SEMAT PESAN) =====
    if (data === "broadcast_reply") {
        state.mode = 'waiting_reply';
        await bot.sendMessage(chatId, `
📎 <b>SEMAT PESAN</b>

Reply ke pesan yang mau disematkan.

📌 Caranya:
1. Cari pesan yang mau disemat
2. Tekan dan tahan pesan tersebut
3. Pilih "Reply" atau "Balas"
4. Kirim sebagai reply ke pesan ini

❌ Ketik <code>/batal</code> untuk membatalkan.
        `, { parse_mode: "HTML" });
        await bot.answerCallbackQuery(q.id);
        return;
    }
    
    // ===== SKIP REPLY =====
    if (data === "broadcast_skip_reply") {
        state.replyTo = null;
        state.mode = 'idle';
        await bot.sendMessage(chatId, "⏭️ Sematan dilewati.");
        await showBroadcastMenu(bot, chatId, userId);
        await bot.answerCallbackQuery(q.id);
        return;
    }
    
    // ===== CONFIRM BROADCAST =====
    if (data === "broadcast_confirm") {
        const users = loadUsers();
        const userList = Object.keys(users);
        
        if (userList.length === 0) {
            await bot.sendMessage(chatId, "❌ Tidak ada user terdaftar!");
            await bot.answerCallbackQuery(q.id);
            return;
        }
        
        // Cek apakah ada konten
        if (!state.text && !state.photo && !state.video) {
            await bot.sendMessage(chatId, "❌ Belum ada konten! Kirim pesan/foto/video dulu.");
            await bot.answerCallbackQuery(q.id);
            return;
        }
        
        // Preview
        let preview = `📊 <b>KONFIRMASI BROADCAST</b>\n\n`;
        preview += `👥 Target: ${userList.length} user\n`;
        preview += `🏷️ Tag All: ${state.tagAll ? '✅ YA' : '❌ TIDAK'}\n`;
        preview += `📝 Pesan: ${state.text ? '✅ Ada' : '❌ Kosong'}\n`;
        preview += `🖼️ Foto: ${state.photo ? '✅ Ada' : '❌ Kosong'}\n`;
        preview += `🎬 Video: ${state.video ? '✅ Ada' : '❌ Kosong'}\n`;
        preview += `📎 Reply: ${state.replyTo ? '✅ Ada' : '❌ Kosong'}\n\n`;
        preview += `📌 Kirim broadcast ini ke ${userList.length} user?`;
        
        await bot.sendMessage(chatId, preview, {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "✅ KIRIM SEKARANG", callback_data: "broadcast_send" }],
                    [{ text: "❌ BATAL", callback_data: "broadcast_cancel" }]
                ]
            }
        });
        await bot.answerCallbackQuery(q.id);
        return;
    }
    
    // ===== SEND BROADCAST =====
    if (data === "broadcast_send") {
        const users = loadUsers();
        const userList = Object.keys(users);
        let success = 0;
        let fail = 0;
        
        const statusMsg = await bot.sendMessage(chatId, `⏳ Mengirim broadcast ke ${userList.length} user...`, { parse_mode: "HTML" });
        
        for (const uid of userList) {
            try {
                const targetId = parseInt(uid);
                const tagText = state.tagAll ? `@${users[uid]?.username || uid}` : '';
                const finalText = state.text ? `${state.text}\n\n${tagText}` : tagText;
                
                if (state.photo) {
                    await bot.sendPhoto(targetId, state.photo, {
                        caption: finalText || state.caption || '',
                        parse_mode: "HTML",
                        ...(state.replyTo ? { reply_to_message_id: state.replyTo } : {})
                    });
                } else if (state.video) {
                    await bot.sendVideo(targetId, state.video, {
                        caption: finalText || state.caption || '',
                        parse_mode: "HTML",
                        ...(state.replyTo ? { reply_to_message_id: state.replyTo } : {})
                    });
                } else {
                    await bot.sendMessage(targetId, finalText || '📢 Pengumuman dari owner', {
                        parse_mode: "HTML",
                        ...(state.replyTo ? { reply_to_message_id: state.replyTo } : {})
                    });
                }
                success++;
            } catch (err) {
                fail++;
            }
            await new Promise(r => setTimeout(r, 100));
        }
        
        // Hapus state
        delete broadcastState[userId];
        
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
        
        await bot.answerCallbackQuery(q.id);
        return;
    }
    
    // ===== CANCEL BROADCAST =====
    if (data === "broadcast_cancel") {
        delete broadcastState[userId];
        await bot.sendMessage(chatId, "❌ Broadcast dibatalkan.");
        await bot.answerCallbackQuery(q.id, { 
            text: "❌ Broadcast dibatalkan", 
            show_alert: true 
        });
        return;
    }
    
    await bot.answerCallbackQuery(q.id);
};

// ============================
// SHOW BROADCAST HISTORY
// ============================
const showBroadcastHistory = async (bot, chatId) => {
    // Bisa ditambahkan history jika diperlukan
    await bot.sendMessage(chatId, `
📋 <b>BROADCAST HISTORY</b>

💡 Fitur history akan menyimpan 10 broadcast terakhir.

📌 Gunakan /broadcast untuk membuat broadcast baru.
    `, { parse_mode: "HTML" });
};

// ============================
// CHECK SCHEDULED BROADCASTS
// ============================
const checkScheduledBroadcasts = async (bot) => {
    // Untuk scheduled broadcast jika diperlukan
    // Bisa ditambahkan nanti
};

// ============================
// EXPORT
// ============================
module.exports = {
    broadcastState,
    showBroadcastMenu,
    handleBroadcastMessage,
    handleBroadcastCallback,
    showBroadcastHistory,
    checkScheduledBroadcasts
};