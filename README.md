## 📦 v0.3.6 (2026-02-25)

- Remove .DS_Store files from git tracking

---

## 📦 v0.3.5 (2026-02-24)

- Update

---

## 📦 v0.3.5 (2026-02-24)

- Update

---

## 📦 v0.3.5 (2026-02-23)

- Feature: auto-create companies from contacts with AI-listed detection

---

## 📦 v0.3.5 (2026-02-23)

- Update: comprehensive README with prerequisites, credentials guide, and troubleshooting

---

## 📦 v0.3.4 (2026-02-23)

- Fix: each user needs own Bot Token for multi-instance support

---

# NEXUS CRM

> Personal Network Management for Private Equity Professionals

![Version](https://img.shields.io/badge/version-0.3.6-blue)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)
![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)

NEXUS is a personal CRM system that combines a Telegram Bot with an Obsidian Vault. It helps you manage your professional network with AI-powered features, designed specifically for private equity professionals who need to track relationships, companies, and investment opportunities.

## Why NEXUS?

Traditional CRM systems are:
- ❌ Too complex for personal use
- ❌ Require manual data entry
- ❌ Don't integrate with your note-taking workflow
- ❌ Expensive and overkill for individual investors

NEXUS solves this by:
- ✅ Using **Telegram** as the interface (you're already here)
- ✅ Storing data in **Obsidian** (your second brain, fully customizable)
- ✅ AI-powered insights, summaries, and automation
- ✅ Free and open-source

## Features

### 🖥️ NEXUS Launcher (macOS App)
A native macOS application to manage your NEXUS service:

- One-click start/stop for NEXUS service
- Real-time status indicator (running/stopped)
- Built-in PM2 service management
- Clean, native macOS interface
- App icon customization support

### 🤖 Telegram Bot
Control everything from Telegram - the interface you already use daily:

**Contact Management:**
- Add new contacts with AI-extracted details
- Update contact information
- Star/favorite important contacts
- Search and filter by tags, industries, companies

**Conversation Logging:**
- Log meetings, calls, and interactions
- AI-generated summaries and key insights
- Extract action items automatically
- Link conversations to contacts and companies

**Commands:**
- `/start` - Initialize bot and sync data
- `/add [name]` - Add new contact (AI assists)
- `/log [contact]` - Log a conversation
- `/pending` - View all action items
- `/followup` - People you should reconnect with
- `/newsflow` - Get AI-curated daily news
- `/dashboard` - View network statistics
- `/starred` - View starred contacts and companies

### 📇 Contact Management
Store comprehensive contact profiles:
- Name, role, company
- How you met (source)
- Relationship closeness level
- Industries and tags
- Career history
- Personal notes

### 🏢 Company Tracking
Track companies in your network:
- Company profiles with industry, description
- List of related contacts (current/past)
- Linked conversations
- Star companies for news monitoring
- Support for public/private companies
- Stock ticker for public companies

### 💬 Conversation Logging
Record conversations with full context:
- Date, time, location, occasion
- AI-generated summaries
- Key topics and insights
- Action items with owners and due dates
- Related companies and people
- Sentiment and relationship signals

### 📰 Newsflow (AI News Monitor)
Automated news monitoring powered by AI:

**What it monitors:**
- Starred companies (public and private)
- Starred people in your network

**News Sources:**
- Finnhub API (US stocks)
- AKShare (HK/CN stocks)
- Google News RSS (private companies, people)

**What it delivers:**
- Daily AI-curated briefing at 9:00 AM
- Filters out noise (price movements, trading signals)
- Prioritizes: fundamentals, leadership changes, product launches, M&A

**Smart Matching:**
- Automatically matches news to related people
- Suggests contacts based on news relevance

### 🔗 Relationship Intelligence
- Automatically link contacts to companies
- Track relationship signals (strengthening/stable/cooling)
- Suggest people to reconnect with based on last contact
- Industry distribution analysis

### 📊 Dashboard
View your entire network at a glance:
- Total contacts by closeness level
- Recent conversations
- Upcoming follow-ups
- Industry distribution
- Company coverage

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Telegram  │ ───► │  NEXUS Bot   │ ───► │   Obsidian  │
│    (UI)     │      │ (Node.js)    │      │   Vault     │
└─────────────┘      └──────────────┘      └─────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │   SQLite DB  │
                     │  (Cache/FTS)│
                     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │  MiniMax AI  │
                     │ (Analysis)   │
                     └──────────────┘
```

### Data Flow

1. **You** send a command or message to the Telegram Bot
2. **Bot** processes the request using AI when needed
3. **Bot** reads from or writes to your **Obsidian Vault** (Markdown files)
4. **SQLite** caches data for fast full-text search
5. **AI** generates summaries, extracts insights, and curates news

### Real-time Sync

NEXUS uses a file watcher to keep Obsidian and SQLite in sync:
- Changes in Obsidian → automatically sync to SQLite
- Changes via Telegram → automatically update Obsidian
- Dashboard and Starred lists auto-refresh on any change

## Prerequisites

| Requirement | Version | How to install |
|-------------|---------|----------------|
| **Node.js** | v18+ | `brew install node` or [nodejs.org](https://nodejs.org) |
| **Python3** | 3.9+ (optional) | `brew install python3` — only needed for AKShare financial data |
| **Obsidian** | Any | [obsidian.md](https://obsidian.md) — free, for viewing your vault |

> The install script will check all of these and guide you through installing anything that's missing.

## Quick Start

### Before You Begin: Get Your Credentials

You'll need three things ready before running the installer:

#### 1. Telegram Bot Token

1. Open Telegram, search for **@BotFather**
2. Send `/newbot`, follow the prompts to name your bot
3. BotFather will give you a token like `123456:ABCdefGHI...` — save it

#### 2. Your Telegram User ID

1. Open Telegram, search for **@userinfobot**
2. Start the bot — it will display your User ID (a number like `6573965713`)

#### 3. MiniMax API Key

1. Go to [MiniMax Platform](https://platform.minimax.io)
2. Sign up or log in
3. Create an API key (starts with `sk-`)
4. Copy the key

---

### Option 1: One-Click Install (Recommended)

```bash
git clone https://github.com/tedlxz/NEXUS.git
cd NEXUS/main
bash install.sh
```

The script runs an 8-step automated pipeline with live progress display:

```
NEXUS CRM - 一键安装脚本
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[1/8] 环境检测          — checks Node.js, Python, PM2
[2/8] 安装 PM2          — installs PM2 process manager if missing
[3/8] 环境配置          — interactive wizard: Bot Token, Chat ID, API Key, Vault path
[4/8] 网络检测          — auto-detects proxy (Clash/V2Ray/Shadowsocks)
[5/8] 安装依赖          — npm install with spinner + timeout detection
[6/8] 编译项目          — TypeScript compilation
[7/8] 初始化 Vault      — creates Obsidian vault directory structure
[8/8] 启动服务          — health check + PM2 launch

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ 安装完成！
```

**What the installer handles automatically:**

- Missing Node.js → offers to install via Homebrew
- Missing PM2 → installs globally (with sudo fallback)
- Input validation → Bot Token format, Chat ID is a number, API Key non-empty
- Proxy detection → tests common local proxy ports for Telegram connectivity
- Vault creation → creates `People/`, `Conversations/`, `Companies/`, etc.
- Health check → verifies the bot can start without crashing
- PM2 launch → starts the bot with auto-restart and `pm2 save`

If any step fails, the script shows the error details and specific fix suggestions instead of silently exiting.

### Option 2: NEXUS Launcher (macOS App)

```bash
git clone https://github.com/tedlxz/NEXUS.git
cd NEXUS
chmod +x install_launcher.sh
./install_launcher.sh
```

After installation, run the native macOS app from `main/launcher/NEXUS Launcher.app` for one-click start/stop with a status indicator.

### Option 3: Manual Setup

If you prefer full control, you can set everything up by hand:

```bash
git clone https://github.com/tedlxz/NEXUS.git
cd NEXUS/main

# 1. Create config from template
cp .env.example .env

# 2. Edit .env — fill in your Bot Token, User ID, API Key, Vault path
nano .env

# 3. Install dependencies
npm install

# 4. Install PM2 (required for npm run restart/stop/logs)
npm install -g pm2

# 5. Build TypeScript
npm run build

# 6. Start with PM2
pm2 start ecosystem.config.js
pm2 save
```

### Configuration Reference

The `.env` file supports the following variables:

```bash
# ── Required ──────────────────────────────────────────
TELEGRAM_BOT_TOKEN=123456:ABCdef...     # From @BotFather
AUTHORIZED_USER_IDS=6573965713          # Your Telegram User ID
MINIMAX_API_KEY=sk-...                  # From platform.minimax.io

# ── Vault ─────────────────────────────────────────────
VAULT_PATH_DEFAULT=~/Library/Mobile\ Documents/iCloud~md~obsidian/Documents/Nexus-Vault
# Per-user vault (multi-user): VAULT_PATH_<USER_ID>=/path/to/vault

# ── Network (optional) ───────────────────────────────
TELEGRAM_PROXY=http://127.0.0.1:7890   # For China users (Clash/V2Ray)

# ── Newsflow (optional) ──────────────────────────────
NEWSFLOW_CHAT_ID=6573965713             # Defaults to AUTHORIZED_USER_IDS
FINNHUB_API_KEY=                        # US stock news
AKSHARE_ENABLED=true                    # HK/CN stock news (requires Python)
AKSHARE_PYTHON_PATH=python3

# ── Web Dashboard (optional) ─────────────────────────
WEB_PASSWORD=your-secret-password
PORT=3000
```

### Post-Install: Verify It Works

```bash
# Check PM2 status — should show "nexus" as "online"
pm2 status

# View live logs
pm2 logs nexus

# Open Telegram and send /start to your bot
```

### Daily Usage Commands

| Command | What it does |
|---------|-------------|
| `pm2 logs nexus` | View live logs |
| `pm2 restart nexus` | Restart the bot |
| `pm2 stop nexus` | Stop the bot |
| `npm run rebuild` | Recompile TypeScript + restart |
| `pm2 status` | Check if bot is running |

## Obsidian Vault Setup

NEXUS expects your Obsidian Vault to have the following folder structure:

```
Nexus-Vault/
├── People/           # Contact notes
├── Companies/        # Company notes
├── Conversations/    # Meeting notes
├── Research/         # Research notes
├── Daily/            # Daily notes
├── Templates/        # NEXUS templates
├── NewsFlow/        # AI news briefings
├── _raw/            # Raw transcripts
├── _system/         # NEXUS system files
│   ├── nexus.db     # SQLite cache
│   ├── Starred.md   # Starred list
│   └── Data Dashboard.md
└── Templates/       # Note templates
```

**Note:** NEXUS will automatically create these folders if they don't exist.

## Commands Reference

| Command | Description |
|---------|-------------|
| `/start` | Initialize bot, sync data from Obsidian |
| `/help` | Show available commands |
| `/add [name]` | Add a new contact |
| `/log [contact]` | Log a conversation with a contact |
| `/pending` | List all pending action items |
| `/followup` | List contacts to reconnect with |
| `/newsflow` | Trigger newsflow manually |
| `/dashboard` | View network statistics |
| `/starred` | View starred contacts and companies |
| `/search [query]` | Search contacts and companies |
| `/company [name]` | View company details |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Interface | Telegram Bot (Telegraf) |
| Runtime | Node.js 18+ |
| Language | TypeScript |
| Database | SQLite (better-sqlite3) |
| AI | MiniMax API |
| Storage | Obsidian Vault (Markdown) |
| File Watcher | Chokidar |
| Process Manager | PM2 |
| macOS App | Tauri 2.x |

## Project Structure

```
NEXUS/
├── main/
│   ├── src/
│   │   ├── bot/           # Telegram bot handlers
│   │   ├── db/            # SQLite database layer
│   │   ├── newsflow/      # News monitoring
│   │   ├── vault/         # Obsidian integration
│   │   ├── ai/            # AI prompts & logic
│   │   └── web/           # Web dashboard
│   ├── dist/              # Compiled JavaScript
│   ├── launcher/          # NEXUS Launcher (Tauri)
│   │   ├── src/           # React frontend
│   │   └── src-tauri/     # Rust backend
│   ├── install.sh         # One-click installer (8-step pipeline)
│   ├── ecosystem.config.js # PM2 config
│   └── .env.example       # Config template
├── install_launcher.sh    # Quick installer script
├── docs/                  # Documentation
└── README.md
```

## Troubleshooting

### Installation Issues

| Problem | Solution |
|---------|----------|
| Node.js not found | `brew install node` or visit [nodejs.org](https://nodejs.org) |
| Node.js < v18 | `brew upgrade node` or `nvm install 18` |
| Homebrew not found | `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"` |
| `npm install` fails | Check network. Try: `npm config set registry https://registry.npmmirror.com` |
| PM2 install fails (EACCES) | `sudo npm install -g pm2` or fix npm prefix permissions |
| TypeScript build fails | Run `npm install` again to ensure TypeScript is installed |

### Runtime Issues

**Bot not responding:**
1. Check if NEXUS is running: `pm2 status`
2. Check logs: `pm2 logs nexus`
3. Restart: `pm2 restart nexus`

**Bot crashes on start:**
1. Run `node dist/index.js` directly to see the full error
2. Check `.env` — make sure Bot Token, User ID, and API Key are filled in
3. If you see "TELEGRAM_PROXY" errors, edit `.env` to set or remove the proxy

**Can't connect to Telegram (China users):**
1. Make sure a proxy (Clash/V2Ray) is running locally
2. Edit `.env` and set `TELEGRAM_PROXY=http://127.0.0.1:7890` (or your proxy port)
3. Restart: `pm2 restart nexus`

### Obsidian Sync Issues

1. Make sure iCloud is syncing your vault
2. Check the vault path in `.env`
3. Verify folder permissions

### Newsflow Not Working

1. Check API keys (MiniMax, Finnhub)
2. Verify `NEWSFLOW_CHAT_ID` is set
3. Check newsflow logs: look for `[Newsflow]` in `pm2 logs`

### Database Errors

NEXUS will automatically run migrations on startup. If you see migration errors:
1. Backup your vault
2. Delete `nexus.db` in `_system/`
3. Restart NEXUS to rebuild

## License

Private - All rights reserved

## Changelog

### v0.3.4 (2026-02-19)
- 移除所有不必要的 bot 重启
- 添加/更新/删除联系人不自动重启，只增量同步
- 全局上下文管理模块：支持 follow-up 理解
- 新增 news_search intent：按需搜索公司新闻
- 新增 clear_context intent：清除上下文
- 修复 Telegram Markdown 解析错误
- enrich_contact 不再重启 bot

### v0.3.3 (2026-02-19)
- 新增 enrich_contact 功能：重新整理联系人资料
- 新增 AI Profile Summary 生成

### v0.3.2 (2026-02-18)
- 协作手册 (collaboration-guide.md)

### v0.3.0 (2026-02-18)
- Added NEXUS Launcher macOS native application
- Added `install_launcher.sh` one-click installer
- Enhanced PM2 service management
- Auto-refresh Dashboard and Starred lists on changes
- Fixed hardcoded paths for multi-user support
- Added default Telegram Bot Token (pre-configured)
- Fixed company deletion sync issues

### v0.2.2 (2026-02-18)
- Initial public release
- Telegram bot with contact management
- Conversation logging with AI summaries
- Newsflow AI news monitoring
- Obsidian vault integration
- SQLite caching layer with full-text search
- Real-time file watcher for sync

---

**Need help?** Open an issue on GitHub or check the docs folder for more details.
