import Parser from 'rss-parser';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { newsflowConfig } from '../config';
import type { NewsArticle, Person } from '../types';

/**
 * Google News RSS Service
 *
 * Used for:
 * 1. Non-listed companies (private companies)
 * 2. People from your network (search by person name + company)
 */

function createParser(): Parser {
  const opts: any = {
    customFields: {
      item: ['guid', 'enclosure'],
    },
    timeout: 15000,
  };

  // Use proxy if configured (needed in China for Google access)
  if (newsflowConfig.telegram.proxy) {
    const agent = new HttpsProxyAgent(newsflowConfig.telegram.proxy);
    opts.requestOptions = { agent };
  }

  return new Parser(opts);
}

const parser = createParser();

/**
 * Build Google News RSS URL for a search query
 * Uses "when:Nd" syntax for time filtering (as_min/as_max are ignored by RSS)
 */
function buildGoogleNewsUrl(query: string, days: number = 1): string {
  // Append "when:Nd" to the query — this is the only reliable date filter for Google News RSS
  const timeQuery = `${query} when:${days}d`;
  const encodedQuery = encodeURIComponent(timeQuery);
  return `${newsflowConfig.googleNews.rssBaseUrl}?q=${encodedQuery}&hl=en-US&gl=US&ceid=US:en`;
}

/**
 * Fetch news from Google News RSS for a single query
 */
async function fetchGoogleNews(query: string): Promise<NewsArticle[]> {
  const url = buildGoogleNewsUrl(query);

  try {
    const feed = await parser.parseURL(url);

    // Post-filter by timestamp (24h) — Google News sometimes returns older articles
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const recentItems = (feed.items || []).filter((item: any) => {
      const pubTime = new Date(item.pubDate || item.isoDate || 0).getTime();
      return pubTime >= cutoff;
    });

    const articles: NewsArticle[] = recentItems.slice(0, 5).map((item: any) => ({
      id: item.guid || item.link || Math.random().toString(36),
      title: item.title || '',
      summary: item.contentSnippet || item.content || '',
      source: 'google-news',
      url: item.link || '',
      publishedAt: item.pubDate || item.isoDate || new Date().toISOString(),
      keywords: [query],
    }));

    const filtered = (feed.items || []).length - recentItems.length;
    console.log(`[Newsflow] Google News: found ${articles.length} articles for "${query}"${filtered > 0 ? ` (${filtered} filtered as outdated)` : ''}`);

    return articles;
  } catch (error) {
    console.error(`[Newsflow] Error fetching Google News for "${query}":`, error);
    return [];
  }
}

/**
 * Fetch news for non-starred companies (private companies)
 */
export async function fetchPrivateCompanyNews(
  companyNames: string[]
): Promise<Map<string, NewsArticle[]>> {
  const results = new Map<string, NewsArticle[]>();

  for (const name of companyNames) {
    const articles = await fetchGoogleNews(`${name} company`);
    results.set(name, articles);

    // Delay to avoid 403 from Google
    await new Promise(resolve =>
      setTimeout(resolve, newsflowConfig.googleNews.delayMs)
    );
  }

  return results;
}

/**
 * Fetch news for people in your network
 * Search by "Name Company" to get relevant news
 */
export async function fetchPersonNews(
  people: Person[]
): Promise<Map<string, NewsArticle[]>> {
  const results = new Map<string, NewsArticle[]>();

  for (const person of people) {
    // Search query: "Name" or "Name Company" if company is known
    const query = person.company
      ? `"${person.name}" ${person.company}`
      : `"${person.name}"`;

    const articles = await fetchGoogleNews(query);
    results.set(person.name, articles);

    // Delay to avoid 403 from Google
    await new Promise(resolve =>
      setTimeout(resolve, newsflowConfig.googleNews.delayMs)
    );
  }

  return results;
}

/**
 * Fetch news for all non-listed entities
 */
export async function fetchAllNonListedNews(
  options: {
    privateCompanies?: string[];
    people?: Person[];
  } = {}
): Promise<{
  privateCompanyNews: Map<string, NewsArticle[]>;
  personNews: Map<string, NewsArticle[]>;
}> {
  const { privateCompanies = [], people = [] } = options;

  const [privateCompanyNews, personNews] = await Promise.all([
    fetchPrivateCompanyNews(privateCompanies),
    fetchPersonNews(people),
  ]);

  return { privateCompanyNews, personNews };
}

export default {
  fetchGoogleNews,
  fetchPrivateCompanyNews,
  fetchPersonNews,
  fetchAllNonListedNews,
};
