import fs from 'fs/promises';
import path from 'path';
import { newsflowConfig } from '../config';
import type { Company, Person, StockMarket } from '../types';
import { callMiniMax } from './newsSummarizer';

/**
 * StarDataLoader - Reads Star-tagged Companies and People from Obsidian Vault
 * 
 * Uses MiniMax AI to automatically determine:
 * - Is it a listed company?
 * - What is the ticker symbol?
 * - Which market (US/HK/CN)?
 */

/**
 * Use MiniMax AI to detect if company is listed and get ticker
 */
async function detectListedCompanyWithAI(companyName: string): Promise<{
  isListed: boolean;
  ticker?: string;
  market?: StockMarket;
  reasoning?: string;
}> {
  const messages = [
    {
      role: 'system',
      content: `你是一个专业的金融分析师。请根据公司名称判断是否是上市公司，并给出股票代码。

判断规则：
1. 如果是上市公司，给出准确的股票代码和市场
2. 美股：通常是无后缀的大写字母（如 AAPL, MSFT, GOOGL）
3. 港股：带 .HK 后缀（如 00700.HK, 09988.HK）
4. A股：带 .SS（上海）或 .SZ（深圳）后缀（如 600519.SS, 000001.SZ）
5. 如果不是上市公司或无法确定，返回 isListed: false

请用以下 JSON 格式返回：
{"isListed": true/false, "ticker": "股票代码或空", "market": "us/hk/cn/other 或空", "reasoning": "简短判断理由"}`
    },
    {
      role: 'user',
      content: `请判断以下公司是否是上市公司并给出股票代码：${companyName}`
    }
  ];

  try {
    const result = await callMiniMax(messages as any, { temperature: 0.3 });
    
    // Parse JSON from response
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        isListed: parsed.isListed || false,
        ticker: parsed.ticker,
        market: parsed.market,
        reasoning: parsed.reasoning
      };
    }
    
    return { isListed: false };
  } catch (error) {
    console.error(`[Newsflow] Error detecting listed company for ${companyName}:`, error);
    return { isListed: false };
  }
}

/**
 * Batch detect listed companies with AI (to reduce API calls)
 */
async function batchDetectListedCompanies(companies: Company[]): Promise<Company[]> {
  // Only check companies without existing ticker
  const companiesToCheck = companies.filter(c => !c.ticker);
  
  if (companiesToCheck.length === 0) {
    return companies;
  }

  console.log(`[Newsflow] Using MiniMax to detect ${companiesToCheck.length} listed companies...`);
  
  // Build a batch query for all companies
  const companyList = companiesToCheck.map(c => c.name).join('\n');
  
  const messages = [
    {
      role: 'system',
      content: `你是一个专业的金融分析师。请批量判断以下公司列表中哪些是上市公司。

对于每个公司，返回格式：公司在列表中的序号|是否上市|股票代码|市场

判断规则：
- 美股：无后缀大写字母 (AAPL, MSFT, GOOGL, TSLA, NVDA, META, AMZN 等)
- 港股：带 .HK 后缀 (00700.HK, 09988.HK 等)
- A股：带 .SS 或 .SZ 后缀 (600519.SS, 000001.SZ, 300750.SZ 等)

只返回上市公司，不上市的不要返回。格式示例：
1|是|AAPL|us
2|是|00700.HK|hk
3|是|600519.SS|cn`
    },
    {
      role: 'user',
      content: `请分析以下公司列表（按顺序编号）：\n${companyList}\n\n只返回上市公司，按格式：序号|是|ticker|market`
    }
  ];

  try {
    const result = await callMiniMax(messages as any, { temperature: 0.3 });
    
    // Parse results
    const lines = result.split('\n').filter(l => l.includes('|是|'));
    
    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length >= 4) {
        const index = parseInt(parts[0].trim()) - 1;
        const ticker = parts[2].trim();
        const market = parts[3].trim().toLowerCase() as StockMarket;
        
        if (index >= 0 && index < companiesToCheck.length) {
          companiesToCheck[index].ticker = ticker;
          companiesToCheck[index].market = market;
          console.log(`[Newsflow] Detected: ${companiesToCheck[index].name} -> ${ticker} (${market})`);
        }
      }
    }
  } catch (error) {
    console.error('[Newsflow] Error in batch detect:', error);
  }

  return companies;
}

