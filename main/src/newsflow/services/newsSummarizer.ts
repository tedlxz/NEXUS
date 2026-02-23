import { newsflowConfig } from '../config';
import type { NewsArticle, PersonMatch, DailyBriefing } from '../types';

/**
 * News Summarizer Service
 * 
 * Uses MiniMax M2.5 to:
 * 1. Summarize news articles
 * 2. Generate person relevance reasons
 * 3. Create overall briefing summary and insights
 */

interface MiniMaxMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface MiniMaxResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage?: {
    total_tokens: number;
  };
}

/**
 * Call MiniMax API
 */
export async function callMiniMax(
  messages: MiniMaxMessage[],
  options: {
    model?: string;
    temperature?: number;
  } = {}
): Promise<string> {
  const { model = newsflowConfig.minimax.model, temperature = 0.7 } = options;
  
  try {
    const response = await fetch(`${newsflowConfig.minimax.baseUrl}/text/chatcompletion_v2`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${newsflowConfig.minimax.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`MiniMax API error: ${response.status}`);
    }
    
    const data = await response.json() as MiniMaxResponse;
    const raw = data.choices[0]?.message?.content || '';
    // Strip <think>...</think> reasoning blocks from MiniMax output
    return raw.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
  } catch (error) {
    console.error('[Newsflow] Error calling MiniMax:', error);
    throw error;
  }
}

/**
 * Generate AI summary for a list of articles
 */
async function summarizeArticles(articles: NewsArticle[]): Promise<string> {
  if (articles.length === 0) {
    return '今日暂无高质量新闻。';
  }

  // Pre-filter articles with AI instructions
  const articlesText = articles
    .slice(0, 20)
    .map((a, i) => {
      let line = `${i + 1}. ${a.title}`;
      if (a.summary) {
        const brief = a.summary.slice(0, 100).replace(/\n/g, ' ').trim();
        if (brief) line += `\n   摘要: ${brief}`;
      }
      return line;
    })
    .join('\n');

  const messages: MiniMaxMessage[] = [
    {
      role: 'system',
      content: `你是一个专业的金融新闻分析师。请严格筛选新闻后进行总结。

【重要 - 必须过滤掉以下类型的新闻】
1. 股价变动相关新闻（涨跌、收盘价、开盘价、日内波动等）
2. 买入/卖出指令、交易信号
3. 大宗交易、机构持仓变动
4. 股票回购、分红派息
5. 简单的行情播报

【必须保留的新闻类型】
1. 公司基本面变化（营收、利润、业务扩张）
2. 重大高管变动（CEO、CFO、董事长任命/离职）
3. 重大产品发布、技术突破
4. 并购、融资、战略合作
5. 监管、法律诉讼、重大风险
6. 深度分析、行业趋势解读

【筛选规则】
1. 每家公司最多保留2条最有价值的新闻
2. 优先保留上述"必须保留"的新闻类型
3. 过滤掉所有股价、交易相关内容
4. 如果筛选后没有合适新闻，返回"今日暂无值得关注的高质量新闻"

【新闻列表】
${articlesText}`,
    },
    {
      role: 'user',
      content: `请严格按规则筛选新闻，只保留真正有价值的公司动态。筛选后用80字以内总结保留的新闻要点。如果过滤后无新闻，请直接返回"今日暂无值得关注的高质量新闻"。`,
    },
  ];

  return await callMiniMax(messages);
}

/**
 * Generate relevance reason for a person match
 */
async function generatePersonReason(
  personName: string,
  company: string | undefined,
  articles: NewsArticle[]
): Promise<string> {
  if (articles.length === 0) {
    return `暂无 ${personName} 相关新闻。`;
  }
  
  const titles = articles.slice(0, 3).map(a => a.title).join('\n- ');
  
  const messages: MiniMaxMessage[] = [
    {
      role: 'system',
      content: '你是一个专业的人脉关系分析师。请分析新闻与人脉的关联性，给出推荐理由。',
    },
    {
      role: 'user',
      content: `请为以下人脉分析关联性：\n\n` +
        `人脉: ${personName}${company ? ` @ ${company}` : ''}\n` +
        `相关新闻:\n- ${titles}\n\n` +
        `请用 30 字以内的推荐理由。`,
    },
  ];
  
  return await callMiniMax(messages, { temperature: 0.5 });
}

/**
 * Generate overall daily insight
 */
async function generateDailyInsight(
  companiesSummary: string,
  peopleSummary: string
): Promise<string> {
  const messages: MiniMaxMessage[] = [
    {
      role: 'system',
      content: '你是一个专业的投资分析师。请基于每日的新闻和人脉信息，给出一句话的投资洞察。',
    },
    {
      role: 'user',
      content: `基于以下今日新闻摘要：\n\n` +
        `【公司新闻】\n${companiesSummary.slice(0, 500)}\n\n` +
        `【人脉关联】\n${peopleSummary.slice(0, 500)}\n\n` +
        `请用 50 字以内给出一句话洞察。需要包含具体的公司或行业机会。`,
    },
  ];
  
  return await callMiniMax(messages, { temperature: 0.7 });
}

/**
 * AI-based article pre-filtering
 *
 * Sends all articles to MiniMax and asks it to identify which ones
 * are worth keeping (filters out stock price, trading signals, etc.)
 */
