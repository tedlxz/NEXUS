# NEXUS — 产品需求文档 (PRD) v3

> **开发工具**: Claude Code  
> **用户**: PE（私募股权）投资团队（个人数据隔离，各自独立 Vault）  
> **核心定位**: AI 驱动的人脉知识库，Obsidian 为界面，自然语言为入口  

---

## 0. 架构理念

**传统 CRM 的问题**: 需要你打开一个专门的 App，找到对应的表单，填字段，点保存。这个流程太重了——你刚和人聊完，最想做的是随手记一笔，而不是填表。

**Nexus 的思路**: 把系统拆成三层，每层用最合适的工具：

| 层级 | 职责 | 工具 |
|------|------|------|
| **输入层** | 随时随地、用自然语言丢信息进来 | Telegram Bot（或最简 Web 输入框） |
| **处理层** | AI 理解你说的话，自动分类、结构化、归档 | Node.js 后端 + Anthropic API |
| **展示层** | 浏览、搜索、关联、思考 | Obsidian（本地 Markdown 文件，iCloud 同步） |

**数据流**:
```
你发一条消息 → Telegram Bot 接收 → 后端调用 AI 解析意图
  → AI 判断: 这是新联系人 / 对话记录 / 研究笔记
  → 生成或更新对应的 Markdown 文件
  → 写入 iCloud 文件夹
  → Obsidian 自动同步并展示
```

**为什么用 Obsidian？**
- 你和同事已经熟悉它，零学习成本
- Markdown 文件 = 数据完全属于你，没有平台锁定
- iCloud 同步 = 电脑和 iPhone 实时同步，不需要额外服务
- 插件生态强大：Smart Connections（语义搜索）、Dataview（结构化查询）、Graph View（关系图谱）
- 它本身就是一个极好的知识管理界面，不需要重新造轮子

---

## 1. 技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 运行时 | **Node.js + TypeScript** | 后端服务 |
| AI | **Anthropic API**（claude-sonnet-4-20250514） | 自然语言解析、Profile 生成、对话摘要、Brainstorm |
| 网络搜索 | **Anthropic API web_search tool** | 联系人公开信息补充 |
| 输入接口 (主) | **Telegram Bot API** | 随时发消息/文件，移动端体验最好 |
| 输入接口 (备) | **极简 Web 页面** | 一个输入框 + 发送按钮（用于粘贴长文本） |
| 数据存储 | **Markdown 文件** in iCloud Drive 文件夹 | Obsidian Vault 直接读取 |
| 数据同步 | **iCloud Drive** | Apple 原生，电脑和 iPhone 自动同步 |
| 展示层 | **Obsidian** | 浏览、搜索、关联、Graph View |
| 部署 | **Railway / Fly.io / VPS** | 轻量后端，24/7 运行接收消息 |

### 为什么用 Telegram Bot 而不是 WhatsApp？
- WhatsApp Business API 需要企业认证、付费、审核流程复杂
- Telegram Bot 完全免费、5 分钟即可创建、API 简洁强大
- 支持发送文件（可以直接丢 transcript 文件）
- 支持长文本消息（无 WhatsApp 的字数限制问题）
- 如果你强烈偏好 WhatsApp，也可以后续通过 WhatsApp Cloud API 接入，架构完全兼容

### 多用户方案
- 你和同事各自创建独立的 Telegram Bot（或共用一个 Bot，通过 Telegram user ID 区分）
- 各自拥有独立的 iCloud 文件夹 / Obsidian Vault
- 后端通过用户身份将文件写入各自的目录
- 数据完全隔离，互不可见

---

## 2. Obsidian Vault 结构（数据模型）

所有数据以 Markdown 文件形式存储在 iCloud Drive 中，Obsidian Vault 指向该文件夹。

