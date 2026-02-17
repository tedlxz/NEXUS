// Data models for Newsflow

export type StockMarket = 'us' | 'hk' | 'cn' | 'other';

export interface Company {
  id: string;
  name: string;
  ticker?: string; // Stock ticker symbol (e.g., AAPL, NVDA, 00700.HK, 600519.SS)
  market: StockMarket; // US, HK, CN, or other
  industry?: string;
  isStarred: boolean;
  tags: string[];
}

export interface Person {
  id: string;
  name: string;
  company?: string;
  role?: string;
  isStarred: boolean;
  tags: string[];
}

export interface NewsArticle {
  id: string;
  title: string;
  summary?: string;
  source: string; // 'finnhub' | 'akshare' | 'google-news'
  url: string;
  publishedAt: string;
  keywords: string[]; // Company or person names matched
  sentiment?: 'positive' | 'negative' | 'neutral';
}

export interface PersonMatch {
  person: Person;
  relevanceScore: number;
  reason: string;
  relatedArticles: NewsArticle[];
}

export interface DailyBriefing {
  date: string;
  companies: {
    name: string;
    ticker?: string;
    market?: StockMarket;
    articles: NewsArticle[];
    hasMoreArticles: boolean;
  }[];
  people: {
    name: string;
    company?: string;
    role?: string;
    articles: NewsArticle[];
  }[];
  personMatches: PersonMatch[];
  aiSummary: string;
  aiInsight: string;
  generatedAt: string;
}

export interface NewsflowResult {
  success: boolean;
  briefing?: DailyBriefing;
  error?: string;
  stats: {
    companiesSearched: number;
    usCompanies: number;
    hkCompanies: number;
    cnCompanies: number;
    articlesFound: number;
    peopleMatched: number;
    apiCallsUsed: number;
  };
}
