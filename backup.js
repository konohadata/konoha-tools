// ============================
// BACKUP.JS - BACKUP MANAGER UNTUK ABH DATA STORE
// ============================

const fs = require('fs');
const path = require('path');

// ✅ PAKAI ADM-ZIP (LEBIH STABLE, COMMONJS)
let AdmZip;
try {
    AdmZip = require('adm-zip');
    console.log('✅ AdmZip loaded successfully');
} catch (err) {
    console.error('❌ Failed to load adm-zip:', err.message);
    AdmZip = null;
}

const config = require('./config');
const OWNER_ID = config.BOT.OWNER_ID;

// ============================
// DAFTAR FILE YANG DI-BACKUP
// ============================
const FILES_TO_BACKUP = [
    'bot.js',
    'menu.js',
    'discount.js',
    'payment.js',
    'broadcast.js',
    'config.js',
    'backup.js',
    'users.json',
    'data_abk.json',
    'discounts.json',
    'temp_excel/'
];

// ============================
// FORMAT TANGGAL
// ============================
const getDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}_${hour}-${minute}`;
};

// ============================
// FORMAT UKURAN FILE
// ============================
const formatSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
};

// ============================
// BUAT BACKUP ZIP (PAKAI ADM-ZIP)
// ============================
const createBackup = async (chatId, bot) => {
    if (!AdmZip) {
        await bot.sendMessage(chatId, '❌ <b>AdmZip tidak tersedia!</b>\n\nInstall: npm install adm-zip', { parse_mode: "HTML" });
        throw new Error('AdmZip not available');
    }
    
    const timestamp = getDateString();
    const backupName = `backup_abh_${timestamp}`;
    const backupDir = path.join(__dirname, 'backups');
    const zipPath = path.join(backupDir, `${backupName}.zip`);
    
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }
    
    await bot.sendMessage(chatId, `⏳ <b>Membuat backup...</b>\n📁 Nama: ${backupName}.zip`, { parse_mode: "HTML" });
    
    return new Promise((resolve, reject) => {
        try {
            const zip = new AdmZip();
            let addedFiles = [];
            
            for (const file of FILES_TO_BACKUP) {
                const fullPath = path.join(__dirname, file);
                
                try {
                    if (file.endsWith('/')) {
                        if (fs.existsSync(fullPath)) {
                            const folderName = file.replace('/', '');
                            zip.addLocalFolder(fullPath, folderName);
                            addedFiles.push(`📁 ${folderName}/`);
                            console.log(`📁 Added folder: ${folderName}`);
                        }
                    } else {
                        if (fs.existsSync(fullPath)) {
                            zip.addLocalFile(fullPath);
                            addedFiles.push(`📄 ${file}`);
                            console.log(`📄 Added file: ${file}`);
                        }
                    }
                } catch (err) {
                    console.log(`⚠️ Error adding ${file}:`, err.message);
                }
            }
            
            // Tambahkan file .json lainnya
            try {
                const files = fs.readdirSync(__dirname);
                for (const file of files) {
                    if (file.endsWith('.json') && !FILES_TO_BACKUP.includes(file)) {
                        const fullPath = path.join(__dirname, file);
                        if (fs.statSync(fullPath).isFile()) {
                            zip.addLocalFile(fullPath);
                            addedFiles.push(`📄 ${file}`);
                            console.log(`📄 Added extra JSON: ${file}`);
                        }
                    }
                }
            } catch (err) {
                console.log('⚠️ Error reading extra files:', err.message);
            }
            
            zip.writeZip(zipPath);
            
            const stats = fs.statSync(zipPath);
            resolve({
                success: true,
                path: zipPath,
                name: backupName,
                size: stats.size,
                files: addedFiles
            });
            
        } catch (error) {
            console.error('❌ Backup error:', error.message);
            reject(error);
        }
    });
};

// ============================
// LIST BACKUP
// ============================
const listBackups = async () => {
    const backupDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupDir)) return [];
    
    const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.zip'));
    const result = [];
    
    for (const file of files) {
        const filePath = path.join(backupDir, file);
        try {
            const stats = fs.statSync(filePath);
            result.push({
                name: file,
                path: filePath,
                size: stats.size,
                sizeFormatted: formatSize(stats.size),
                created: stats.mtime,
                createdFormatted: stats.mtime.toLocaleString('id-ID')
            });
        } catch (err) {
            console.log(`⚠️ Error reading ${file}:`, err.message);
        }
    }
    
    result.sort((a, b) => b.created - a.created);
    return result;
};

// ============================
// CLEAN OLD BACKUPS
// ============================
const cleanOldBackups = async () => {
    const backupDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupDir)) return 0;
    
    const files = fs.readdirSync(backupDir);
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 hari
    let deleted = 0;
    
    for (const file of files) {
        if (file.endsWith('.zip')) {
            const filePath = path.join(backupDir, file);
            try {
                const stats = fs.statSync(filePath);
                if (now - stats.mtimeMs > maxAge) {
                    fs.unlinkSync(filePath);
                    deleted++;
                    console.log(`🗑️ Deleted old backup: ${file}`);
                }
            } catch (err) {
                console.log(`⚠️ Error deleting ${file}:`, err.message);
            }
        }
    }
    return deleted;
};

// ============================
// RESTORE BACKUP
// ============================
const restoreBackup = async (backupName) => {
    try {
        if (!AdmZip) {
            return { success: false, error: 'AdmZip tidak tersedia! Install: npm install adm-zip' };
        }
        
        const backupDir = path.join(__dirname, 'backups');
        const zipPath = path.join(backupDir, backupName);
        
        if (!fs.existsSync(zipPath)) {
            return { success: false, error: 'File backup tidak ditemukan!' };
        }
        
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(__dirname, true);
        
        return { success: true, message: 'Restore berhasil!' };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

// ============================
// HANDLE BACKUP COMMANDS
// ============================
const handleBackupCommands = async (bot, msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text || '';
    
    if (String(userId) !== String(OWNER_ID)) {
        await bot.sendMessage(chatId, '❌ <b>Khusus Owner!</b>', { parse_mode: "HTML" });
        return false;
    }
    
    if (text === '/backup' || text === '/backup now' || text === '💾 Backup') {
        try {
            await cleanOldBackups();
            const result = await createBackup(chatId, bot);
            
            if (!result || !result.success) {
                await bot.sendMessage(chatId, '❌ Gagal membuat backup!');
                return true;
            }
            
            await bot.sendDocument(chatId, result.path, {
                caption: `
✅ <b>BACKUP BERHASIL!</b>

📁 Nama: ${result.name}.zip
📦 Ukuran: ${formatSize(result.size)}
📅 Tanggal: ${new Date().toLocaleString('id-ID')}

📋 <b>File yang di-backup:</b>
${result.files.map(f => `├ ${f}`).join('\n')}

💡 Total: ${result.files.length} file/folder
`,
                parse_mode: "HTML"
            });
            return true;
        } catch (error) {
            console.error('❌ Backup error:', error.message);
            await bot.sendMessage(chatId, `❌ <b>Gagal membuat backup!</b>\n\n${error.message}`, { parse_mode: "HTML" });
            return true;
        }
    }
    
    if (text === '/listbackup' || text === '/listbackups') {
        const backups = await listBackups();
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
        return true;
    }
    
    return false;
};

// ============================
// EXPORT MODULE
// ============================
module.exports = {
    createBackup,
    listBackups,
    cleanOldBackups,
    formatSize,
    handleBackupCommands,
    restoreBackup
};