```
Nexus-Vault/                              ← Obsidian Vault 根目录（在 iCloud Drive 中）
│
├── 📁 People/                            ← 联系人档案
│   ├── 张三.md
│   ├── 李四.md
│   └── ...
│
├── 📁 Conversations/                     ← 对话记录
│   ├── 2025-06-15 张三 微信电话.md
│   ├── 2025-06-18 李四 面谈.md
│   └── ...
│
├── 📁 Research/                          ← 研究课题 & Brainstorm
│   ├── 医疗器械出海东南亚.md
│   └── ...
│
├── 📁 Daily/                             ← 每日速记（Bot 收到的原始消息汇总）
│   ├── 2025-06-15.md
│   └── ...
│
├── 📁 Templates/                         ← Obsidian 模板
│   ├── Person Template.md
│   ├── Conversation Template.md
│   └── Research Template.md
│
├── 📁 _raw/                              ← 原始 transcript 文件存档
│   ├── 2025-06-15_张三_transcript.md
│   └── ...
│
└── 📁 _system/                           ← 系统文件（Obsidian 不直接展示）
    ├── index.json                        ← 联系人索引（加速 AI 检索）
    └── action-items.json                 ← 全局待办事项追踪
```

---

## 3. Markdown 文件格式

### 3.1 联系人档案 (`People/张三.md`)

```markdown
---
type: person
name: 张三
current_role: 独立 FA
current_org: 自营
industries:
  - 医疗
  - 消费
closeness: medium
how_we_met: 2024年 AVCJ 大会
introduced_by: "[[李四]]"
last_contact: 2025-06-15
tags:
  - 医疗
  - FA
  - 复星系
created: 2025-06-01
updated: 2025-06-15
---

# 张三

## Profile
- **当前职位**: 独立 FA（自营）
- **所在地**: 北京
- **性格备注**: 务实，关系网广，对医疗赛道有深度认知

## 职业经历
- **2023–至今**: 独立 FA
- **2018–2023**: VP @ 复星集团（医疗、消费投资）
- **2015–2018**: 咨询顾问 @ 麦肯锡（北京）

## 教育背景
- 清华大学 经管学院 MBA

## 擅长领域
医疗投资、消费投资、尽职调查、交易撮合

## 关键人脉
- 复星医疗团队
- [[王五]]（印尼 distributor）

## 互联网公开信息
> *AI 通过 web_search 补充，最后更新: 2025-06-02*
> （LinkedIn 摘要、公开报道等）

## 对话记录
- [[2025-06-15 张三 微信电话]]
- [[2025-05-20 张三 面谈]]

## 我的备注
- 对医疗器械出海东南亚很有认知，手上有当地渠道资源
- 聊完感觉他手上有 proprietary deal flow
```

**关键设计**:
- YAML frontmatter 存储结构化元数据 → Dataview 插件可查询
- `[[双链]]` 连接到其他联系人和对话 → Obsidian Graph View 自动生成关系图谱
- 对话记录区域自动维护链接列表 → 点击直达每次对话详情

### 3.2 对话记录 (`Conversations/2025-06-15 张三 微信电话.md`)

```markdown
---
type: conversation
contact: "[[张三]]"
date: 2025-06-15
end_date: 2025-06-15
source: 微信电话
location:
occasion: 他主动打来聊近况
initiated_by: them
sentiment: positive
relationship_signal: strengthening
follow_up_date: 2025-07-01
follow_up_context: 等张三把王五的微信推给我
tags:
  - 医疗器械出海
  - 东南亚
created: 2025-06-15
---

# 2025-06-15 与[[张三]]的微信电话

## AI 摘要
今天和张三通了一个半小时电话，主要聊了三个话题。首先是关于医疗器械出海东南亚的机会——他认为未来 2-3 年是窗口期，尤其看好印尼和越南市场。其次他提到正在帮一家国产内窥镜企业做 FA，对这个细分赛道的竞争格局非常了解。最后聊到了他在印尼的渠道资源，他的前同事[[王五]]现在是当地最大医疗器械 distributor 的 BD 负责人。

## 关键话题
- 医疗器械出海东南亚
- 国产内窥镜企业 FA 项目
- 印尼/越南市场渠道

## 核心洞察
张三认为医疗器械出海东南亚是未来 2-3 年的窗口期。他手上有当地渠道资源，且近期正在帮一家国产内窥镜企业做 FA，对这个细分赛道的竞争格局非常了解。

## 提到的公司
- 迈瑞医疗
- 公司 A（内窥镜）
- 公司 B（越南经销商）

## 提到的人物
- [[王五]] — 印尼最大医疗器械 distributor 的 BD 负责人，张三的前同事
- 赵六 — 公司 A 的 CEO，清华校友

## 提到的交易/项目
- 公司 A 的 B 轮融资（DD 阶段，预计 Q3 close）

## 行动项
- [ ] 发送东南亚医疗器械市场报告给张三 ⏫ 📅 2025-06-20
- [ ] 张三推送[[王五]]的微信给我 👤them 📅 2025-06-22
- [ ] 三方拉群讨论印尼渠道合作 👤both 📅 2025-07-01

## 我的备注
感觉他对这个 deal 比上次积极很多。聊完感觉他手上有 proprietary deal flow。

---

## 原始 Transcript
> [点击展开完整对话记录]
> ![[2025-06-15_张三_transcript]]
```

