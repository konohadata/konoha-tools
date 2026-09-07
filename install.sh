#!/bin/bash

# ==========================================
# KONOHA TOOLS - AUTO INSTALLER (ALL OS)
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
# INSTALL NODE.JS (ALL OS)
# ==========================================
install_nodejs() {
    echo -e "${BLUE}[1/6] Installing Node.js...${NC}"
    
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
}

# ==========================================
# INSTALL PM2 (ALL OS)
# ==========================================
install_pm2() {
    echo -e "${BLUE}[3/6] Installing PM2...${NC}"
    if ! command -v pm2 &> /dev/null; then
        sudo npm install -g pm2
    fi
    echo -e "${GREEN}✅ PM2 installed: $(pm2 -v)${NC}"
}

# ==========================================
# INSTALL GIT (ALL OS)
# ==========================================
install_git() {
    echo -e "${BLUE}[4/6] Installing Git...${NC}"
    if ! command -v git &> /dev/null; then
        case $OS in
            ubuntu|debian)
                sudo apt-get install -y git
                ;;
            centos|rhel|fedora|rocky|almalinux)
                sudo yum install -y git
                ;;
            alpine)
                apk add git
                ;;
            darwin|macos)
                brew install git
                ;;
        esac
    fi
    echo -e "${GREEN}✅ Git installed${NC}"
}

# ==========================================
# FIX PERMISSION & FORMAT
# ==========================================
fix_files() {
    echo -e "${BLUE}[5/6] Fixing file permissions...${NC}"
    
    # Fix CRLF to LF
    if command -v dos2unix &> /dev/null; then
        dos2unix install.sh start.sh 2>/dev/null
    else
        sed -i 's/\r$//' install.sh start.sh 2>/dev/null
    fi
    
    chmod +x install.sh start.sh
    echo -e "${GREEN}✅ Files fixed${NC}"
}

# ==========================================
# INSTALL DEPENDENCIES
# ==========================================
install_deps() {
    echo -e "${BLUE}[6/6] Installing dependencies...${NC}"
    
    if [ -f package.json ]; then
        npm install --production
    else
        echo -e "${YELLOW}⚠️ package.json not found!${NC}"
    fi
    
    echo -e "${GREEN}✅ Dependencies installed${NC}"
}

# ==========================================
# MAIN EXECUTION
# ==========================================

# Detect OS
detect_os

# Check & Install Node.js
if ! command -v node &> /dev/null; then
    install_nodejs
else
    echo -e "${GREEN}✅ Node.js installed: $(node -v)${NC}"
fi

# Check & Install npm
echo -e "${BLUE}[2/6] Checking npm...${NC}"
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

# Install PM2
install_pm2

# Install Git
install_git

# Fix files
fix_files

# Install dependencies
install_deps

echo ""
echo -e "${GREEN}=========================================="
echo -e "  ✅ INSTALLATION COMPLETE!"
echo -e "==========================================${NC}"
echo ""
echo -e "📌 ${YELLOW}Next steps:${NC}"
echo "  1. Start bot: ./start.sh"
echo "  2. Check logs: pm2 logs konoha-tools"
echo "  3. Check status: pm2 status"
echo ""
echo -e "📊 ${CYAN}System Info:${NC}"
echo "  ├ OS: $OS $VERSION"
echo "  ├ Node: $(node -v)"
echo "  ├ npm: $(npm -v)"
echo "  └ PM2: $(pm2 -v)"
echo ""
echo -e "👑 ${GREEN}Bot by: @Kjsstore_own${NC}"