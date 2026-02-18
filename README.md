# NEXUS CRM

> Personal Network Management for PE Professionals

![Version](https://img.shields.io/badge/version-0.3.0-blue)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)

NEXUS is a personal CRM system that combines a Telegram Bot with an Obsidian Vault. It helps you manage your professional network with AI-powered features.

## Why NEXUS?

Traditional CRM systems are:
- ❌ Too complex for personal use
- ❌ Require manual data entry
- ❌ Don't integrate with your note-taking workflow

NEXUS solves this by:
- ✅ Using Telegram as the interface (you're already here)
- ✅ Storing data in Obsidian (your second brain)
- ✅ AI-powered insights and automation

## Features

### 🖥️ NEXUS Launcher (macOS App)
桌面启动器，一键启动 NEXUS 服务：
- 简洁的 macOS 原生应用
- 自动检测并启动 Telegram Bot
- 状态指示（运行中/已停止）
- 支持 PM2 服务管理

### 🤖 Telegram Bot
Control everything from Telegram:
- Add/manage contacts
- Log conversations
- Track action items
- Trigger AI analysis

Commands:
- `/start` - Initialize bot
- `/add [name]` - Add new contact
- `/pending` - View action items
- `/followup` - People to reconnect with
- `/newsflow` - Get AI-curated news

### 📇 Contact Management
- Store contact details (name, role, company, how you met)
- Track relationship closeness
- Tag by industries/interests
- Link to company profiles

### 💬 Conversation Logging
Record conversations with:
- Date, location, occasion
- AI-generated summaries
- Key topics & insights
- Action items
- Related companies/people

### 📰 Newsflow (AI News Monitor)
Automated news monitoring for your network:

**What it monitors:**
- Starred companies (listed & private)
- Starred people

**What it delivers:**
- Daily AI-curated briefing
- Filters out noise (price movements, trading signals)
- Prioritizes: fundamentals, leadership changes, product launches, M&A

**Smart matching:**
- Matches news to related people in your network
- Recommends contacts based on news

### 🔗 Relationship Intelligence
- Automatically link contacts to companies
- Suggest people to reconnect with
- Track relationship signals (strengthening/cooling)

### 📊 Dashboard
View your network at a glance:
- Total contacts by closeness
- Recent conversations
- Upcoming follow-ups
- Industry distribution

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
                     │  (Cache)     │
                     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │  MiniMax AI │
                     │ (Analysis)  │
                     └──────────────┘
```

### Data Flow

1. **You** interact with Telegram Bot
2. **Bot** processes request, reads/writes to **Obsidian Vault**
3. **SQLite** caches data for fast search
4. **AI** generates summaries and insights

## Quick Start

```bash
# Clone
git clone https://github.com/tedlxz/NEXUS.git
cd NEXUS/main

# Install
chmod +x install.sh
./install.sh

# Or manually:
cp .env.example .env
npm install
npm run build
npm start
```

## Setup

### Required
1. **Telegram Bot** - Get from @BotFather
2. **Telegram Chat ID** - Get from @userinfobot
3. **MiniMax API Key** - For AI features
4. **Obsidian Vault** - Path to your vault

### Optional
- **Telegram Proxy** - For China users (auto-detected)
- **Finnhub API** - For US stock news
- **AKShare** - For HK/CN stock news

## Tech Stack

| Layer | Technology |
|-------|------------|
| Interface | Telegram Bot |
| Runtime | Node.js 18+ |
| Language | TypeScript |
| Database | SQLite |
| AI | MiniMax API |
| Storage | Obsidian Vault |
| News | Finnhub, AKShare, Google News |

## Project Structure

```
main/
├── src/
│   ├── bot/           # Telegram bot handlers
│   ├── db/            # Database layer
│   ├── newsflow/      # News monitoring
│   ├── vault/         # Obsidian integration
│   ├── ai/            # AI prompts & logic
│   └── web/           # Dashboard
├── install.sh         # One-click installer
└── .env.example       # Config template
```

## License

Private - All rights reserved

## Changelog

### v0.3.0 (2026-02-18)
- 新增 NEXUS Launcher macOS 桌面应用
- 新增 `install_launcher.sh` 一键安装脚本
- 支持 PM2 服务管理
- 增强 .env 配置检测与交互式配置向导

### v0.2.2 (2026-02-18)
- Initial release with Telegram bot
- Contact management via Telegram
- Conversation logging with AI summaries
- Newsflow AI news monitoring
- Obsidian vault integration
- SQLite caching layer
