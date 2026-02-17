#!/bin/bash

# ========================================
# NEXUS CRM - 一键安装脚本
# ========================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印函数
print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  NEXUS CRM - 一键安装脚本${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# 检测操作系统
detect_os() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "macos"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        echo "linux"
    else
        echo "unsupported"
    fi
}

# 检测 Node.js
check_node() {
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v | sed 's/v//')
        NODE_MAJOR=$(echo $NODE_VERSION | cut -d. -f1)
        if [ "$NODE_MAJOR" -ge 18 ]; then
            print_success "Node.js $NODE_VERSION 已安装"
            return 0
        else
            print_error "Node.js 版本过低: $NODE_VERSION，需要 18+"
            return 1
        fi
    else
        print_error "Node.js 未安装"
        return 1
    fi
}

# 检测 Python
check_python() {
    if command -v python3 &> /dev/null; then
        PYTHON_VERSION=$(python3 --version | sed 's/Python //')
        print_success "Python $PYTHON_VERSION 已安装"
        return 0
    else
        print_warning "Python 未安装（可选，不影响基本功能）"
        return 1
    fi
}

# 安装 Node.js (macOS)
install_node_macos() {
    if command -v brew &> /dev/null; then
        print_info "通过 Homebrew 安装 Node.js..."
        brew install node
    else
        print_error "请先安装 Homebrew: https://brew.sh"
        exit 1
    fi
}

# 复制环境配置
setup_env() {
    if [ -f ".env" ]; then
        print_warning ".env 已存在，跳过创建"
    else
        if [ -f ".env.example" ]; then
            cp .env.example .env
            print_success "已创建 .env 配置文件"
            print_info "请编辑 .env 填入你的配置"
        else
            print_error ".env.example 不存在"
            exit 1
        fi
    fi
}

# 交互式配置向导
configure() {
    echo ""
    print_header
    echo "📝 配置向导"
    echo ""

    # 读取现有配置
    source .env 2>/dev/null || true

    # Telegram Bot Token
    echo -n "🤖 Telegram Bot Token (从 @BotFather 获取): "
    read -r token
    if [ -n "$token" ]; then
        sed -i '' "s|TELEGRAM_BOT_TOKEN=.*|TELEGRAM_BOT_TOKEN=$token|" .env
    fi

    # Telegram Chat ID
    echo -n "👤 Telegram Chat ID (从 @userinfobot 获取): "
    read -r chat_id
    if [ -n "$chat_id" ]; then
        sed -i '' "s|AUTHORIZED_USER_IDS=.*|AUTHORIZED_USER_IDS=$chat_id|" .env
        sed -i '' "s|NEWSFLOW_CHAT_ID=.*|NEWSFLOW_CHAT_ID=$chat_id|" .env
    fi

    # MiniMax API Key
    echo -n "🧠 MiniMax API Key: "
    read -r minimax_key
    if [ -n "$minimax_key" ]; then
        sed -i '' "s|MINIMAX_API_KEY=.*|MINIMAX_API_KEY=$minimax_key|" .env
    fi

    # Obsidian Vault 路径
    default_vault="$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/Nexus-Vault"
    echo -n "📁 Obsidian Vault 路径 (直接回车使用默认): "
    read -r vault_path
    if [ -z "$vault_path" ]; then
        vault_path="$default_vault"
    fi
    # 转义路径中的空格
    vault_path_escaped=$(echo "$vault_path" | sed 's/ /\\ /g')
    sed -i '' "s|VAULT_PATH=.*|VAULT_PATH=$vault_path_escaped|" .env

    echo ""
    print_success "配置完成！"
}

# 安装依赖
install_deps() {
    print_info "安装依赖..."
    npm install
    print_success "依赖安装完成"
}

# 编译 TypeScript
build() {
    print_info "编译 TypeScript..."
    npm run build
    print_success "编译完成"
}

# 启动服务
start() {
    print_info "启动 NEXUS..."
    npm start &
    sleep 3
    print_success "NEXUS 已启动！"
    print_info "打开 Telegram 向你的 Bot 发送 /start"
}

# 主流程
main() {
    print_header

    # 检测系统
    OS=$(detect_os)
    if [ "$OS" == "unsupported" ]; then
        print_error "不支持的操作系统"
        exit 1
    fi
    print_success "检测到系统: $OS"

    # 检查 Node.js
    if ! check_node; then
        print_warning "正在安装 Node.js..."
        install_node_macos
        check_node || exit 1
    fi

    # 检查 Python
    check_python

    # 进入 main 目录
    cd "$(dirname "$0")"
    if [ ! -d "main" ]; then
        print_error "请在项目根目录运行此脚本"
        exit 1
    fi
    cd main

    # 设置环境
    setup_env

    # 询问是否配置
    echo ""
    read -p "是否现在配置 .env 文件？(y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        configure
    fi

    # 安装依赖
    install_deps

    # 编译
    build

    # 启动
    echo ""
    read -p "是否现在启动 NEXUS？(y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        start
    fi

    echo ""
    print_success "安装完成！🎉"
    echo ""
    echo "后续命令："
    echo "  npm start     启动"
    echo "  npm run logs 查看日志"
    echo "  npm run stop  停止"
}

# 运行
main "$@"
