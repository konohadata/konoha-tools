#!/bin/bash

# ==========================================
# KONOHA TOOLS - AUTO INSTALLER (STABIL)
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
CYAN='\033[0;36m'
NC='\033[0m'

# ==========================================
# DETEKSI OS
# ==========================================
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        VERSION=$VERSION_ID
    else
        OS=$(uname -s)
        VERSION=$(uname -r)
    fi
    echo -e "${CYAN}📌 Detected OS: $OS $VERSION${NC}"
}

# ==========================================
# SET DNS & HOSTS (FIX KONEKSI)
# ==========================================
fix_network() {
    echo -e "${BLUE}[1/8] Fixing network...${NC}"
    
    # Set DNS
    echo "nameserver 8.8.8.8" > /etc/resolv.conf 2>/dev/null
    echo "nameserver 1.1.1.1" >> /etc/resolv.conf 2>/dev/null
    
    # Add hosts
    if ! grep -q "github.com" /etc/hosts; then
        echo "140.82.112.3 github.com" >> /etc/hosts
        echo "140.82.114.4 api.github.com" >> /etc/hosts
    fi
    
    if ! grep -q "api.telegram.org" /etc/hosts; then
        echo "149.154.167.99 api.telegram.org" >> /etc/hosts
        echo "149.154.175.100 api.telegram.org" >> /etc/hosts
    fi
    
    echo -e "${GREEN}✅ Network fixed${NC}"
}

# ==========================================
# INSTALL NODE.JS (ALL OS)
# ==========================================
install_nodejs() {
    echo -e "${BLUE}[2/8] Installing Node.js...${NC}"
    
    case $OS in
        ubuntu|debian)
            curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
            sudo apt-get install -y nodejs
            ;;
        centos|rhel|fedora|rocky|almalinux)
            curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
            sudo yum install -y nodejs
            ;;
        alpine)
            apk add nodejs npm
            ;;
        darwin|macos)
            if ! command -v brew &> /dev/null; then
                echo -e "${YELLOW}Installing Homebrew...${NC}"
                /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            fi
            brew install node
            ;;
        *)
            echo -e "${RED}❌ OS not supported! Please install Node.js manually.${NC}"
            exit 1
            ;;
    esac
    
    echo -e "${GREEN}✅ Node.js installed: $(node -v)${NC}"
}

# ==========================================
# INSTALL TOOLS (WGET, UNZIP, GIT)
# ==========================================
install_tools() {
    echo -e "${BLUE}[3/8] Installing required tools...${NC}"
    
    for cmd in wget unzip git; do
        if ! command -v $cmd &> /dev/null; then
            case $OS in
                ubuntu|debian)
                    sudo apt-get install -y $cmd
                    ;;
                centos|rhel|fedora|rocky|almalinux)
                    sudo yum install -y $cmd
                    ;;
                alpine)
                    apk add $cmd
                    ;;
                darwin|macos)
                    brew install $cmd
                    ;;
            esac
        fi
    done
    
    echo -e "${GREEN}✅ Tools installed${NC}"
}

# ==========================================
# INSTALL PM2 (ALL OS)
# ==========================================
install_pm2() {
    echo -e "${BLUE}[4/8] Installing PM2...${NC}"
    if ! command -v pm2 &> /dev/null; then
        sudo npm install -g pm2
    fi
    echo -e "${GREEN}✅ PM2 installed: $(pm2 -v)${NC}"
}

# ==========================================
# DOWNLOAD & EXTRACT DARI GITHUB
# ==========================================
download_bot() {
    echo -e "${BLUE}[5/8] Downloading bot from GitHub...${NC}"
    
    cd ~
    rm -rf konoha-tools.zip konoha-tools-main konoha-tools
    
    # Download pake wget
    wget -q --show-progress https://github.com/konohadata/konoha-tools/archive/refs/heads/main.zip -O konoha-tools.zip
    
    if [ ! -f konoha-tools.zip ]; then
        echo -e "${RED}❌ Download failed!${NC}"
        exit 1
    fi
    
    # Extract
    unzip -q konoha-tools.zip
    mv konoha-tools-main konoha-tools
    cd ~/konoha-tools
    
    echo -e "${GREEN}✅ Bot downloaded${NC}"
}