export async function loadStarredCompanies(): Promise<Company[]> {
  const companiesPath = path.join(newsflowConfig.vault.path, 'Companies');
  
  try {
    const files = await fs.readdir(companiesPath);
    const companies: Company[] = [];
    
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      
      const filePath = path.join(companiesPath, file);
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Check if starred in frontmatter (starred: true)
      const starredMatch = content.match(/starred:\s*(true|false)/i);
      const isStarred = starredMatch?.[1]?.toLowerCase() === 'true';
      
      if (isStarred) {
        // Extract company name from filename
        const name = file.replace('.md', '');
        
        // Try to extract ticker and market from frontmatter
        const tickerMatch = content.match(/ticker:\s*["']?(\S+)["']?/i);
        let ticker = tickerMatch?.[1]?.replace(/["']/g, '');
        const marketMatch = content.match(/market:\s*["']?(\S+)["']?/i);
        let market: StockMarket = (marketMatch?.[1]?.replace(/["']/g, '').toLowerCase() as StockMarket) || 'other';

        // If no explicit market in frontmatter, detect from ticker format
        if (!marketMatch && ticker) {
          if (ticker.endsWith('.HK')) market = 'hk';
          else if (ticker.endsWith('.SS') || ticker.endsWith('.SZ')) market = 'cn';
          else if (/^[A-Z]{1,5}$/.test(ticker)) market = 'us';
        }
        
        companies.push({
          id: name.toLowerCase().replace(/\s+/g, '-'),
          name,
          ticker,
          market,
          isStarred: true,
          tags: ['star'],
        });
      }
    }
    
    console.log(`[Newsflow] Loaded ${companies.length} starred companies from Obsidian`);
    
    // Skip MiniMax detection for now - use manual tickers
    // const companiesWithDetection = await batchDetectListedCompanies(companies);
    
    // Manually add tickers for known companies
    for (const company of companies) {
      if (!company.ticker) {
        // Try to detect from company name
        const nameLower = company.name.toLowerCase();
        console.log('[Newsflow] Checking company:', company.name, 'market:', company.market);
        
        if (nameLower.includes('solidigm') || nameLower.includes('sk hynix') || nameLower.includes('hynix')) {
          // SK Hynix is Korean-listed (000660.KS) — not supported by Finnhub/AKShare
          // Use Google News as fallback
          company.ticker = undefined;
          company.market = 'other';
          console.log('[Newsflow] SK Hynix → Google News fallback');
        } else if (nameLower.includes('恩捷') || nameLower.includes('einc')) {
          company.ticker = '002812.SZ';
          company.market = 'cn';
          console.log('[Newsflow] Detected 恩捷股份 ticker');
        }
      }
    }
    
    return companies;
  } catch (error) {
    console.error('[Newsflow] Error loading starred companies:', error);
    return [];
  }
}

export async function loadStarredPeople(): Promise<Person[]> {
  const peoplePath = path.join(newsflowConfig.vault.path, 'People');
  
  try {
    const files = await fs.readdir(peoplePath);
    const people: Person[] = [];
    
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      
      const filePath = path.join(peoplePath, file);
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Check if starred in frontmatter (starred: true)
      const starredMatch = content.match(/starred:\s*(true|false)/i);
      const isStarred = starredMatch?.[1]?.toLowerCase() === 'true';
      
      if (isStarred) {
        // Extract person name from filename
        const name = file.replace('.md', '');
        
        // Try to extract company and role from content
        const companyMatch = content.match(/current_org:\s*(.+)/i);
        const roleMatch = content.match(/current_role:\s*(.+)/i);

        // Strip [[...]] wrappers and quotes from YAML values
        const rawCompany = companyMatch?.[1]?.trim().replace(/^["']|["']$/g, '').replace(/^\[\[|\]\]$/g, '') || undefined;
        const rawRole = roleMatch?.[1]?.trim().replace(/^["']|["']$/g, '') || undefined;

        people.push({
          id: name.toLowerCase().replace(/\s+/g, '-'),
          name,
          company: rawCompany,
          role: rawRole,
          isStarred: true,
          tags: ['star'],
        });
      }
    }
    
    console.log(`[Newsflow] Loaded ${people.length} starred people from Obsidian`);
    return people;
  } catch (error) {
    console.error('[Newsflow] Error loading starred people:', error);
    return [];
  }
}

export async function loadAllStarredData(): Promise<{
  companies: Company[];
  people: Person[];
}> {
  // 1. Load starred companies
  const companies = await loadStarredCompanies();

  // 2. Load starred people
  const starredPeople = await loadStarredPeople();

  // 3. Load ALL people from People folder (for relationship matching)
  // These are NOT monitored for news, but will be matched against company news
  const allPeopleFromVault = await loadAllPeople();

  // Combine: starred people + all other people for matching
  const allPeople = [...starredPeople, ...allPeopleFromVault];

  console.log(`[Newsflow] Loaded ${companies.length} companies, ${starredPeople.length} starred people, ${allPeopleFromVault.length} people for matching`);

  return { companies, people: allPeople };
}

/**
 * Load ALL people from People folder (regardless of starred status)
 * These are used for relationship matching, not direct monitoring
 */
async function loadAllPeople(): Promise<Person[]> {
  const peoplePath = path.join(newsflowConfig.vault.path, 'People');

  try {
    const files = await fs.readdir(peoplePath);
    const people: Person[] = [];

    for (const file of files) {
      if (!file.endsWith('.md')) continue;

      const filePath = path.join(peoplePath, file);
      const content = await fs.readFile(filePath, 'utf-8');

      // Skip if already starred (already loaded)
      const starredMatch = content.match(/starred:\s*(true|false)/i);
      const isStarred = starredMatch?.[1]?.toLowerCase() === 'true';
      if (isStarred) continue; // Already in starredPeople

      // Extract company and role
      const name = file.replace('.md', '');
      const companyMatch = content.match(/current_org:\s*(.+)/i);
      const roleMatch = content.match(/current_role:\s*(.+)/i);

      const rawCompany = companyMatch?.[1]?.trim().replace(/^["']|["']$/g, '').replace(/^\[\[|\]\]$/g, '') || undefined;
      const rawRole = roleMatch?.[1]?.trim().replace(/^["']|["']$/g, '') || undefined;

      people.push({
        id: name.toLowerCase().replace(/\s+/g, '-'),
        name,
        company: rawCompany,
        role: rawRole,
        isStarred: false,
        tags: ['for-matching'],
      });
    }

    return people;
  } catch (error) {
    console.error('[Newsflow] Error loading all people:', error);
    return [];
  }
}

export default {
  loadStarredCompanies,
  loadStarredPeople,
  loadAllStarredData,
  detectListedCompanyWithAI,
};
