#!/bin/bash

# ========================================
# NEXUS CRM - 一键安装脚本
# Robust install with progress tracking,
# error recovery, and health checks.
# ========================================

# Do NOT use set -e — we handle errors per-command via run_step.

# ── Color definitions ──────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ── Spinner frames ─────────────────────────────────────────────────
SPINNER_FRAMES=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')

# ── Script directory (install.sh lives inside main/) ───────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ── Temp directory for step logs ───────────────────────────────────
STEP_LOG_DIR=$(mktemp -d)
trap 'rm -rf "$STEP_LOG_DIR"' EXIT

# ── Global state ───────────────────────────────────────────────────
TOTAL_STEPS=8
CURRENT_STEP=0

# ── Print helpers ──────────────────────────────────────────────────
print_success() { echo -e "  ${GREEN}✓${NC} $1"; }
print_error()   { echo -e "  ${RED}✗${NC} $1"; }
print_warning() { echo -e "  ${YELLOW}⚠${NC} $1"; }
print_info()    { echo -e "  ${BLUE}ℹ${NC} $1"; }

print_header() {
    echo ""
    echo -e "${BOLD}NEXUS CRM - 一键安装脚本${NC}"
    echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

print_step_header() {
    CURRENT_STEP=$1
    local title="$2"
    echo ""
    echo -e "${BOLD}[${CURRENT_STEP}/${TOTAL_STEPS}] ${title}${NC}"
}

# ── run_step: execute a command with spinner + timeout ─────────────
# Usage: run_step "描述" TIMEOUT_SECS command [args...]
#
# Shows a live spinner with elapsed time while the command runs.
# On success: ✓ 描述 (Xs)
# On failure: ✗ 描述 — shows last lines of output + fix suggestions
# On timeout: kills process, shows timeout message
#
run_step() {
    local description="$1"
    shift
    local timeout_secs="$1"
    shift
    # remaining args are the command

    local log_file
    log_file="${STEP_LOG_DIR}/step_$$.log"

    # Run command in background, capture stdout+stderr
    "$@" > "$log_file" 2>&1 &
    local cmd_pid=$!
    local elapsed=0
    local frame_idx=0
    local slow_warned=false
    local slow_threshold=$(( timeout_secs / 2 ))

    # Spinner loop
    while kill -0 "$cmd_pid" 2>/dev/null; do
        local frame="${SPINNER_FRAMES[$frame_idx]}"
        local extra=""
        if [ "$elapsed" -ge "$slow_threshold" ] && [ "$slow_warned" = false ]; then
            slow_warned=true
        fi
        if [ "$slow_warned" = true ]; then
            extra=" — 可能需要较长时间"
        fi
        printf "\r  ${CYAN}%s${NC} %s... ${DIM}(%ds)${extra}${NC}  " "$frame" "$description" "$elapsed"
        sleep 1
        elapsed=$(( elapsed + 1 ))
        frame_idx=$(( (frame_idx + 1) % ${#SPINNER_FRAMES[@]} ))

        # Timeout check
        if [ "$elapsed" -ge "$timeout_secs" ]; then
            kill "$cmd_pid" 2>/dev/null
            wait "$cmd_pid" 2>/dev/null
            # Clear spinner line
            printf "\r%80s\r" ""
            print_error "${description} — 超时 (${timeout_secs}s)"
            echo ""
            echo -e "  ${YELLOW}⚠ 已等待超过 $((timeout_secs / 60)) 分钟。${NC}"
            echo "  1. 检查网络连接是否正常"
            echo "  2. 如果在中国大陆，设置 npm 镜像："
            echo "     npm config set registry https://registry.npmmirror.com"
            echo "  3. 重新运行: bash install.sh"
            echo ""
            if [ -s "$log_file" ]; then
                echo -e "  ${DIM}最后几行输出：${NC}"
                tail -5 "$log_file" | sed 's/^/    /'
            fi
            return 1
        fi
    done

    # Command finished — get exit code
    wait "$cmd_pid"
    local exit_code=$?

    # Clear spinner line
    printf "\r%80s\r" ""

    if [ "$exit_code" -eq 0 ]; then
        print_success "${description} ${DIM}(${elapsed}s)${NC}"
        return 0
    else
        print_error "${description} ${DIM}(退出码: ${exit_code})${NC}"
        echo ""
        if [ -s "$log_file" ]; then
            echo -e "  ${DIM}错误信息：${NC}"
            tail -10 "$log_file" | sed 's/^/    /'
            echo ""
        fi
        return "$exit_code"
    fi
}

# ── detect_os ──────────────────────────────────────────────────────
detect_os() {
    case "$(uname -s)" in
        Darwin*) echo "macos" ;;
        Linux*)  echo "linux" ;;
        *)       echo "unsupported" ;;
    esac
}

# ── detect_proxy (messages to stderr, value to stdout) ─────────────
detect_proxy() {
    local proxy=""
    local proxies=(
        "http://127.0.0.1:7890"
        "http://127.0.0.1:7891"
        "http://127.0.0.1:1080"
        "http://127.0.0.1:1087"
        "http://127.0.0.1:8080"
        "http://127.0.0.1:8888"
        "socks5://127.0.0.1:7890"
        "socks5://127.0.0.1:1080"
    )

    echo "  检测代理配置..." >&2

    # Check environment variables first
    if [ -n "$HTTP_PROXY" ] || [ -n "$http_proxy" ]; then
        proxy="${HTTP_PROXY:-$http_proxy}"
        echo -e "  检测到环境变量代理: $proxy" >&2
        echo "$proxy"
        return 0
    fi

    # Try common proxy ports
    for p in "${proxies[@]}"; do
        if curl -s -o /dev/null -w "%{http_code}" --proxy "$p" \
             https://api.telegram.org --max-time 3 2>/dev/null \
             | grep -q "200\|301\|302"; then
            proxy="$p"
            echo -e "  检测到可用代理: $proxy" >&2
            echo "$proxy"
            return 0
        fi
    done

    # Nothing found
    echo ""
    return 1
}

# ── check_node ─────────────────────────────────────────────────────
check_node() {
    if command -v node &>/dev/null; then
        local version
        version=$(node -v | sed 's/v//')
        local major
        major=$(echo "$version" | cut -d. -f1)
        if [ "$major" -ge 18 ]; then
            print_success "Node.js v${version}"
            return 0
        else
            print_error "Node.js 版本过低: v${version} (需要 v18+)"
            echo ""
            echo "  解决办法："
            echo "    brew upgrade node"
            echo "    或 nvm install 18"
            return 1
        fi
    else
        print_error "Node.js 未安装"
        echo ""
        echo "  解决办法："
        echo "    brew install node"
        echo "    或访问 https://nodejs.org"
        return 1
    fi
}

# ── check_python ───────────────────────────────────────────────────
check_python() {
    if command -v python3 &>/dev/null; then
        local version
        version=$(python3 --version 2>&1 | sed 's/Python //')
        print_success "Python ${version}"
        return 0
    else
        print_warning "Python3 未安装（可选，仅影响 AKShare 财经数据）"
        return 1
    fi
}

# ── check_pm2 ──────────────────────────────────────────────────────
check_pm2() {
    if command -v pm2 &>/dev/null; then
        local version
        version=$(pm2 -v 2>/dev/null)
        print_success "PM2 v${version}"
        return 0
    else
        print_warning "PM2 未安装（将自动安装）"
        return 1
    fi
}

# ── install_pm2 ────────────────────────────────────────────────────
install_pm2() {
    # Try without sudo first
    if run_step "安装 PM2 进程管理器" 120 npm install -g pm2; then
        return 0
    fi
    # If that failed (likely EACCES), try with sudo
    echo ""
    print_info "权限不足，尝试使用 sudo 安装..."
    if run_step "安装 PM2 (sudo)" 120 sudo npm install -g pm2; then
        return 0
    fi
    echo ""
    echo -e "  ${RED}PM2 安装失败。${NC}"
    echo "  解决办法："
    echo "    1. sudo npm install -g pm2"
    echo "    2. 或修复 npm 全局目录权限："
    echo "       mkdir -p ~/.npm-global"
    echo "       npm config set prefix ~/.npm-global"
    echo "       export PATH=~/.npm-global/bin:\$PATH"
    echo "    3. 然后重新运行: bash install.sh"
    return 1
}

# ── install_node_macos ─────────────────────────────────────────────
install_node_macos() {
    if command -v brew &>/dev/null; then
        run_step "通过 Homebrew 安装 Node.js" 300 brew install node
    else
        echo ""
        print_error "Homebrew 未安装。"
        echo ""
        echo "  解决办法："
        echo "    /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        echo "    安装完成后重新运行: bash install.sh"
        return 1
    fi
}

# ── setup_env ──────────────────────────────────────────────────────
setup_env() {
    if [ -f ".env" ]; then
        print_success ".env 文件已存在"
        return 0
    fi
    if [ -f ".env.example" ]; then
        cp .env.example .env
        print_success ".env 文件已创建"
        return 0
    fi
    print_error ".env.example 不存在，无法创建配置文件"
    return 1
}

# ── validate_bot_token ─────────────────────────────────────────────
# Telegram Bot tokens look like: 123456:ABCdefGHIjklMNOpqrsTUVwxyz
validate_bot_token() {
    local token="$1"
    if [[ "$token" =~ ^[0-9]+:[A-Za-z0-9_-]+$ ]]; then
        return 0
    fi
    return 1
}

# ── validate_chat_id ───────────────────────────────────────────────
# Chat IDs are integers (can be negative for groups)
validate_chat_id() {
    local id="$1"
    if [[ "$id" =~ ^-?[0-9]+$ ]]; then
        return 0
    fi
    return 1
}

# ── configure (interactive wizard with validation) ─────────────────
configure() {
    echo ""

    # ── Telegram Bot Token ──
    local token=""
    while true; do
        echo -ne "  🤖 Telegram Bot Token (从 @BotFather 获取): "
        read -r token
        if [ -z "$token" ]; then
            print_warning "Bot Token 不能为空，请重新输入"
            continue
        fi
        if validate_bot_token "$token"; then
            break
        else
            print_warning "格式不正确，Token 格式应为: 123456:ABCdef... 请重新输入"
        fi
    done
    sed -i '' "s|^TELEGRAM_BOT_TOKEN=.*|TELEGRAM_BOT_TOKEN=${token}|" .env

    # ── Chat ID ──
    local chat_id=""
    while true; do
        echo -ne "  👤 你的 Telegram Chat ID (从 @userinfobot 获取): "
        read -r chat_id
        if [ -z "$chat_id" ]; then
            print_warning "Chat ID 不能为空，请重新输入"
            continue
        fi
        if validate_chat_id "$chat_id"; then
            break
        else
            print_warning "Chat ID 应该是数字，请重新输入"
        fi
    done
    sed -i '' "s|^AUTHORIZED_USER_IDS=.*|AUTHORIZED_USER_IDS=${chat_id}|" .env
    sed -i '' "s|^NEWSFLOW_CHAT_ID=.*|NEWSFLOW_CHAT_ID=${chat_id}|" .env

    # ── MiniMax API Key ──
    local minimax_key=""
    while true; do
        echo -ne "  🧠 MiniMax API Key: "
        read -r minimax_key
        if [ -z "$minimax_key" ]; then
            print_warning "API Key 不能为空，请重新输入"
            continue
        fi
        break
    done
    sed -i '' "s|^MINIMAX_API_KEY=.*|MINIMAX_API_KEY=${minimax_key}|" .env

    # ── Obsidian Vault Path ──
    local default_vault="$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/Nexus-Vault"
    echo -ne "  📁 Obsidian Vault 路径 (回车使用默认):\n     默认: ${DIM}${default_vault}${NC}\n     路径: "
    read -r vault_path
    if [ -z "$vault_path" ]; then
        vault_path="$default_vault"
    fi
    # Expand ~ to $HOME if user typed it
    vault_path="${vault_path/#\~/$HOME}"

    # Escape spaces for .env value
    local vault_path_escaped
    vault_path_escaped=$(echo "$vault_path" | sed 's/ /\\ /g')
    sed -i '' "s|^VAULT_PATH_DEFAULT=.*|VAULT_PATH_DEFAULT=${vault_path_escaped}|" .env

    # Store unescaped path for vault creation later
    CONFIGURED_VAULT_PATH="$vault_path"

    echo ""
    print_success "配置已保存"
}

# ── create_vault_structure ─────────────────────────────────────────
create_vault_structure() {
    local vault_path="$1"

    if [ -z "$vault_path" ]; then
        print_warning "未设置 Vault 路径，跳过"
        return 0
    fi

    if [ -d "$vault_path" ]; then
        print_success "Vault 目录已存在: $(basename "$vault_path")"
    else
        print_info "创建 Vault 目录..."
        mkdir -p "$vault_path"
    fi

    # Create subdirectories expected by the bot
    local dirs=("People" "Conversations" "Companies" "Research" "Daily" "Templates" "NewsFlow" "_raw")
    local created=0
    for d in "${dirs[@]}"; do
        if [ ! -d "${vault_path}/${d}" ]; then
            mkdir -p "${vault_path}/${d}"
            created=$(( created + 1 ))
        fi
    done

    if [ "$created" -gt 0 ]; then
        print_success "创建了 ${created} 个子目录 (${dirs[*]})"
    else
        print_success "Vault 目录结构完整"
    fi
}

# ── auto_config_proxy ──────────────────────────────────────────────
auto_config_proxy() {
    local proxy
    proxy=$(detect_proxy)

    if [ -n "$proxy" ]; then
        sed -i '' "s|^TELEGRAM_PROXY=.*|TELEGRAM_PROXY=${proxy}|" .env
        print_success "已配置 Telegram 代理: ${proxy}"
    else
        print_warning "未检测到代理"
        echo ""
        echo -ne "  请手动输入代理地址 (回车跳过): "
        read -r manual_proxy
        if [ -n "$manual_proxy" ]; then
            sed -i '' "s|^TELEGRAM_PROXY=.*|TELEGRAM_PROXY=${manual_proxy}|" .env
            print_success "已配置代理: ${manual_proxy}"
        else
            print_info "跳过代理配置（稍后可编辑 .env 中的 TELEGRAM_PROXY）"
        fi
    fi
}

# ── health_check: verify the bot can start ─────────────────────────
health_check() {
    if [ ! -f "dist/index.js" ]; then
        print_error "dist/index.js 不存在，编译可能失败"
        return 1
    fi

    # Try starting the bot for 5 seconds — if it hasn't crashed by then, it's OK
    local hc_log="${STEP_LOG_DIR}/healthcheck.log"
    node dist/index.js > "$hc_log" 2>&1 &
    local hc_pid=$!
    local elapsed=0

    while [ "$elapsed" -lt 5 ]; do
        if ! kill -0 "$hc_pid" 2>/dev/null; then
            # Process died — check why
            wait "$hc_pid" 2>/dev/null
            local exit_code=$?
            print_error "Bot 启动后立即崩溃 (退出码: ${exit_code})"
            echo ""
            if [ -s "$hc_log" ]; then
                echo -e "  ${DIM}错误信息：${NC}"
                tail -10 "$hc_log" | sed 's/^/    /'
                echo ""
            fi
            echo "  解决办法："
            echo "    1. 检查 .env 配置是否正确"
            echo "    2. 运行 node dist/index.js 查看完整错误"
            return 1
        fi
        sleep 1
        elapsed=$(( elapsed + 1 ))
    done

    # Still running after 5s — good, kill it
    kill "$hc_pid" 2>/dev/null
    wait "$hc_pid" 2>/dev/null
    print_success "Bot 启动检查通过"
    return 0
}

# ── start_with_pm2 ─────────────────────────────────────────────────
start_with_pm2() {
    # Stop any existing nexus process (ignore errors)
    pm2 delete nexus 2>/dev/null || true

    if [ ! -f "ecosystem.config.js" ]; then
        print_error "ecosystem.config.js 不存在"
        return 1
    fi

    pm2 start ecosystem.config.js > /dev/null 2>&1
    local exit_code=$?
    if [ "$exit_code" -ne 0 ]; then
        print_error "PM2 启动失败 (退出码: ${exit_code})"
        echo "  解决办法："
        echo "    1. pm2 start ecosystem.config.js"
        echo "    2. 或直接运行: node dist/index.js"
        return 1
    fi

    # Save PM2 process list for auto-restart on reboot
    pm2 save --force > /dev/null 2>&1

    # Wait a moment and verify it's running
    sleep 2
    local pm2_status
    pm2_status=$(pm2 jlist 2>/dev/null | grep -o '"name":"nexus"' || true)
    if [ -z "$pm2_status" ]; then
        print_error "PM2 进程未在运行"
        return 1
    fi

    # Get PID and memory info
    local pid mem
    pid=$(pm2 pid nexus 2>/dev/null || echo "?")
    mem=$(pm2 jlist 2>/dev/null \
        | sed -n 's/.*"name":"nexus".*"memory":\([0-9]*\).*/\1/p' \
        || echo "")
    local mem_mb=""
    if [ -n "$mem" ] && [ "$mem" -gt 0 ] 2>/dev/null; then
        mem_mb="$(( mem / 1024 / 1024 ))MB"
    fi

    local details="PID: ${pid}"
    [ -n "$mem_mb" ] && details="${details}, 内存: ${mem_mb}"
    print_success "Bot 已启动 (${details})"
    return 0
}

# ── read_vault_path_from_env ───────────────────────────────────────
read_vault_path_from_env() {
    if [ -f ".env" ]; then
        local raw
        raw=$(grep '^VAULT_PATH_DEFAULT=' .env | head -1 | cut -d= -f2-)
        # Unescape backslash-spaces
        raw=$(echo "$raw" | sed 's/\\ / /g')
        # Expand ~
        raw="${raw/#\~/$HOME}"
        echo "$raw"
    fi
}

# ══════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════
main() {
    print_header

    # ── [1/8] Environment detection ────────────────────────────────
    print_step_header 1 "环境检测"

    local os
    os=$(detect_os)
    if [ "$os" = "unsupported" ]; then
        print_error "不支持的操作系统: $(uname -s)"
        echo "  目前仅支持 macOS 和 Linux"
        exit 1
    fi
    print_success "系统: ${os} ($(uname -sr))"

    # Node.js
    if ! check_node; then
        echo ""
        print_info "正在安装 Node.js..."
        if [ "$os" = "macos" ]; then
            if ! install_node_macos; then
                exit 1
            fi
        else
            print_error "请手动安装 Node.js v18+: https://nodejs.org"
            exit 1
        fi
        # Verify
        if ! check_node; then
            exit 1
        fi
    fi

    # Python (optional)
    check_python

    # PM2
    local pm2_needed=false
    if ! check_pm2; then
        pm2_needed=true
    fi

    # ── [2/8] Install PM2 if needed ────────────────────────────────
    print_step_header 2 "安装 PM2"

    if [ "$pm2_needed" = true ]; then
        if ! install_pm2; then
            echo ""
            print_warning "PM2 安装失败，稍后可手动安装: npm install -g pm2"
            print_info "将使用 node 直接启动（不推荐用于生产环境）"
        else
            # Verify
            if command -v pm2 &>/dev/null; then
                local pm2v
                pm2v=$(pm2 -v 2>/dev/null)
                print_success "PM2 v${pm2v} 安装完成"
            fi
        fi
    else
        print_success "PM2 已安装，跳过"
    fi

    # ── [3/8] Environment configuration ────────────────────────────
    print_step_header 3 "环境配置"

    if ! setup_env; then
        exit 1
    fi

    # Ask whether to run interactive config
    echo ""
    echo -ne "  是否现在配置 .env 文件？(Y/n): "
    read -r reply
    if [[ ! "$reply" =~ ^[Nn]$ ]]; then
        configure
    else
        print_info "跳过配置（稍后可手动编辑 .env）"
    fi

    # ── [4/8] Network / proxy detection ────────────────────────────
    print_step_header 4 "网络检测"

    auto_config_proxy

    # ── [5/8] Install dependencies ─────────────────────────────────
    print_step_header 5 "安装依赖"

    if ! run_step "npm install" 600 npm install; then
        echo ""
        echo "  解决办法："
        echo "    1. 检查网络连接是否正常"
        echo "    2. 尝试运行: npm install --legacy-peer-deps"
        echo "    3. 如果在中国大陆，设置 npm 镜像:"
        echo "       npm config set registry https://registry.npmmirror.com"
        echo "    4. 然后重新运行: bash install.sh"
        exit 1
    fi

    # ── [6/8] Build TypeScript ─────────────────────────────────────
    print_step_header 6 "编译项目"

    if ! run_step "TypeScript 编译" 120 npm run build; then
        echo ""
        echo "  解决办法："
        echo "    1. 重新运行 npm install 确保 TypeScript 已安装"
        echo "    2. 手动编译: npx tsc"
        echo "    3. 然后重新运行: bash install.sh"
        exit 1
    fi

    # ── [7/8] Initialize vault ─────────────────────────────────────
    print_step_header 7 "初始化 Vault"

    # Use the path from configure(), or read from .env
    local vault_path="${CONFIGURED_VAULT_PATH:-}"
    if [ -z "$vault_path" ]; then
        vault_path=$(read_vault_path_from_env)
    fi
    create_vault_structure "$vault_path"

    # ── [8/8] Start service ────────────────────────────────────────
    print_step_header 8 "启动服务"

    # Health check first
    print_info "检查 Bot 能否正常启动..."
    if ! health_check; then
        echo ""
        print_warning "健康检查未通过，跳过自动启动"
        print_info "请修复上述问题后手动启动: pm2 start ecosystem.config.js"
    else
        # Start with PM2 if available, otherwise use node directly
        if command -v pm2 &>/dev/null; then
            if ! start_with_pm2; then
                print_warning "PM2 启动失败，尝试直接启动..."
                node dist/index.js &
                sleep 2
                if kill -0 $! 2>/dev/null; then
                    print_success "Bot 已直接启动 (PID: $!)"
                else
                    print_error "Bot 启动失败"
                fi
            fi
        else
            print_info "PM2 不可用，直接启动..."
            node dist/index.js &
            local bg_pid=$!
            sleep 2
            if kill -0 "$bg_pid" 2>/dev/null; then
                print_success "Bot 已启动 (PID: ${bg_pid})"
                print_warning "建议安装 PM2 以获得进程管理功能: npm install -g pm2"
            else
                print_error "Bot 启动失败"
            fi
        fi
    fi

    # ── Final summary ──────────────────────────────────────────────
    echo ""
    echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}${BOLD}✓ 安装完成！${NC}"
    echo ""
    echo "打开 Telegram，向你的 Bot 发送 /start 开始使用。"
    echo ""
    echo "常用命令："
    echo "  pm2 logs nexus      查看日志"
    echo "  pm2 restart nexus   重启"
    echo "  pm2 stop nexus      停止"
    echo "  npm run rebuild     编译并重启"
    echo ""
}

# Run
main "$@"