**关键设计**:
- 行动项用 Obsidian 原生 checkbox `- [ ]`，可以直接在 Obsidian 中勾选完成
- 原始 transcript 用 `![[嵌入链接]]` 引用 `_raw/` 目录中的完整文件，保持对话页面简洁
- `[[双链]]` 到联系人和其他提到的人 → 自动出现在 Graph View 中

### 3.3 研究课题 (`Research/医疗器械出海东南亚.md`)

```markdown
---
type: research
topic: 医疗器械出海东南亚
status: active
created: 2025-06-20
updated: 2025-06-20
---

# 医疗器械出海东南亚

## 研究描述
正在研究中国医疗器械企业出海东南亚的投资机会，想找有相关资源和认知的人聊聊。

## AI 推荐的相关人脉

### [[张三]] — 相关度: ⭐⭐⭐⭐⭐ (95%)
**推荐理由**: 张三在复星期间深度参与医疗投资，近期对话中明确提到看好医疗器械出海东南亚，并表示手上有印尼和越南的当地渠道资源。
**建议接触方式**: 以跟进上次对话中提到的东南亚医疗器械话题为切入点。
**证据**: [[2025-06-15 张三 微信电话]] — 讨论了医疗器械出海东南亚的机会窗口

### [[李四]] — 相关度: ⭐⭐⭐ (60%)
**推荐理由**: 李四虽然主要关注消费赛道，但他在东南亚有广泛的产业人脉...
**建议接触方式**: ...
**证据**: ...

## 拓展建议
AI 建议你可以拓展以下类型的人脉来加深对该领域的认知：
- 国产医疗器械企业的海外业务负责人
- 东南亚本地的医疗器械经销商/渠道商
- 关注出海赛道的 FA 或投行人士
```

### 3.4 每日速记 (`Daily/2025-06-15.md`)

```markdown
---
type: daily
date: 2025-06-15
---

# 2025-06-15 速记

## 10:32
> 今天见了王明，他是 ABC Capital 的 Partner，之前在高盛做 IBD。主要看 TMT 和新能源。是在昨天的 LP 年会上认识的。
→ ✅ 已创建: [[王明]]

## 14:15
> [上传了一段 transcript]
> 这是我和张三今天的通话记录
→ ✅ 已创建: [[2025-06-15 张三 微信电话]]

## 18:40
> 帮我想想我认识的人里谁对东南亚医疗器械出海这个方向有认知
→ ✅ 已创建: [[医疗器械出海东南亚]]（Research）
```

**作用**: 记录你每天通过 Bot 发送的所有原始消息和系统处理结果，相当于操作日志。

---

## 4. 系统文件

### 4.1 联系人索引 (`_system/index.json`)

AI 做 Brainstorm 时需要快速遍历所有联系人。每次创建/更新联系人时同步更新此索引。

```json
{
  "contacts": [
    {
      "name": "张三",
      "file": "People/张三.md",
      "current_role": "独立 FA",
      "current_org": "自营",
      "industries": ["医疗", "消费"],
      "closeness": "medium",
      "last_contact": "2025-06-15",
      "tags": ["医疗", "FA", "复星系"],
      "recent_conversations_summary": [
        "2025-06-15: 讨论医疗器械出海东南亚，提到印尼渠道资源和国产内窥镜 FA 项目"
      ]
    }
  ]
}
```

### 4.2 行动项追踪 (`_system/action-items.json`)

全局行动项索引，用于 Daily 汇总和提醒。

```json
{
  "items": [
    {
      "description": "发送东南亚医疗器械市场报告给张三",
      "owner": "me",
      "due_date": "2025-06-20",
      "status": "pending",
      "source_conversation": "Conversations/2025-06-15 张三 微信电话.md",
      "contact": "张三"
    }
  ]
}
```

---

## 5. 输入层：Telegram Bot

