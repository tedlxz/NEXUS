import type { 
  NewsArticle, 
  Company, 
  Person, 
  DailyBriefing,
  PersonMatch 
} from '../types';

/**
 * News Aggregator Service
 * 
 * Combines and deduplicates news from multiple sources:
 * - Newsfilter.io (listed companies)
 * - Google News RSS (private companies & people)
 * 
 * Then prepares data for AI summarization.
 */

interface AggregatedNews {
  companyArticles: Map<string, NewsArticle[]>;
  personArticles: Map<string, NewsArticle[]>;
  allArticles: NewsArticle[];
}

/**
 * Aggregate news from all sources
 */
export function aggregateNews(options: {
  companyNews: Map<string, { articles: NewsArticle[]; hasMore: boolean }>;
  privateCompanyNews: Map<string, NewsArticle[]>;
  personNews: Map<string, NewsArticle[]>;
}): AggregatedNews {
  const { companyNews, privateCompanyNews, personNews } = options;
  
  const companyArticles = new Map<string, NewsArticle[]>();
  const allArticles: NewsArticle[] = [];
  
  // Merge listed company news
  for (const [name, data] of companyNews) {
    companyArticles.set(name, data.articles);
    allArticles.push(...data.articles);
  }
  
  // Merge private company news
  for (const [name, articles] of privateCompanyNews) {
    const existing = companyArticles.get(name) || [];
    companyArticles.set(name, [...existing, ...articles]);
    allArticles.push(...articles);
  }
  
  // Person news stays separate for now
  const personArticles = new Map<string, NewsArticle[]>();
  for (const [name, articles] of personNews) {
    personArticles.set(name, articles);
    allArticles.push(...articles);
  }
  
  // Deduplicate by URL
  const seen = new Set<string>();
  const uniqueArticles = allArticles.filter(article => {
    if (seen.has(article.url)) return false;
    seen.add(article.url);
    return true;
  });
  
  console.log(`[Newsflow] Aggregated: ${uniqueArticles.length} unique articles`);
  
  return {
    companyArticles,
    personArticles,
    allArticles: uniqueArticles,
  };
}

/**
 * Match people to relevant articles
 * 
 * Simple keyword matching:
 * - Person name in article title
 * - Person's company in article
 */
export function matchPeopleToArticles(
  people: Person[],
  articles: NewsArticle[]
): PersonMatch[] {
  const matches: PersonMatch[] = [];
  
  for (const person of people) {
    const relevantArticles: NewsArticle[] = [];
    
    for (const article of articles) {
      const titleLower = article.title.toLowerCase();
      const summaryLower = (article.summary || '').toLowerCase();
      
      // Check if person name or company mentioned
      const nameMatch = titleLower.includes(person.name.toLowerCase()) ||
        summaryLower.includes(person.name.toLowerCase());
      
      const companyMatch = person.company && (
        titleLower.includes(person.company.toLowerCase()) ||
        summaryLower.includes(person.company.toLowerCase())
      );
      
      if (nameMatch || companyMatch) {
        relevantArticles.push(article);
      }
    }
    
    if (relevantArticles.length > 0) {
      // Generate a simple reason
      const reason = person.company 
        ? `${person.name} 是 ${person.company} 的 ${person.role || '相关人员'}，新闻涉及该公司动态`
        : `${person.name} 相关新闻`;
      
      matches.push({
        person,
        relevanceScore: relevantArticles.length,
        reason,
        relatedArticles: relevantArticles,
      });
    }
  }
  
  console.log(`[Newsflow] Matched ${matches.length} people to articles`);
  
  return matches;
}

/**
 * Prepare data for AI summarization
 */
export function prepareForAI(
  options: {
    companyArticles: Map<string, NewsArticle[]>;
    personMatches: PersonMatch[];
    allArticles: NewsArticle[];
  }
): {
  companiesSummary: string;
  peopleSummary: string;
  articlesForSummary: NewsArticle[];
} {
  const { companyArticles, personMatches, allArticles } = options;
  
  // Build company summary
  const companySummaryParts: string[] = [];
  for (const [name, articles] of companyArticles) {
    if (articles.length > 0) {
      const titles = articles.map(a => `- ${a.title}`).join('\n');
      companySummaryParts.push(`### ${name}\n${titles}`);
    }
  }
  const companiesSummary = companySummaryParts.join('\n\n');
  
  // Build people summary
  const peopleSummaryParts: string[] = [];
  for (const match of personMatches) {
    const { person, reason, relatedArticles } = match;
    const titles = relatedArticles.map(a => `- ${a.title}`).join('\n');
    peopleSummaryParts.push(
      `### ${person.name} (${person.role || ''} @ ${person.company || 'N/A'})\n` +
      `推荐理由: ${reason}\n相关新闻:\n${titles}`
    );
  }
  const peopleSummary = peopleSummaryParts.join('\n\n');
  
  // Limit articles for AI to avoid token limits
  const articlesForSummary = allArticles.slice(0, 20);
  
  return {
    companiesSummary,
    peopleSummary,
    articlesForSummary,
  };
}

export default {
  aggregateNews,
  matchPeopleToArticles,
  prepareForAI,
};
