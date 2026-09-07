// ============================
// RESTORE.JS - RESTORE BACKUP
// ============================

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const readline = require('readline');

const BACKUP_DIR = './backups';

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
// RESTORE BACKUP
// ============================
const restoreBackup = (filename) => {
    const backupPath = path.join(BACKUP_DIR, filename);
    
    if (!fs.existsSync(backupPath)) {
        console.log(`❌ Backup not found: ${filename}`);
        return;
    }
    
    console.log(`\n📦 Restoring: ${filename}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚠️  PERINGATAN: Ini akan MENIMPA semua file saat ini!');
    console.log('⚠️  Pastikan Anda sudah backup data terbaru!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Press Ctrl+C to cancel, or wait 10 seconds to continue...\n');
    
    setTimeout(() => {
        const command = `unzip -o "${backupPath}" -d .`;
        
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ Restore failed: ${error.message}`);
                return;
            }
            
            console.log('✅ Restore completed successfully!');
            console.log('\n📌 Langkah selanjutnya:');
            console.log('  1. pm2 restart Bot_AbahKonoha');
            console.log('  2. pm2 logs Bot_AbahKonoha --lines 20');
        });
    }, 10000);
};

// ============================
// INTERACTIVE RESTORE
// ============================
const interactiveRestore = () => {
    const files = listBackups();
    if (files.length === 0) return;
    
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    rl.question('Pilih nomor backup yang ingin direstore: ', (answer) => {
        const num = parseInt(answer);
        if (isNaN(num) || num < 1 || num > files.length) {
            console.log('❌ Invalid selection!');
            rl.close();
            return;
        }
        
        const selected = files[num - 1];
        rl.close();
        
        restoreBackup(selected);
    });
};

// ============================
// RUN
// ============================
if (require.main === module) {
    interactiveRestore();
}

module.exports = {
    listBackups,
    restoreBackup,
    interactiveRestore
};