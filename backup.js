// ============================
// BACKUP.JS - AUTO BACKUP FULL SYSTEM
// ============================

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const axios = require('axios');
const config = require('./config');

// ============================
// CONFIG
// ============================
const BACKUP_DIR = './backups';
const MAX_BACKUPS = 50; // Maksimal 50 backup
const BACKUP_INTERVAL = 6 * 60 * 60 * 1000; // 6 jam sekali

// ============================
// NOTIF BOT (Untuk kirim backup ke Telegram)
// ============================
const NOTIF_BOT_TOKEN = config.NOTIFICATION?.BOT_TOKEN || null;
const NOTIF_CHAT_ID = config.NOTIFICATION?.CHAT_ID || null;
const NOTIF_ENABLED = config.NOTIFICATION?.ENABLED || false;

// Semua file penting yang perlu di backup
const IMPORTANT_FILES = [
    'bot.js',
    'menu.js',
    'payment.js',
    'broadcast.js',
    'data_processor.js',
    'config.js',
    'package.json',
    'package-lock.json',
    'users.json',
    'data_abk.json'
];

// Folder yang perlu di backup
const IMPORTANT_FOLDERS = [
    'temp_excel'
];

// ============================
// CREATE BACKUP DIRECTORY
// ============================
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log(`📁 Backup directory created: ${BACKUP_DIR}`);
}

// ============================
// FORMAT DATE
// ============================
const getDateString = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}`;
};

// ============================
// GET FILE SIZE
// ============================
const getFileSize = (filePath) => {
    try {
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            return (stats.size / 1024 / 1024).toFixed(2);
        }
        return '0';
    } catch (e) {
        return '0';
    }
};

// ============================
// CREATE BACKUP
// ============================
const createBackup = async () => {
    try {
        const dateStr = getDateString();
        const backupFileName = `backup_${dateStr}.zip`;
        const backupPath = path.join(BACKUP_DIR, backupFileName);
        
        console.log(`\n📦 Creating backup: ${backupFileName}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // Kumpulkan file yang akan di backup
        let filesToZip = [];
        let missingFiles = [];
        
        // Cek file penting
        for (const file of IMPORTANT_FILES) {
            if (fs.existsSync(file)) {
                filesToZip.push(file);
                console.log(`  ✅ ${file} (${getFileSize(file)} MB)`);
            } else {
                missingFiles.push(file);
                console.log(`  ⚠️ ${file} not found (skipped)`);
            }
        }
        
        // Cek folder
        for (const folder of IMPORTANT_FOLDERS) {
            if (fs.existsSync(folder)) {
                filesToZip.push(folder);
                console.log(`  ✅ ${folder}/ (folder)`);
            } else {
                console.log(`  ⚠️ ${folder}/ not found (skipped)`);
            }
        }
        
        if (filesToZip.length === 0) {
            console.log('❌ No files to backup!');
            return;
        }
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // Buat backup dengan zip
        const fileList = filesToZip.join(' ');
        const command = `zip -r "${backupPath}" ${fileList}`;
        
        return new Promise((resolve, reject) => {
            exec(command, async (error, stdout, stderr) => {
                if (error) {
                    console.error(`❌ Backup failed: ${error.message}`);
                    reject(error);
                    return;
                }
                
                const size = (fs.statSync(backupPath).size / 1024 / 1024).toFixed(2);
                console.log(`✅ Backup created: ${backupFileName}`);
                console.log(`📊 Size: ${size} MB`);
                console.log(`📁 Location: ${backupPath}`);
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
                
                // Hapus backup lama
                cleanupOldBackups();
                
                // Kirim ke Telegram
                if (NOTIF_ENABLED && NOTIF_BOT_TOKEN && NOTIF_CHAT_ID) {
                    await sendBackupToTelegram(backupPath, backupFileName, size);
                }
                
                resolve();
            });
        });
        
    } catch (error) {
        console.error('❌ Backup error:', error.message);
    }
};