### 5.1 Bot 基本信息
- 通过 Telegram @BotFather 创建
- Bot 名称建议: `@NexusPEBot`（或任意自定义名）
- 仅响应已授权的 Telegram user ID（你和同事各自的 ID），忽略其他人的消息

### 5.2 AI 意图识别

Bot 收到消息后，先调用 Anthropic API 判断意图。用户不需要学任何命令，直接用自然语言说话。

**AI 意图分类 Prompt（核心逻辑）**:

```
你是 Nexus 系统的 AI 助手，帮助 PE 投资专业人士管理人脉和对话。

用户会通过聊天给你发送自然语言消息。请判断用户的意图，并以 JSON 格式返回。

可能的意图:
1. "new_contact" — 用户提到了一个新认识的人或想记录某人的信息
2. "log_conversation" — 用户提供了一段对话内容或 transcript
3. "update_contact" — 用户提到了某个已有联系人的新信息
4. "brainstorm" — 用户想从人脉库中找相关的人
5. "query" — 用户在查询某个联系人或对话的信息
6. "action_item" — 用户想添加或更新一个待办事项
7. "daily_note" — 普通的随手记，不属于以上任何类别

请输出:
{
  "intent": "...",
  "confidence": 0.0-1.0,
  "extracted_data": { ... },  // 根据意图提取的结构化信息
  "clarification_needed": "..." // 如果信息不足，需要向用户确认什么
}
```

### 5.3 各意图的处理流程

#### Intent: `new_contact`

用户说: *"今天见了王明，ABC Capital 的 Partner，之前在高盛做 IBD，主要看 TMT 和新能源。是在昨天 LP 年会上认识的。"*

处理流程:
1. AI 提取: name=王明, role=Partner, org=ABC Capital, background=高盛 IBD, industries=[TMT, 新能源], how_we_met=LP 年会
2. 调用 AI `parseProfile()` 生成完整结构化 Profile
3. 生成 `People/王明.md`（含 YAML frontmatter + 正文）
4. 更新 `_system/index.json`
5. 回复用户: "✅ 已创建王明的档案（ABC Capital, Partner）。需要我从互联网补充他的公开信息吗？"

#### Intent: `log_conversation`

用户说: *"这是我和张三今天的通话记录"*（附带一段文字或文件）

处理流程:
1. AI 识别联系人 = 张三（从 index.json 匹配）
2. 如果匹配不到，询问: "你说的张三是指 People/ 里的 [[张三]] 吗？还是一个新的联系人？"
3. 调用 AI `summarizeConversation()` 生成三层摘要
4. 生成 `Conversations/2025-06-15 张三 微信电话.md`
5. 将原始 transcript 存入 `_raw/2025-06-15_张三_transcript.md`
6. 更新 `People/张三.md` 中的对话记录链接列表 + `last_contact` 字段
7. 更新 `_system/index.json` 和 `_system/action-items.json`
8. 回复用户: "✅ 已记录与张三的对话。发现 3 个行动项和 1 个跟进提醒（7月1日）。"

#### Intent: `update_contact`

用户说: *"张三最近跳槽了，去了 XYZ Fund 做 MD"*

处理流程:
1. 匹配联系人 = 张三
2. 更新 `People/张三.md` 中的 current_role、current_org、职业经历时间线
3. 更新 YAML frontmatter
4. 更新 `_system/index.json`
5. 回复: "✅ 已更新张三的档案：MD @ XYZ Fund"

#### Intent: `brainstorm`

用户说: *"帮我想想我认识的人里谁对东南亚医疗器械出海有认知"*

处理流程:
1. 从 `_system/index.json` 加载全部联系人摘要
2. 对高相关度的联系人，读取其完整 `People/xxx.md` + 最近对话文件
3. 调用 AI `brainstorm()` 分析并推荐
4. 生成 `Research/医疗器械出海东南亚.md`
5. **Telegram 回复精简版推荐**:
   ```
   🧠 Brainstorm 结果: 医疗器械出海东南亚

   1️⃣ 张三 (⭐95%) — 复星医疗投资背景，上次通话明确提到看好该方向，
   手上有印尼渠道。建议以上次话题为切入点跟进。

   2️⃣ 李四 (⭐60%) — 东南亚有产业人脉，虽然主看消费，
   但可能有交叉资源。

   📝 完整报告已保存到 Obsidian: Research/医疗器械出海东南亚.md
   ```

