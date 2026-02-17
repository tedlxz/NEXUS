# Newsflow Coding Plan

> 生成日期: 2026-02-16
> 状态: ✅ 已完成搭建

---

## 📋 需求概述

每天 HKT 早上 9 点，自动搜索过去一天的新闻，关键词为用户标有 Star 标签的 Companies 和 People。

### 数据来源
- **上市公司**: newsfilter.io
- **非上市公司**: Google News RSS
- **人脉库人名**: Google News RSS

### 输出
- Telegram 简报推送
- Obsidian NewsFlow 文件夹归档

---

## 🏗️ 框架架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     Newsflow 每日流程                            │
├─────────────────────────────────────────────────────────────────┤
│  9:00 HKT 触发 (Cron)                                           │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│  │  读取 Star  │───▶│  新闻搜索   │───▶│  新闻获取   │      │
│  │  标签数据   │    │  (双源并行)  │    │             │      │
│  └─────────────┘    └─────────────┘    └─────────────┘      │
│                           │                     │              │
│                           ▼                     ▼              │
│                    ┌─────────────┐       ┌─────────────┐      │
│                    │ newsfilter  │       │ Google News │      │
│                    │   (上市)    │       │    RSS      │      │
│                    └─────────────┘       │  (非上市+人) │      │
│                                            └─────────────┘      │
│                                                   │              │
│                                                   ▼              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              MiniMax M2.5 总结引擎                        │   │
│  │  • 新闻摘要                                              │   │
│  │  • 人脉关联 (从 Obsidian 人脉库匹配)                     │   │
│  │  • 推荐理由                                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│                    ┌─────────────┐                             │
│                    │ Telegram    │                             │
│                    │ NEXUS Bot   │                             │
│                    └─────────────┘                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📊 API 配额规划

| 来源 | 免费额度 | 预估每日消耗 | 余量 |
|------|----------|-------------|------|
| Newsfilter.io | 100次/天 | 4-6次 (批量查询) | 94+ 次 |
| Google News RSS | 无限制 | 20-30次 (人名+非上市) | - |
| MiniMax M2.5 | - | ~100-150条新闻总结 | - |

---

## 📦 模块设计

### Phase 1: 数据层 (Data Layer)

| 任务 | 说明 |
|------|------|
| 1.1 | 创建 `newsflow/config.ts` - 配置文件 (vault path, API keys, cron schedule) |
| 1.2 | 创建 `newsflow/services/starDataLoader.ts` - 读取 Obsidian Star 标签的 Companies/People |
| 1.3 | 创建数据模型 `newsflow/types.ts` - Company, Person, NewsItem, DailyBriefing |

### Phase 2: 新闻抓取层 (News Fetching) ⚡ 优化

| 任务 | 说明 |
|------|------|
| 2.1 | 创建 `newsflow/services/newsFilterApi.ts` - newsfilter.io API |
| 2.1.1 | **批量查询优化**: 使用 Lucene 语法合并 5-10 家公司一次请求 `(symbols:AAPL OR symbols:TSLA OR symbols:NVDA)` |
| 2.1.2 | **排序优化**: 请求时加 `"sort": "relevance"` 确保拿最相关的 5 条 |
| 2.1.3 | **超额提示**: 如果 `total_results > 5`，在总结加提示 "该司今日动态较多，仅展示前5条" |
| 2.2 | 创建 `newsflow/services/googleNewsRss.ts` - Google News RSS 抓取 |
| 2.2.1 | **防爬控制**: 每抓一个关键词 `time.sleep(1-2)` 避免 403 |
| 2.3 | 创建 `newsflow/services/newsAggregator.ts` - 合并去重，按关键词分组 |

### Phase 3: AI 总结层 (AI Summarization)

| 任务 | 说明 |
|------|------|
| 3.1 | 创建 `newsflow/services/newsSummarizer.ts` - MiniMax M2.5 API 集成 |
| 3.2 | 实现人脉关联逻辑 - 从 Obsidian 人脉库匹配新闻中出现的公司/人名 |
| 3.3 | 生成推荐理由 - AI 分析为什么这条新闻与某个人脉相关 |

### Phase 4: 输出与推送层 (Output & Push)

| 任务 | 说明 |
|------|------|
| 4.1 | 创建 `newsflow/services/telegramPusher.ts` - Telegram Bot 推送 (token: `8181155200:AAFEBO0r1ANgnROqtoP6t1q1MvyBKZ68u4I`) |
| 4.2 | 创建 `newsflow/templates/dailyBriefing.ts` - 简报格式化模板 |
| 4.3 | 创建 `newsflow/services/obsidianArchiver.ts` - 自动归档到 `Nexus-Vault/NewsFlow/YYYY-MM-DD.md` |

### Phase 5: 调度层 (Scheduler)

| 任务 | 说明 |
|------|------|
| 5.1 | 创建 `newsflow/index.ts` - 主入口，整合所有模块 |
| 5.2 | 配置 Clawdbot Cron - 每天 HKT 9:00 触发 |
| 5.3 | 错误处理 & 日志 - 失败时发送告警 |

---

## 📁 目录结构

```
newsflow/
├── config.ts
├── types.ts
├── services/
│   ├── starDataLoader.ts
│   ├── newsFilterApi.ts
│   ├── googleNewsRss.ts
│   ├── newsAggregator.ts
│   ├── newsSummarizer.ts
│   ├── telegramPusher.ts
│   └── obsidianArchiver.ts
├── templates/
│   └── dailyBriefing.ts
├── index.ts
└── package.json
```

---

## 🔑 关键配置

- **Obsidian Vault 路径**: `/Users/tedliu/Library/Mobile Documents/iCloud~md~obsidian/Documents/Nexus-Vault`
- **Telegram Bot Token**: `8181155200:AAFEBO0r1ANgnROqtoP6t1q1MvyBKZ68u4I`
- **归档路径**: `Nexus-Vault/NewsFlow/`
- **运行时间**: 每天 HKT 09:00

---

## ⚠️ 注意事项

1. **Newsfilter.io API 限制**: 每次调用返回最多 5 条新闻，使用批量查询覆盖全部公司
2. **Google News RSS**: 需要添加延迟 (sleep 1-2s) 防止被封
3. **数据访问**: Star 标签的 Companies/People 数据需从 Obsidian vault 读取

---

## ✅ 待确认事项

- [ ] Obsidian Star 标签数据格式确认
- [x] 模板风格最终确认 → **简洁现代版 (模板 A)**
- [x] Telegram 推送目标 Chat ID → 6573965713
- [ ] newsfilter.io API Key
