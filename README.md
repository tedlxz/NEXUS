## 📦 v0.3.4 (2026-02-23)

- Fix: each user needs own Bot Token for multi-instance support

---

# NEXUS CRM

> Personal Network Management for Private Equity Professionals

![Version](https://img.shields.io/badge/version-0.3.4-blue)
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

## Quick Start

### Option 1: NEXUS Launcher (Recommended for macOS)

**Run the installer:**

```bash
# Clone the repository
git clone https://github.com/tedlxz/NEXUS.git
cd NEXUS

# Run the installer
chmod +x install_launcher.sh
./install_launcher.sh
```

The installer will guide you through:
1. Check and install required dependencies (Node.js, PM2)
2. Configure your settings (User ID, API keys, Vault path)
3. Build the project
4. Start NEXUS service

After installation, you can also run the macOS app from `main/launcher/NEXUS Launcher.app`.

### Option 2: Command Line

```bash
# Clone the repository
git clone https://github.com/tedlxz/NEXUS.git
cd NEXUS/main

# Copy and edit configuration
cp .env.example .env
nano .env  # Or use any text editor

# Install dependencies and build
npm install
npm run build

# Start the service
npm start  # Uses PM2 for process management
```

### Configuration

Create a `.env` file with the following:

```bash
# Telegram Bot (pre-configured - just press enter)
TELEGRAM_BOT_TOKEN=8370700502:AAHp0RhLFREFqGmed8Xmd2pGy9NB9IcUMVM

# Your User ID (REQUIRED - get from @userinfobot)
AUTHORIZED_USER_IDS=your_user_id_here

# MiniMax API Key (REQUIRED - get from https://platform.minimax.io)
MINIMAX_API_KEY=your_minimax_api_key_here

# Obsidian Vault Path (optional, defaults to iCloud Obsidian)
VAULT_PATH=/path/to/your/Nexus-Vault

# Telegram Proxy (optional, for China users)
TELEGRAM_PROXY=http://127.0.0.1:7890

# Newsflow Chat ID (optional, defaults to AUTHORIZED_USER_IDS)
NEWSFLOW_CHAT_ID=your_user_id_here
```

### Getting Your User ID

1. Open Telegram
2. Search for **@userinfobot**
3. Start the bot
4. It will display your User ID (a number like `123456789`)

### Getting MiniMax API Key

1. Go to [MiniMax Platform](https://platform.minimax.io)
2. Sign up or log in
3. Create an API key
4. Copy the key to your `.env` file

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
│   ├── install.sh         # Legacy installer
│   ├── ecosystem.config.js # PM2 config
│   └── .env.example       # Config template
├── install_launcher.sh    # Quick installer script
├── docs/                  # Documentation
└── README.md
```

## Troubleshooting

### Bot not responding

1. Check if NEXUS is running: `pm2 status`
2. Check logs: `pm2 logs nexus`
3. Restart: `pm2 restart nexus`

### Obsidian sync issues

1. Make sure iCloud is syncing your vault
2. Check the vault path in `.env`
3. Verify folder permissions

### Newsflow not working

1. Check API keys (MiniMax, Finnhub)
2. Verify `NEWSFLOW_CHAT_ID` is set
3. Check newsflow logs: look for `[Newsflow]` in `pm2 logs`

### Database errors

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
