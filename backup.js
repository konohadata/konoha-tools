// ============================
// BACKUP.JS
// ============================

const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const createBackup = async (bot, chatId) => {
    try {
        const zip = new JSZip();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const zipFileName = `Backup_${timestamp}.zip`;
        const zipPath = path.join(__dirname, zipFileName);

        const files = ['bot.js', 'config.js', 'menu.js', 'users.json', 'package.json', 'backup.js'];
        let totalFiles = 0;

        for (const file of files) {
            if (fs.existsSync(file)) {
                const content = fs.readFileSync(file);
                zip.file(file, content);
                totalFiles++;
                console.log(`✅ [BACKUP] ${file}`);
            }
        }

        const zipBuffer = await zip.generateAsync({
            type: 'nodebuffer',
            compression: 'DEFLATE',
            compressionOptions: { level: 9 }
        });

        fs.writeFileSync(zipPath, zipBuffer);
        const zipSize = (zipBuffer.length / 1024 / 1024).toFixed(2);

        await bot.sendDocument(chatId, zipPath, {
            caption: `
📦 <b>BACKUP SELESAI!</b>

📄 Total File: ${totalFiles} file
💾 Ukuran: ${zipSize} MB
📅 ${new Date().toLocaleString('id-ID')}

🔐 File berisi semua data bot.
            `,
            parse_mode: 'HTML'
        });

        setTimeout(() => {
            try { if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath); } catch (e) {}
        }, 10000);

        return true;
    } catch (error) {
        console.error('❌ [BACKUP] Error:', error.message);
        await bot.sendMessage(chatId, `
❌ <b>BACKUP GAGAL!</b>

📌 Error: ${error.message}

💡 Install JSZip: <code>npm install jszip</code>
            `, { parse_mode: 'HTML' });
        return false;
    }
};

module.exports = { createBackup };