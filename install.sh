#!/bin/bash

# ==========================================
# KONOHA TOOLS - AUTO INSTALLER
# ==========================================

echo "=========================================="
echo "  🚀 KONOHA TOOLS AUTO INSTALLER"
echo "=========================================="
echo ""

# Warna
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Cek Node.js
echo -e "${BLUE}[1/5] Checking Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Node.js not found! Installing...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi
echo -e "${GREEN}✅ Node.js installed: $(node -v)${NC}"

# Cek npm
echo -e "${BLUE}[2/5] Checking npm...${NC}"
if ! command -v npm &> /dev/null; then
    sudo apt-get install -y npm
fi
echo -e "${GREEN}✅ npm installed: $(npm -v)${NC}"

# Cek PM2
echo -e "${BLUE}[3/5] Checking PM2...${NC}"
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}Installing PM2...${NC}"
    sudo npm install -g pm2
fi
echo -e "${GREEN}✅ PM2 installed: $(pm2 -v)${NC}"

# Cek Git
echo -e "${BLUE}[4/5] Checking Git...${NC}"
if ! command -v git &> /dev/null; then
    sudo apt-get install -y git
fi
echo -e "${GREEN}✅ Git installed${NC}"

# Install dependencies
echo -e "${BLUE}[5/5] Installing dependencies...${NC}"
npm install
echo -e "${GREEN}✅ Dependencies installed${NC}"

echo ""
echo -e "${GREEN}=========================================="
echo -e "  ✅ INSTALLATION COMPLETE!"
echo -e "==========================================${NC}"
echo ""
echo -e "📌 ${YELLOW}Next steps:${NC}"
echo "  1. Start bot: bash start.sh"
echo "  2. Check status: pm2 status"
echo ""
echo -e "👑 ${GREEN}Bot by: @Kjsstore_own${NC}"