# ==========================================
# FIX FILE PERMISSIONS
# ==========================================
fix_files() {
    echo -e "${BLUE}[6/8] Fixing files...${NC}"
    
    # Fix CRLF to LF
    find . -name "*.sh" -exec sed -i 's/\r$//' {} \; 2>/dev/null
    find . -name "*.js" -exec sed -i 's/\r$//' {} \; 2>/dev/null
    
    # Permission
    chmod +x *.sh 2>/dev/null
    
    echo -e "${GREEN}✅ Files fixed${NC}"
}

# ==========================================
# INSTALL DEPENDENCIES
# ==========================================
install_deps() {
    echo -e "${BLUE}[7/8] Installing dependencies...${NC}"
    
    # Clean install
    rm -rf node_modules package-lock.json
    
    # Install pake mirror (cepat)
    npm install --registry=https://registry.npmmirror.com
    
    echo -e "${GREEN}✅ Dependencies installed${NC}"
}

# ==========================================
# START BOT DENGAN PM2
# ==========================================
start_bot() {
    echo -e "${BLUE}[8/8] Starting bot...${NC}"
    
    # Stop & delete existing
    pm2 delete konoha-tools 2>/dev/null
    pkill -f "node.*bot.js" 2>/dev/null
    
    # Start
    pm2 start bot.js --name "konoha-tools" --node-args="--max-old-space-size=512"
    pm2 save
    
    # Enable startup (Linux only)
    if [[ "$OS" != "darwin" && "$OS" != "macos" ]]; then
        pm2 startup | tail -1 | bash 2>/dev/null
    fi
    
    echo -e "${GREEN}✅ Bot started${NC}"
}

# ==========================================
# SHOW STATUS
# ==========================================
show_status() {
    echo ""
    echo -e "${CYAN}📊 Checking logs...${NC}"
    echo ""
    pm2 logs konoha-tools --lines 15 --nostream 2>/dev/null || echo "Waiting for logs..."
    
    echo ""
    echo -e "${GREEN}=========================================="
    echo -e "  ✅ INSTALLATION COMPLETE!"
    echo -e "==========================================${NC}"
    echo ""
    echo -e "📌 ${YELLOW}Commands:${NC}"
    echo "  🔍 Check status: pm2 status"
    echo "  📋 Check logs:   pm2 logs konoha-tools"
    echo "  🔄 Restart:      pm2 restart konoha-tools"
    echo "  🛑 Stop:         pm2 stop konoha-tools"
    echo ""
    echo -e "📊 ${CYAN}System Info:${NC}"
    echo "  ├ OS: $OS $VERSION"
    echo "  ├ Node: $(node -v)"
    echo "  ├ npm: $(npm -v)"
    echo "  └ PM2: $(pm2 -v)"
    echo ""
    echo -e "👑 ${GREEN}Bot by: @Kjsstore_own${NC}"
    echo "📱 ${CYAN}Test bot: Send /start to your bot${NC}"
}

# ==========================================
# MAIN EXECUTION
# ==========================================

# Detect OS
detect_os

# Fix network
fix_network

# Install Node.js
if ! command -v node &> /dev/null; then
    install_nodejs
else
    echo -e "${GREEN}✅ Node.js installed: $(node -v)${NC}"
fi

# Check npm
echo -e "${BLUE}[2/8] Checking npm...${NC}"
if ! command -v npm &> /dev/null; then
    case $OS in
        ubuntu|debian)
            sudo apt-get install -y npm
            ;;
        centos|rhel|fedora|rocky|almalinux)
            sudo yum install -y npm
            ;;
        alpine)
            apk add npm
            ;;
    esac
fi
echo -e "${GREEN}✅ npm installed: $(npm -v)${NC}"

# Install tools
install_tools

# Install PM2
install_pm2

# Download bot
download_bot

# Fix files
fix_files

# Install dependencies
install_deps

# Start bot
start_bot

# Show status
show_status