export async function filterArticlesWithAI(
  companyArticles: Map<string, NewsArticle[]>
): Promise<Map<string, NewsArticle[]>> {
  // Build a numbered list of all articles grouped by company
  const companyEntries = Array.from(companyArticles.entries())
    .filter(([, articles]) => articles.length > 0);

  if (companyEntries.length === 0) {
    return companyArticles;
  }

  const articlesText = companyEntries
    .map(([name, articles]) => {
      const numbered = articles
        .map((a, i) => {
          let line = `  ${i + 1}. ${a.title}`;
          if (a.summary) {
            const brief = a.summary.slice(0, 80).replace(/\n/g, ' ').trim();
            if (brief) line += ` — ${brief}`;
          }
          return line;
        })
        .join('\n');
      return `【${name}】\n${numbered}`;
    })
    .join('\n\n');

  const messages: MiniMaxMessage[] = [
    {
      role: 'system',
      content: `你是一个专业的金融新闻编辑。请严格筛选新闻列表，只保留有价值且与该公司直接相关的新闻。

【必须过滤掉的新闻类型】
1. 股价变动（涨跌、收盘价、开盘价、日内波动等）
2. 买入/卖出指令、交易信号、投资评级变动
3. 大宗交易、机构持仓变动
4. 股票回购、分红派息
5. 简单的行情播报、涨跌幅排行
6. 期权、权证相关
7. 与该公司无直接关系的新闻（例如：恩捷的新闻里出现的纯粹讲宁德时代的内容，应当过滤）

【必须保留的新闻类型】
1. 公司基本面变化（营收、利润、业务扩张/收缩）
2. 重大高管变动（CEO、CFO、董事长任命/离职）
3. 重大产品发布、技术突破
4. 并购、融资、战略合作
5. 监管动态、法律诉讼、重大风险
6. 深度分析、行业趋势解读

【关键规则】
- 每条新闻必须与【】中标注的公司直接相关，而不仅仅是同行业的其他公司新闻
- 如果一条新闻的标题和摘要完全没提到该公司，必须过滤

【输出格式】
对每个公司，只输出保留的编号，格式：公司名:编号1,编号2
如果该公司所有新闻都应过滤，输出：公司名:无
每个公司一行。`,
    },
    {
      role: 'user',
      content: `请筛选以下新闻，只输出保留的编号：\n\n${articlesText}`,
    },
  ];

  try {
    const result = await callMiniMax(messages, { temperature: 0.3 });
    console.log(`[Newsflow] AI filter result:\n${result}`);

    const filtered = new Map<string, NewsArticle[]>();

    // Parse the response: each line is "公司名:编号1,编号2" or "公司名:无"
    for (const [name, articles] of companyEntries) {
      // Find the line matching this company name
      const regex = new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[:：]\\s*(.+)`, 'i');
      const match = result.match(regex);

      if (match) {
        const indices = match[1].trim();
        if (indices === '无' || indices === '无。') {
          console.log(`[Newsflow] AI filtered out all articles for ${name}`);
          // Don't add to filtered map — company will be skipped
          continue;
        }
        // Parse comma-separated indices
        const keepIndices = indices
          .split(/[,，、\s]+/)
          .map(s => parseInt(s.trim()))
          .filter(n => !isNaN(n) && n >= 1 && n <= articles.length);

        if (keepIndices.length > 0) {
          filtered.set(name, keepIndices.map(i => articles[i - 1]));
          console.log(`[Newsflow] AI kept ${keepIndices.length}/${articles.length} articles for ${name}`);
        } else {
          console.log(`[Newsflow] AI filtered out all articles for ${name} (no valid indices)`);
        }
      } else {
        // If parsing failed for this company, keep all articles as fallback
        filtered.set(name, articles);
        console.log(`[Newsflow] AI filter: no match for ${name}, keeping all`);
      }
    }

    return filtered;
  } catch (error) {
    console.error('[Newsflow] AI article filtering failed, keeping all articles:', error);
    return companyArticles;
  }
}

/**
 * Generate complete daily briefing with AI
 */
export async function generateDailyBriefing(options: {
  companyArticles: Map<string, NewsArticle[]>;
  companyHasMore: Map<string, boolean>;
  personMatches: PersonMatch[];
  allArticles: NewsArticle[];
}): Promise<{
  aiSummary: string;
  aiInsight: string;
  enrichedPersonMatches: PersonMatch[];
}> {
  const { companyArticles, companyHasMore, personMatches, allArticles } = options;
  
  // Prepare summaries for AI
  const companiesData = Array.from(companyArticles.entries()).map(([name, articles]) => ({
    name,
    articles,
    hasMore: companyHasMore.get(name) || false,
  }));
  
  const companiesSummary = companiesData
    .filter(d => d.articles.length > 0)
    .map(d => {
      const articleTexts = d.articles.map(a => {
        if (a.summary) return `${a.title} — ${a.summary.slice(0, 60)}`;
        return a.title;
      });
      return `${d.name}: ${articleTexts.join('; ')}`;
    })
    .join('\n');
  
  const peopleSummary = personMatches
    .map(m => `${m.person.name}: ${m.relatedArticles.map(a => a.title).join(', ')}`)
    .join('\n');
  
  // Generate AI summaries in parallel
  const [summary, insight, enrichedPersonMatches] = await Promise.all([
    summarizeArticles(allArticles),
    generateDailyInsight(companiesSummary, peopleSummary),
    // Enrich person matches with AI-generated reasons
    Promise.all(
      personMatches.map(async (match) => ({
        ...match,
        reason: await generatePersonReason(
          match.person.name,
          match.person.company,
          match.relatedArticles
        ),
      }))
    ),
  ]);
  
  return {
    aiSummary: summary,
    aiInsight: insight,
    enrichedPersonMatches,
  };
}

export default {
  callMiniMax,
  summarizeArticles,
  generatePersonReason,
  generateDailyInsight,
  filterArticlesWithAI,
  generateDailyBriefing,
};