#### Intent: `query`

用户说: *"张三上次和我聊了什么？"*

处理流程:
1. 读取 `People/张三.md` 中最近的对话链接
2. 读取对应对话文件的 AI 摘要
3. 回复摘要

#### Intent: `action_item`

用户说: *"提醒我下周三联系王明"*

处理流程:
1. 更新 `_system/action-items.json`
2. 如果有对应的对话文件，也在该文件中添加行动项
3. 回复: "✅ 已添加提醒：下周三联系王明"

### 5.4 Bot 交互风格

- 回复简短精练，不啰嗦
- 处理成功时给出确认 + 关键信息摘要
- 信息不足时主动追问（一次只问一个问题）
- 支持文字消息和文件上传（txt/pdf/doc）
- 支持语音消息（调用 Whisper API 转文字后处理）

### 5.5 特殊命令（可选，非必须）

虽然主要靠自然语言，但可以提供几个快捷命令:
- `/status` — 查看系统状态（联系人总数、近期对话数、待办事项）
- `/pending` — 列出所有待办行动项
- `/followup` — 列出需要跟进的联系人
- `/enrich 张三` — 从互联网补充张三的公开信息
- `/export` — 导出 index.json 的全量数据

---

## 6. 备用输入：极简 Web 页面

为了方便粘贴超长 transcript（Telegram 消息有长度上限），提供一个极简 Web 页面。

### 功能
- 一个大文本框 + "发送"按钮
- 可选: 联系人下拉选择（从 index.json 加载）
- 可选: 消息类型选择（新联系人 / 对话记录 / 随手记）
- 提交后走和 Telegram Bot 完全相同的处理逻辑

### 技术实现
- 单个 HTML 页面（或极简 Next.js 单页）
- 部署在和 Bot 后端相同的服务上
- 通过密码或 token 保护（简单认证即可）

---

## 7. 处理层：后端服务

### 7.1 项目结构

```
nexus-backend/
├── src/
│   ├── index.ts                    # 入口文件，启动 Bot + Web Server
│   ├── bot/
│   │   ├── telegram.ts             # Telegram Bot 连接和消息路由
│   │   └── handlers.ts             # 各意图的处理器
│   ├── ai/
│   │   ├── intent.ts               # 意图识别
│   │   ├── profile.ts              # parseProfile() — 背景 → 结构化 Profile
│   │   ├── conversation.ts         # summarizeConversation() — transcript → 三层摘要
│   │   ├── brainstorm.ts           # brainstorm() — 研究课题 → 人脉推荐
│   │   └── enrich.ts               # enrichFromWeb() — web_search 补充信息
│   ├── vault/
│   │   ├── writer.ts               # Markdown 文件的读写操作
│   │   ├── templates.ts            # 各类文件的 Markdown 模板
│   │   ├── index-manager.ts        # _system/index.json 的维护
│   │   └── action-items.ts         # _system/action-items.json 的维护
│   ├── web/
│   │   └── server.ts               # 极简 Web 输入页面
│   └── config.ts                   # 配置（路径、API Key 等）
├── .env
├── package.json
└── tsconfig.json
```

### 7.2 核心配置

```env
# .env
ANTHROPIC_API_KEY=sk-ant-...
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
AUTHORIZED_USER_IDS=123456789,987654321    # 允许使用 Bot 的 Telegram user ID
VAULT_PATH=/Users/你的用户名/Library/Mobile Documents/iCloud~md~obsidian/Documents/Nexus-Vault
WEB_PASSWORD=your-secret-password          # Web 输入页面的简单密码保护
```

### 7.3 Vault Writer（文件读写核心）

```typescript
// vault/writer.ts 核心职责:

class VaultWriter {
  // 创建联系人档案
  async createPerson(data: PersonData): Promise<string>
  // 更新联系人档案（合并新信息，不丢失旧数据）
  async updatePerson(name: string, updates: Partial<PersonData>): Promise<void>
  // 创建对话记录
  async createConversation(data: ConversationData): Promise<string>
  // 存储原始 transcript
  async saveRawTranscript(contactName: string, date: string, content: string): Promise<string>
  // 创建研究笔记
  async createResearch(data: ResearchData): Promise<string>
  // 追加每日速记
  async appendDailyNote(message: string, result: string): Promise<void>
  // 在联系人文件中添加对话链接
  async addConversationLink(contactName: string, conversationFile: string): Promise<void>
  // 读取联系人索引
  async readIndex(): Promise<ContactIndex>
  // 更新联系人索引
  async updateIndex(contact: ContactIndexEntry): Promise<void>
}
```

