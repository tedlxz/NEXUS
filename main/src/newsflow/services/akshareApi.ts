import { exec } from 'child_process';
import path from 'path';
import { newsflowConfig } from '../config';
import type { NewsArticle, Company } from '../types';

/**
 * AKShare Service
 * 
 * Used for China (A-share) and Hong Kong (HK) listed companies
 * AKShare is a Python library, so we run it via subprocess
 */

interface AKShareNewsItem {
  title: string;
  content: string;
  url: string;
  publish_date: string;
  source: string;
}

/**
 * Build Python script to fetch news via AKShare
 */
function buildAKShareScript(ticker: string): string {
  // AKShare uses stock_news_em for both HK and CN stocks
  return `
import akshare as ak
import json

try:
    news = ak.stock_news_em(symbol='${ticker}')
    if news is not None and len(news) > 0:
        result = []
        for _, row in news.head(5).iterrows():
            result.append({
                'title': str(row.get('新闻标题', '')),
                'content': str(row.get('新闻内容', ''))[:200],
                'url': str(row.get('新闻链接', '')),
                'publish_date': str(row.get('发布时间', '')),
                'source': str(row.get('文章来源', 'AKShare'))
            })
        print(json.dumps(result, ensure_ascii=False))
    else:
        print('[]')
except Exception as e:
    print(f'Error: {e}')
`;
}

/**
 * Fetch news for a single HK or CN company via AKShare
 */
async function fetchCompanyNews(
  ticker: string,
  market: 'hk' | 'cn'
): Promise<NewsArticle[]> {
  if (!newsflowConfig.akshare.enabled) {
    console.warn('[Newsflow] AKShare is not enabled');
    return [];
  }

  return new Promise((resolve) => {
    const script = buildAKShareScript(ticker);
    const pythonCmd = newsflowConfig.akshare.pythonPath;
    const fs = require('fs');
    const os = require('os');
    const tmpFile = path.join(os.tmpdir(), `akshare_${Date.now()}.py`);
    
    // Write script to temp file
    fs.writeFileSync(tmpFile, script, 'utf-8');
    
    exec(`${pythonCmd} ${tmpFile}`, { timeout: 30000 }, (error, stdout, stderr) => {
      // Clean up temp file
      try { fs.unlinkSync(tmpFile); } catch(e) {}
      
      if (error) {
        console.error(`[Newsflow] AKShare error for ${ticker}:`, error.message);
        resolve([]);
        return;
      }

      try {
        const data = JSON.parse(stdout.trim()) as AKShareNewsItem[];
        
        if (!Array.isArray(data) || data.length === 0) {
          resolve([]);
          return;
        }

        const articles: NewsArticle[] = data.map((item: AKShareNewsItem, index: number) => ({
          id: `${ticker}-${index}`,
          title: item.title || '',
          summary: item.content || '',
          source: 'akshare',
          url: item.url || '',
          publishedAt: item.publish_date ? new Date(item.publish_date).toISOString() : new Date().toISOString(),
          keywords: [ticker],
        }));

        console.log(`[Newsflow] AKShare: found ${articles.length} articles for ${ticker}`);
        resolve(articles);
      } catch (parseError) {
        console.error(`[Newsflow] Failed to parse AKShare output for ${ticker}:`, parseError);
        resolve([]);
      }
    });
  });
}

/**
 * Fetch news for multiple HK companies
 */
export async function fetchHKCompanyNews(
  companies: Company[]
): Promise<Map<string, { articles: NewsArticle[]; hasMore: boolean }>> {
  const results = new Map<string, { articles: NewsArticle[]; hasMore: boolean }>();
  
  if (!newsflowConfig.akshare.enabled) {
    console.warn('[Newsflow] AKShare not enabled, skipping HK stock news');
    return results;
  }

  const hkCompanies = companies.filter(c => c.market === 'hk' && c.ticker);
  
  console.log(`[Newsflow] Fetching news for ${hkCompanies.length} HK companies via AKShare`);

  for (const company of hkCompanies) {
    const articles = await fetchCompanyNews(company.ticker!, 'hk');
    
    results.set(company.name, {
      articles: articles.slice(0, 5),
      hasMore: articles.length > 5,
    });
    
    // Delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return results;
}

/**
 * Fetch news for multiple China (A-share) companies
 */
export async function fetchCNCompanyNews(
  companies: Company[]
): Promise<Map<string, { articles: NewsArticle[]; hasMore: boolean }>> {
  const results = new Map<string, { articles: NewsArticle[]; hasMore: boolean }>();
  
  if (!newsflowConfig.akshare.enabled) {
    console.warn('[Newsflow] AKShare not enabled, skipping CN stock news');
    return results;
  }

  const cnCompanies = companies.filter(c => c.market === 'cn' && c.ticker);
  
  console.log(`[Newsflow] Fetching news for ${cnCompanies.length} CN companies via AKShare`);

  for (const company of cnCompanies) {
    const articles = await fetchCompanyNews(company.ticker!, 'cn');
    
    results.set(company.name, {
      articles: articles.slice(0, 5),
      hasMore: articles.length > 5,
    });
    
    // Delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return results;
}

export default {
  fetchCompanyNews,
  fetchHKCompanyNews,
  fetchCNCompanyNews,
};