// ============================
// CLEANUP OLD BACKUPS
// ============================
const cleanupOldBackups = () => {
    try {
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.endsWith('.zip'))
            .map(f => ({
                name: f,
                path: path.join(BACKUP_DIR, f),
                time: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs
            }))
            .sort((a, b) => b.time - a.time);
        
        if (files.length > MAX_BACKUPS) {
            const toDelete = files.slice(MAX_BACKUPS);
            for (const file of toDelete) {
                fs.unlinkSync(file.path);
                console.log(`🗑️ Deleted old backup: ${file.name}`);
            }
        }
        
        console.log(`📦 Total backups: ${Math.min(files.length, MAX_BACKUPS)}/${MAX_BACKUPS}`);
        
    } catch (error) {
        console.error('❌ Cleanup error:', error.message);
    }
};

// ============================
// SEND BACKUP TO TELEGRAM
// ============================
const sendBackupToTelegram = async (filePath, fileName, size) => {
    try {
        console.log(`📤 Uploading backup to Telegram...`);
        
        const FormData = require('form-data');
        const formData = new FormData();
        formData.append('chat_id', NOTIF_CHAT_ID);
        formData.append('document', fs.createReadStream(filePath));
        formData.append('caption', `📦 <b>Auto Backup Bot AbahKonoha</b>
━━━━━━━━━━━━━━━━━━━━
📅 <b>Tanggal:</b> ${new Date().toLocaleString('id-ID')}
📊 <b>Size:</b> ${size} MB
📁 <b>File:</b> ${fileName}
━━━━━━━━━━━━━━━━━━━━
✅ <b>Backup berhasil dibuat!</b>`);

        const url = `https://api.telegram.org/bot${NOTIF_BOT_TOKEN}/sendDocument`;
        const response = await axios.post(url, formData, {
            headers: formData.getHeaders(),
            timeout: 120000
        });
        
        if (response.data && response.data.ok) {
            console.log(`✅ Backup uploaded to Telegram!`);
        } else {
            console.log(`⚠️ Upload response: ${JSON.stringify(response.data)}`);
        }
        
    } catch (error) {
        console.error(`❌ Upload to Telegram failed: ${error.message}`);
    }
};

// ============================
// LIST BACKUPS
// ============================
const listBackups = () => {
    if (!fs.existsSync(BACKUP_DIR)) {
        console.log('❌ No backup directory found!');
        return [];
    }
    
    const files = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.endsWith('.zip'))
        .sort((a, b) => {
            return fs.statSync(path.join(BACKUP_DIR, b)).mtimeMs - 
                   fs.statSync(path.join(BACKUP_DIR, a)).mtimeMs;
        });
    
    if (files.length === 0) {
        console.log('❌ No backups found!');
        return [];
    }
    
    console.log('\n📦 Available Backups:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    files.forEach((f, i) => {
        const size = (fs.statSync(path.join(BACKUP_DIR, f)).size / 1024 / 1024).toFixed(2);
        const date = new Date(fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs).toLocaleString('id-ID');
        console.log(`  ${i+1}. ${f}`);
        console.log(`     📊 ${size} MB | 📅 ${date}`);
    });
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    return files;
};

// ============================
// AUTO BACKUP LOOP
// ============================
const startAutoBackup = () => {
    console.log('\n🔄 AUTO BACKUP SYSTEM STARTED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`⏰ Interval: ${BACKUP_INTERVAL / 1000 / 60 / 60} jam`);
    console.log(`📁 Backup directory: ${BACKUP_DIR}`);
    console.log(`📦 Max backups: ${MAX_BACKUPS}`);
    console.log(`📄 Files to backup: ${IMPORTANT_FILES.length} files`);
    console.log(`📁 Folders: ${IMPORTANT_FOLDERS.length} folders`);
    console.log(`📤 Telegram upload: ${NOTIF_ENABLED ? '✅ ON' : '❌ OFF'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Backup pertama kali (tunggu 5 detik)
    setTimeout(async () => {
        await createBackup();
    }, 5000);
    
    // Backup berulang setiap interval
    setInterval(async () => {
        await createBackup();
    }, BACKUP_INTERVAL);
};

// ============================
// RUN
// ============================
if (require.main === module) {
    startAutoBackup();
}

module.exports = {
    createBackup,
    startAutoBackup,
    listBackups,
    BACKUP_DIR,
    MAX_BACKUPS,
    IMPORTANT_FILES,
    IMPORTANT_FOLDERS
};