**关键原则**:
- 所有文件写入操作必须是**原子性的**（先写临时文件，再 rename，防止写入中断导致文件损坏）
- 更新已有文件时，**只修改需要更新的部分**，保留用户在 Obsidian 中手动编辑的内容
- 文件名中的特殊字符需要清理（不能包含 `/\:*?"<>|`）

---

## 8. AI 功能规格

### 8.1 意图识别 — `classifyIntent(message, hasAttachment)`

最核心的 AI 调用，决定后续所有处理逻辑。

**要求**:
- 必须准确区分"新联系人"和"对话记录"
- 模糊输入时优先归类为 `daily_note`，不要过度推断
- 信息不足时返回 `clarification_needed`（如"这段 transcript 是和谁的对话？"）

### 8.2 Profile 解析 — `parseProfile(name, rawText)`

同 v2 文档中的定义。输入一段自然语言背景描述，输出结构化 Profile JSON + 格式化的 Markdown 正文。

### 8.3 对话摘要 — `summarizeConversation(transcript, contactName, contactProfile)`

同 v2 文档中的三层结构定义。额外要求:
- 输出必须是可直接写入 Markdown 文件的格式
- 行动项必须使用 Obsidian checkbox 语法 `- [ ]`
- 提到的人名如果在 index.json 中存在，使用 `[[双链]]` 格式

### 8.4 Brainstorm — `brainstorm(topic, description, contactIndex)`

同 v2 文档中的定义。额外要求:
- 推荐结果中的联系人使用 `[[双链]]` 格式
- 证据引用使用对话文件的 `[[双链]]` 格式
- 输出可直接写入 Markdown 文件

### 8.5 Web Enrichment — `enrichFromWeb(name, currentProfile)`

使用 Anthropic API 的 web_search tool 搜索联系人公开信息，输出 Markdown 格式文本。

---

## 9. Obsidian 推荐插件配置

以下插件能让 Nexus Vault 的体验大幅提升，建议在首次设置时启用:

| 插件 | 用途 | 优先级 |
|------|------|------|
| **Smart Connections** | 语义搜索整个 Vault，相当于内置的 Brainstorm 能力 | ⭐⭐⭐ 必装 |
| **Dataview** | 用类 SQL 语法查询 frontmatter 数据（如"列出所有 closeness=close 且超过 30 天未联系的人"） | ⭐⭐⭐ 必装 |
| **Templater** | 手动在 Obsidian 中创建新文件时使用标准模板 | ⭐⭐ 推荐 |
| **Calendar** | 日历视图，快速跳转到某天的 Daily Note | ⭐⭐ 推荐 |
| **Tasks** | 全局追踪所有 `- [ ]` 行动项，支持日期筛选和排序 | ⭐⭐ 推荐 |
| **Graph View** (内置) | 可视化联系人关系网络（自动基于 `[[双链]]` 生成） | 内置 |

### Dataview 查询示例

在 Obsidian 中创建一个 "Dashboard.md" 文件，写入以下 Dataview 查询:

```
# Nexus Dashboard

## 需要跟进的联系人
​```dataview
TABLE current_role, last_contact, closeness
FROM "People"
WHERE closeness = "close" AND date(last_contact) < date(today) - dur(30 days)
SORT last_contact ASC
​```

## 待办行动项
​```dataview
TASK
FROM "Conversations"
WHERE !completed
SORT due ASC
​```

## 最近对话
​```dataview
TABLE contact, source, sentiment
FROM "Conversations"
SORT date DESC
LIMIT 10
​```

## 按行业分类的联系人
​```dataview
TABLE current_role, current_org, closeness
FROM "People"
WHERE contains(industries, "医疗")
SORT last_contact DESC
​```
```

---

## 10. 多用户方案

### 方案 A: 各自独立（推荐）
- 你和同事各自运行一个 Bot 后端实例（或共用一个实例，通过 Telegram user ID 路由到不同 VAULT_PATH）
- 各自拥有独立的 iCloud 文件夹和 Obsidian Vault
- 数据完全隔离

