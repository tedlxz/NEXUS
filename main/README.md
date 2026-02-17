# NEXUS CRM

> Personal CRM with Telegram Bot + Obsidian Vault

![Version](https://img.shields.io/badge/version-0.2.1-blue)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)
![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)

NEXUS 是一个个人 CRM 系统，运行在 Node.js 上，通过 Telegram Bot 与你交互，数据存储在 Obsidian Vault 中。

## 功能

- 🤖 **Telegram Bot** - 通过对话管理联系人
- 📇 **联系人管理** - 记录人脉信息、互动历史
- 📰 **新闻监控** - 自动追踪关注公司/人物的新闻
- 🔗 **关系匹配** - 智能关联新闻与人脉
- 📊 **Dashboard** - 查看 CRM 状态

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/your-username/nexus-crm.git
cd nexus-crm/main
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境

复制配置模板并填写你的配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入以下必要配置：

| 配置项 | 说明 | 获取方式 |
|--------|------|----------|
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token | @BotFather |
| `AUTHORIZED_USER_IDS` | 你的 Telegram ID | @userinfobot |
| `MINIMAX_API_KEY` | MiniMax API Key | MiniMax 控制台 |
| `VAULT_PATH` | Obsidian Vault 路径 | 打开 Vault 设置 |

### 4. 编译并启动

```bash
npm run build
npm start
```

### 5. 使用 Bot

打开 Telegram，向你的 Bot 发送 `/start`

## 配置说明

### 完整配置项

```bash
# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
AUTHORIZED_USER_IDS=6573965713
TELEGRAM_PROXY=  # 可选，国内需要代理

# AI
MINIMAX_API_KEY=sk-xxx...

# Vault
VAULT_PATH=~/Library/Mobile\ Documents/iCloud~md~obsidian/Documents/Nexus-Vault

# Web Dashboard (可选)
WEB_PASSWORD=secret
PORT=3000

# Newsflow (可选)
NEWSFLOW_CHAT_ID=6573965713
FINNHUB_API_KEY=  # 美股新闻
AKSHARE_ENABLED=true
```

## 命令列表

| 命令 | 说明 |
|------|------|
| `/start` | 启动 Bot |
| `/status` | 查看状态 |
| `/pending` | 查看待处理事项 |
| `/followup` | 查看需跟进的人 |
| `/dashboard` | 查看统计面板 |
| `/newsflow` | 手动触发新闻推送 |
| `/sync` | 同步 Vault 数据 |

## 目录结构

```
nexus-crm/
├── main/
│   ├── src/
│   │   ├── bot/           # Telegram Bot
│   │   ├── db/            # 数据库
│   │   ├── newsflow/      # 新闻模块
│   │   ├── vault/         # Obsidian 集成
│   │   └── web/           # Web Dashboard
│   ├── dist/              # 编译输出
│   ├── .env.example       # 配置模板
│   └── package.json
├── docs/                  # 文档
└── README.md
```

## 开发

### 本地开发

```bash
# 监听模式运行
npm run dev

# 运行 Newsflow 测试
npm run newsflow

# 查看日志
npm run logs
```

### 更新版本

```bash
# 拉取最新代码
git pull origin main

# 重新安装依赖
npm install

# 重新编译
npm run build

# 重启服务
npm run restart
```

## 技术栈

- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **Bot**: Telegraf
- **Database**: SQLite (better-sqlite3)
- **AI**: MiniMax API
- **Storage**: Obsidian Vault

## License

Private - All rights reserved

---

*Built with 🤖 for personal CRM management*
