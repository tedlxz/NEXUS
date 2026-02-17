# NEXUS CRM

> Personal CRM with Telegram Bot + Obsidian Vault

![Version](https://img.shields.io/badge/version-0.2.2-blue)
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

### 一键安装 (推荐)

```bash
git clone https://github.com/tedlxz/NEXUS.git
cd NEXUS/main
chmod +x install.sh
./install.sh
```

安装脚本会自动：
1. 检测 Node.js 环境
2. 安装依赖
3. 引导配置
4. 编译并启动

### 手动安装

```bash
# 1. 克隆项目
git clone https://github.com/tedlxz/NEXUS.git
cd NEXUS/main

# 2. 安装依赖
npm install

# 3. 配置环境
cp .env.example .env
# 编辑 .env 填入配置

# 4. 编译
npm run build

# 5. 启动
npm start
```

## 配置说明

### 必要配置

| 配置项 | 说明 | 获取方式 |
|--------|------|----------|
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token | @BotFather |
| `AUTHORIZED_USER_IDS` | 你的 Telegram ID | @userinfobot |
| `MINIMAX_API_KEY` | MiniMax API Key | MiniMax 控制台 |
| `VAULT_PATH` | Obsidian Vault 路径 | 见下方 |

### Obsidian Vault 路径

**iCloud 路径：**
```
~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Nexus-Vault
```

**本地路径：**
```
~/Desktop/Project NEXUS/nexus-vault
```

### 可选配置

```bash
# Telegram 代理 (国内需要)
TELEGRAM_PROXY=http://127.0.0.1:7890

# Web Dashboard
WEB_PASSWORD=secret
PORT=3000

# 新闻监控
NEWSFLOW_CHAT_ID=6573965713
FINNHUB_API_KEY=  # 美股新闻
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

## 常用操作

```bash
npm start      # 启动
npm run stop   # 停止
npm run logs   # 查看日志
npm run restart # 重启
```

## 更新

```bash
git pull origin main
npm install
npm run build
npm run restart
```

## 技术栈

- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **Bot**: Telegraf
- **Database**: SQLite
- **AI**: MiniMax API
- **Storage**: Obsidian Vault

## License

Private - All rights reserved

---

*Built with 🤖 for personal CRM management*
