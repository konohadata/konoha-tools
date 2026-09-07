#!/bin/bash

# ==========================================
# KONOHA TOOLS - AUTO START (ALL OS)
# ==========================================

echo "=========================================="
echo "  🚀 Starting KONOHA TOOLS Bot"
echo "=========================================="

# Warna
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Detect OS
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
    else
        OS=$(uname -s)
    fi
}

detect_os

# Check PM2
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}PM2 not found! Installing...${NC}"
    sudo npm install -g pm2
fi

# Stop existing
echo -e "${YELLOW}Stopping existing bot...${NC}"
pm2 stop konoha-tools 2>/dev/null
pm2 delete konoha-tools 2>/dev/null

# Start with PM2
echo -e "${GREEN}Starting bot with PM2...${NC}"
pm2 start bot.js --name "konoha-tools" --node-args="--max-old-space-size=512"

# Save PM2 config
pm2 save

# Setup PM2 startup (Linux only)
if [[ "$OS" != "darwin" && "$OS" != "macos" ]]; then
    echo -e "${YELLOW}Setting PM2 startup...${NC}"
    pm2 startup | tail -1 | bash 2>/dev/null
fi

echo ""
echo -e "${GREEN}=========================================="
echo -e "  ✅ BOT STARTED SUCCESSFULLY!"
echo -e "==========================================${NC}"
echo ""
echo -e "📌 ${YELLOW}Commands:${NC}"
echo "  🔍 Check logs:    pm2 logs konoha-tools"
echo "  🔄 Restart:       pm2 restart konoha-tools"
echo "  🛑 Stop:          pm2 stop konoha-tools"
echo "  📊 Status:        pm2 status"
echo "  💀 Kill:          pm2 delete konoha-tools"
echo ""
echo -e "👑 ${GREEN}Bot running!${NC}"