### 方案 B: 共用一个实例 + 用户路由
```typescript
// config.ts
const USERS = {
  "123456789": {  // 你的 Telegram ID
    name: "你",
    vaultPath: "/path/to/your/Nexus-Vault"
  },
  "987654321": {  // 同事的 Telegram ID
    name: "同事",
    vaultPath: "/path/to/colleague/Nexus-Vault"
  }
};
```
- 一个后端实例，根据消息发送者的 Telegram user ID 自动选择对应的 Vault 路径
- 各自的 iCloud / Obsidian 完全独立

### iCloud 同步注意事项
- Obsidian 在 iOS 上通过 iCloud Drive 同步 Vault
- 后端服务需要运行在能访问 iCloud Drive 的 Mac 上（或者用其他同步方案如 Syncthing）
- **替代方案**: 如果后端部署在云服务器上（无法直接写入 iCloud），可以改用 Git 同步:
  - 后端写入本地 Vault → 自动 git commit + push
  - 你的电脑上 git pull 同步 → Obsidian 读取
  - 或者使用 Obsidian Git 插件自动 pull

---

## 11. 开发顺序

### Phase 1 — 基础骨架
1. 初始化 Node.js + TypeScript 项目
2. 实现 VaultWriter（Markdown 文件读写 + 模板）
3. 创建 Obsidian Vault 目录结构和模板文件
4. 实现 `_system/index.json` 管理

### Phase 2 — AI + Telegram Bot
5. 封装 Anthropic API 调用（意图识别、Profile 解析、对话摘要）
6. 创建 Telegram Bot，实现消息接收和路由
7. 实现 `new_contact` 流程（自然语言 → 创建 People/ 文件）
8. 实现 `log_conversation` 流程（transcript → 创建 Conversations/ 文件）

### Phase 3 — 核心功能完善
9. 实现 `update_contact`、`query`、`action_item` 意图处理
10. 实现 `brainstorm` 功能（生成 Research/ 文件）
11. 实现 Web Enrichment（从互联网补充联系人信息）
12. 实现每日速记（Daily/ 文件）
13. 极简 Web 输入页面

### Phase 4 — Obsidian 配置
14. 配置 Dataview 查询（Dashboard.md）
15. 配置 Smart Connections 插件
16. 配置 Tasks 插件
17. 测试 iCloud 同步（iPhone ↔ Mac）

### Phase 5 — 增强
18. 文件上传处理（pdf/doc transcript）
19. 语音消息处理（Whisper API 转文字）
20. 多用户路由
21. 行动项定时提醒（Bot 主动推送）

---

## 12. 环境要求

```env
# .env
ANTHROPIC_API_KEY=sk-ant-...
TELEGRAM_BOT_TOKEN=...                      # 从 @BotFather 获取
AUTHORIZED_USER_IDS=123456789,987654321
VAULT_PATH=/path/to/iCloud/Nexus-Vault      # Obsidian Vault 在 iCloud 中的路径
WEB_PASSWORD=...
PORT=3000
```

### 启动命令
```bash
npm install
npm run build
npm start
```

---

## 13. 对比: 新架构 vs 旧架构

| 维度 | 旧方案（全栈 Web App） | 新方案（Obsidian + Bot） |
|------|------|------|
| 前端开发量 | 大（Next.js + 多页面 + 响应式） | 几乎为零（Obsidian 就是 UI） |
| 输入体验 | 打开网页 → 找表单 → 填字段 | 随手给 Bot 发消息，自然语言 |
| 数据格式 | PostgreSQL（被数据库锁定） | Markdown 文件（永远属于你） |
| 移动端 | 需要 PWA 适配 | Obsidian iOS App（已有）+ Telegram |
| 搜索能力 | 需要自建 | Smart Connections 插件（语义搜索） |
| 关系图谱 | 需要用 d3 自建 | Obsidian Graph View（内置，自动生成） |
| 结构化查询 | 需要写 SQL | Dataview 插件（类 SQL 查询 frontmatter） |
| 同步 | 需要 Supabase 云数据库 | iCloud Drive（Apple 原生） |
| 部署复杂度 | Vercel + Supabase | 一个 Node.js 进程 |
| 后续迁移 | 导出 JSON 再想办法 | 文件就在你电脑上，直接拿走 |
