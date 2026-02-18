#!/bin/bash

# ========================================
# NEXUS Launcher - 快速安装脚本
# ========================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# 获取脚本所在目录的绝对路径
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 自动检测 main 目录位置
# 情况1: 在 NEXUS/ 运行脚本 → MAIN_DIR = NEXUS/main
# 情况2: 在 NEXUS/main/ 运行脚本 → MAIN_DIR = 当前目录
if [ -f "$SCRIPT_DIR/package.json" ]; then
    MAIN_DIR="$SCRIPT_DIR"
elif [ -f "$SCRIPT_DIR/main/package.json" ]; then
    MAIN_DIR="$SCRIPT_DIR/main"
else
    MAIN_DIR="$SCRIPT_DIR"
fi

print_header() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║          NEXUS Launcher 安装向导                   ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_step() {
    echo ""
    echo -e "${BLUE}━━━ 步骤 $1: $2 ━━━${NC}"
}

print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_info() { echo -e "${CYAN}ℹ $1${NC}"; }

# 检测并安装依赖
install_deps() {
    print_step "1" "检查依赖"
    
    # Node.js
    if command -v node &> /dev/null; then
        print_success "Node.js $(node -v)"
    else
        print_info "安装 Node.js..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        brew install node
    fi
    
    # PM2
    if command -v pm2 &> /dev/null; then
        print_success "PM2 $(pm2 -v)"
    else
        print_info "安装 PM2..."
        npm install -g pm2
    fi
}

# 从 .env 读取配置（处理带空格的路径）
load_env() {
    local env_file="$1"
    while IFS='=' read -r key value; do
        # 跳过注释和空行
        [[ "$key" =~ ^# ]] && continue
        [[ -z "$key" ]] && continue
        
        # 移除引号
        value="${value//\"/}"
        value="${value//\'/}"
        
        # 设置变量
        export "$key=$value"
    done < "$env_file"
}

# 配置 .env
setup_env() {
    print_step "2" "配置环境变量"
    
    cd "$MAIN_DIR"
    
    # 创建 .env
    if [ -f ".env" ]; then
        print_info ".env 已存在，将保留现有配置"
    else
        cp .env.example .env
        print_success "已创建 .env"
    fi
    
    # 读取配置
    load_env ".env"
    
    # 检查必填字段
    MISSING=""
    
    if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ "$TELEGRAM_BOT_TOKEN" == "your_bot_token_here" ]; then
        MISSING="$MISSING\n  - Telegram Bot Token"
    fi
    
    if [ -z "$AUTHORIZED_USER_IDS" ] || [ "$AUTHORIZED_USER_IDS" == "your_chat_id_here" ]; then
        MISSING="$MISSING\n  - Telegram Chat ID"
    fi
    
    if [ -z "$MINIMAX_API_KEY" ] || [ "$MINIMAX_API_KEY" == "your_minimax_api_key_here" ]; then
        MISSING="$MISSING\n  - MiniMax API Key"
    fi
    
    if [ -n "$MISSING" ]; then
        echo -e "${RED}以下必填配置缺失:${NC}$MISSING"
        echo ""
        echo "请编辑 .env 文件填入配置后重新运行"
        echo ""
        echo "或在此输入配置（直接回车跳过）:"
        echo ""
        
        # Token
        echo -n "1. Telegram Bot Token: "
        read -r token
        [ -n "$token" ] && sed -i '' "s|TELEGRAM_BOT_TOKEN=.*|TELEGRAM_BOT_TOKEN=$token|" .env
        
        # Chat ID
        echo -n "2. Telegram Chat ID: "
        read -r chat_id
        [ -n "$chat_id" ] && sed -i '' "s|AUTHORIZED_USER_IDS=.*|AUTHORIZED_USER_IDS=$chat_id|" .env
        
        # MiniMax
        echo -n "3. MiniMax API Key: "
        read -r key
        [ -n "$key" ] && sed -i '' "s|MINIMAX_API_KEY=.*|MINIMAX_API_KEY=$key|" .env
        
        # Vault Path
        default_vault="$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/Nexus-Vault"
        echo -n "4. Obsidian Vault 路径 (直接回车使用默认): "
        read -r vault_path
        if [ -z "$vault_path" ]; then
            vault_path="$default_vault"
        fi
        # 转义路径中的空格
        vault_path_escaped=$(echo "$vault_path" | sed 's/ /\\ /g')
        sed -i '' "s|VAULT_PATH=.*|VAULT_PATH=$vault_path_escaped|" .env
        
        print_success "配置已保存"
    else
        print_success "所有必填配置已就绪"
    fi
}

# 构建并安装
build_and_install() {
    print_step "3" "构建项目"
    
    cd "$MAIN_DIR"
    
    npm install
    npm run build
    
    print_success "构建完成"
}

# 启动
start_launcher() {
    print_step "4" "启动 NEXUS"
    
    cd "$MAIN_DIR"
    
    echo ""
    read -p "是否启动 NEXUS？(y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        pm2 start ecosystem.config.js
        pm2 save
        print_success "NEXUS 已启动!"
    fi
}

# 主流程
main() {
    print_header
    
    echo "项目目录: $MAIN_DIR"
    echo ""
    
    install_deps
    setup_env
    build_and_install
    start_launcher
    
    echo ""
    echo -e "${GREEN}🎉 安装完成!${NC}"
    echo ""
    echo "打开: launcher/NEXUS Launcher.app"
    echo "或运行: pm2 status"
}

main "$@"
