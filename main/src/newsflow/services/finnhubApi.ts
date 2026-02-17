import { newsflowConfig } from '../config';
import type { NewsArticle, Company } from '../types';

/**
 * Finnhub.io Service
 * 
 * Used for US-listed companies
 * Free tier: 60 API calls/minute, 100,000 calls/day
 * Provides company news, market news, etc.
 */

interface FinnhubNewsResponse {
  id: number;
  headline: string;
  summary: string;
  url: string;
  source: string;
  datetime: number;
  related: string;
  image: string;
}

/**
 * Fetch news for a single US company
 */
async function fetchCompanyNews(
  ticker: string,
  options: { from?: string; to?: string } = {}
): Promise<NewsArticle[]> {
  if (!newsflowConfig.finnhub.apiKey) {
    console.warn('[Newsflow] No Finnhub API key configured');
    return [];
  }

  const { from, to } = options;
  const today = new Date();
  const fromDate = from || new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const toDate = to || today.toISOString().slice(0, 10);

  try {
    const url = `${newsflowConfig.finnhub.baseUrl}/company-news?symbol=${ticker}&from=${fromDate}&to=${toDate}&token=${newsflowConfig.finnhub.apiKey}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Finnhub API error: ${response.status}`);
    }
    
    const data = await response.json() as FinnhubNewsResponse[];
    
    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }

    // Filter by actual timestamp (last 24h) — Finnhub date params use calendar dates
    // so articles near midnight boundaries may be older than 24h
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const recent = data.filter(item => item.datetime * 1000 >= cutoff);

    const articles: NewsArticle[] = recent.slice(0, 5).map(item => ({
      id: String(item.id),
      title: item.headline,
      summary: item.summary,
      source: 'finnhub',
      url: item.url,
      publishedAt: new Date(item.datetime * 1000).toISOString(),
      keywords: [ticker, ...(item.related?.split(',').filter(Boolean) || [])],
    }));

    console.log(`[Newsflow] Finnhub: found ${articles.length} articles for ${ticker} (${data.length - recent.length} filtered as outdated)`);
    
    return articles;
  } catch (error) {
    console.error(`[Newsflow] Error fetching Finnhub news for ${ticker}:`, error);
    return [];
  }
}

/**
 * Fetch news for multiple US companies
 */
export async function fetchUSCompanyNews(
  companies: Company[],
  options: { maxArticlesPerCompany?: number } = {}
): Promise<Map<string, { articles: NewsArticle[]; hasMore: boolean }>> {
  const results = new Map<string, { articles: NewsArticle[]; hasMore: boolean }>();
  const { maxArticlesPerCompany = 5 } = options;

  if (!newsflowConfig.finnhub.apiKey) {
    console.warn('[Newsflow] No Finnhub API key, skipping US stock news');
    return results;
  }

  const usCompanies = companies.filter(c => c.market === 'us' && c.ticker);

  console.log(`[Newsflow] Fetching news for ${usCompanies.length} US companies via Finnhub`);

  for (const company of usCompanies) {
    const articles = await fetchCompanyNews(company.ticker!, {
      from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      to: new Date().toISOString().slice(0, 10),
    });

    results.set(company.name, {
      articles: articles.slice(0, maxArticlesPerCompany),
      hasMore: articles.length > maxArticlesPerCompany,
    });

    // Rate limiting: Finnhub free tier is 60 calls/min, so we can do ~1 call/sec safely
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return results;
}

/**
 * Get general market news from Finnhub
 */
export async function fetchMarketNews(): Promise<NewsArticle[]> {
  if (!newsflowConfig.finnhub.apiKey) {
    return [];
  }

  try {
    const url = `${newsflowConfig.finnhub.baseUrl}/news?category=general&token=${newsflowConfig.finnhub.apiKey}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Finnhub API error: ${response.status}`);
    }
    
    const data = await response.json() as FinnhubNewsResponse[];
    
    const articles: NewsArticle[] = data.slice(0, 10).map(item => ({
      id: String(item.id),
      title: item.headline,
      summary: item.summary,
      source: 'finnhub',
      url: item.url,
      publishedAt: new Date(item.datetime * 1000).toISOString(),
      keywords: [],
    }));

    console.log(`[Newsflow] Finnhub: found ${articles.length} market news`);
    
    return articles;
  } catch (error) {
    console.error('[Newsflow] Error fetching Finnhub market news:', error);
    return [];
  }
}

export default {
  fetchCompanyNews,
  fetchUSCompanyNews,
  fetchMarketNews,
};
