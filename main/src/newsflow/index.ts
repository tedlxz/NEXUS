import { loadAllStarredData } from './services/starDataLoader';
import { fetchUSCompanyNews } from './services/finnhubApi';
import { fetchHKCompanyNews, fetchCNCompanyNews } from './services/akshareApi';
import { fetchAllNonListedNews } from './services/googleNewsRss';
import { aggregateNews, matchPeopleToArticles } from './services/newsAggregator';
import { generateDailyBriefing, filterArticlesWithAI } from './services/newsSummarizer';
import { sendBriefingToTelegram, sendErrorNotification } from './services/telegramPusher';
import { archiveBriefing } from './services/obsidianArchiver';
import type { DailyBriefing, NewsflowResult, NewsArticle } from './types';
import { newsflowConfig } from './config';

/**
 * Newsflow Main Entry Point
 *
 * Pipeline:
 * 1. Load starred companies + people from Obsidian
 * 2. Fetch news: Finnhub (US) + AKShare (HK/CN) + Google News (other + people)
 * 3. Aggregate & deduplicate
 * 4. Match people to articles
 * 5. AI summarization (MiniMax)
 * 6. Telegram push
 * 7. Obsidian archive
 */

export async function runNewsflow(): Promise<NewsflowResult> {
  console.log('='.repeat(50));
  console.log('[Newsflow] Starting daily news flow...');
  console.log('='.repeat(50));

  const startTime = Date.now();
  const stats = {
    companiesSearched: 0,
    usCompanies: 0,
    hkCompanies: 0,
    cnCompanies: 0,
    articlesFound: 0,
    peopleMatched: 0,
    apiCallsUsed: 0,
  };

  try {
    // ── Phase 1: Load starred data ──
    console.log('[Newsflow] Phase 1: Loading starred companies and people...');
    const { companies, people } = await loadAllStarredData();
    stats.companiesSearched = companies.length;
    stats.usCompanies = companies.filter(c => c.market === 'us').length;
    stats.hkCompanies = companies.filter(c => c.market === 'hk').length;
    stats.cnCompanies = companies.filter(c => c.market === 'cn').length;

    if (companies.length === 0 && people.length === 0) {
      throw new Error('No starred companies or people found in Obsidian');
    }

    console.log(`[Newsflow] Found ${companies.length} companies (US: ${stats.usCompanies}, HK: ${stats.hkCompanies}, CN: ${stats.cnCompanies}, other: ${companies.filter(c => c.market === 'other').length}), ${people.length} people`);

    // ── Phase 2: Fetch news from all sources ──
    console.log('[Newsflow] Phase 2: Fetching news...');

    // 2a. US stocks via Finnhub
    const usCompanies = companies.filter(c => c.market === 'us');
    console.log(`[Newsflow] 2a. Finnhub: ${usCompanies.length} US companies`);
    const usNews = await fetchUSCompanyNews(usCompanies);
    stats.apiCallsUsed += usCompanies.length;

    // 2b. HK stocks via AKShare
    const hkCompanies = companies.filter(c => c.market === 'hk');
    let hkNews = new Map<string, { articles: NewsArticle[]; hasMore: boolean }>();
    if (newsflowConfig.akshare.enabled && hkCompanies.length > 0) {
      console.log(`[Newsflow] 2b. AKShare: ${hkCompanies.length} HK companies`);
      hkNews = await fetchHKCompanyNews(hkCompanies);
      stats.apiCallsUsed += hkCompanies.length;
    } else if (hkCompanies.length > 0) {
      console.log(`[Newsflow] 2b. AKShare disabled, HK companies will use Google News fallback`);
    }

    // 2c. CN stocks via AKShare
    const cnCompanies = companies.filter(c => c.market === 'cn');
    let cnNews = new Map<string, { articles: NewsArticle[]; hasMore: boolean }>();
    if (newsflowConfig.akshare.enabled && cnCompanies.length > 0) {
      console.log(`[Newsflow] 2c. AKShare: ${cnCompanies.length} CN companies`);
      cnNews = await fetchCNCompanyNews(cnCompanies);
      stats.apiCallsUsed += cnCompanies.length;
    } else if (cnCompanies.length > 0) {
      console.log(`[Newsflow] 2c. AKShare disabled, CN companies will use Google News fallback`);
    }

    // 2c-post. Relevance filter: remove articles that don't actually mention the company
    // AKShare (东方财富) returns "related industry" news that may be about other companies
    for (const [companyName, data] of hkNews) {
      const nameLower = companyName.toLowerCase();
      // Build short name variants (e.g. "恩捷股份" → ["恩捷", "恩捷股份"])
      const nameVariants = [nameLower];
      if (nameLower.endsWith('股份') || nameLower.endsWith('科技') || nameLower.endsWith('集团')) {
        nameVariants.push(nameLower.slice(0, -2));
      }
      const filtered = data.articles.filter(a => {
        const text = `${a.title} ${a.summary || ''}`.toLowerCase();
        return nameVariants.some(v => text.includes(v));
      });
      if (filtered.length < data.articles.length) {
        console.log(`[Newsflow] Relevance filter: ${companyName} ${data.articles.length} → ${filtered.length} articles`);
        data.articles = filtered;
      }
    }
    for (const [companyName, data] of cnNews) {
      const nameLower = companyName.toLowerCase();
      const nameVariants = [nameLower];
      if (nameLower.endsWith('股份') || nameLower.endsWith('科技') || nameLower.endsWith('集团')) {
        nameVariants.push(nameLower.slice(0, -2));
      }
      const filtered = data.articles.filter(a => {
        const text = `${a.title} ${a.summary || ''}`.toLowerCase();
        return nameVariants.some(v => text.includes(v));
      });
      if (filtered.length < data.articles.length) {
        console.log(`[Newsflow] Relevance filter: ${companyName} ${data.articles.length} → ${filtered.length} articles`);
        data.articles = filtered;
      }
    }

    // 2d. Google News for:
    //   - Companies with market='other' (not listed / not US/HK/CN)
    //   - HK/CN companies that got 0 results from AKShare (fallback)
    //   - Starred people only (not all people)
    const otherCompanies = companies.filter(c => c.market === 'other');
    const hkFallback = hkCompanies.filter(c => {
      const news = hkNews.get(c.name);
      return !news || news.articles.length === 0;
    });
    const cnFallback = cnCompanies.filter(c => {
      const news = cnNews.get(c.name);
      return !news || news.articles.length === 0;
    });
    const googleNewsCompanies = [...otherCompanies, ...hkFallback, ...cnFallback];

    // Only fetch news for starred people
    const starredPeople = people.filter(p => p.isStarred);
    console.log(`[Newsflow] 2d. Google News: ${googleNewsCompanies.length} companies + ${starredPeople.length} starred people`);
    const { privateCompanyNews, personNews } = await fetchAllNonListedNews({
      privateCompanies: googleNewsCompanies.map(c => c.name),
      people: starredPeople,
    });
    stats.apiCallsUsed += googleNewsCompanies.length + people.length;

    // Merge Google News fallback results into hkNews/cnNews maps
    for (const c of hkFallback) {
      const articles = privateCompanyNews.get(c.name) || [];
      if (articles.length > 0) {
        hkNews.set(c.name, { articles, hasMore: articles.length >= 5 });
      }
    }
    for (const c of cnFallback) {
      const articles = privateCompanyNews.get(c.name) || [];
      if (articles.length > 0) {
        cnNews.set(c.name, { articles, hasMore: articles.length >= 5 });
      }
    }

    // Build "other" company news map from Google News results
    const otherNews = new Map<string, { articles: NewsArticle[]; hasMore: boolean }>();
    for (const c of otherCompanies) {
      const articles = privateCompanyNews.get(c.name) || [];
      otherNews.set(c.name, { articles, hasMore: articles.length >= 5 });
    }

    // ── Phase 3: Aggregate ──
    console.log('[Newsflow] Phase 3: Aggregating news...');
    const companyNews = new Map([...usNews, ...hkNews, ...cnNews, ...otherNews]);

    // For aggregateNews, privateCompanyNews should only contain companies
    // NOT already in companyNews (to avoid duplicates)
    const remainingPrivate = new Map<string, NewsArticle[]>();
    for (const [name, articles] of privateCompanyNews) {
      if (!companyNews.has(name)) {
        remainingPrivate.set(name, articles);
      }
    }

    const aggregated = aggregateNews({
      companyNews,
      privateCompanyNews: remainingPrivate,
      personNews,
    });
    const { personArticles } = aggregated;
    let { companyArticles, allArticles } = aggregated;
    stats.articlesFound = allArticles.length;

    // ── Phase 3b: AI article filtering ──
    console.log('[Newsflow] Phase 3b: AI filtering articles...');
    try {
      const filteredCompanyArticles = await filterArticlesWithAI(companyArticles);
      companyArticles = filteredCompanyArticles;
      // Rebuild allArticles from filtered company articles + person articles
      const filteredAll: NewsArticle[] = [];
      for (const articles of filteredCompanyArticles.values()) {
        filteredAll.push(...articles);
      }
      for (const articles of personArticles.values()) {
        filteredAll.push(...articles);
      }
      allArticles = filteredAll;
      console.log(`[Newsflow] After AI filtering: ${allArticles.length} articles (was ${stats.articlesFound})`);
    } catch (err) {
      console.error('[Newsflow] AI filtering failed, using unfiltered articles:', err);
    }

    // ── Phase 4: Match people to articles ──
    console.log('[Newsflow] Phase 4: Matching people to articles...');
    const personMatches = matchPeopleToArticles(people, allArticles);
    stats.peopleMatched = personMatches.length;

    // ── Phase 5: AI summarization ──
    console.log('[Newsflow] Phase 5: AI summarization...');
    const today = new Date().toISOString().slice(0, 10);

    let aiSummary = '今日暂无新闻摘要。';
    let aiInsight = '';
    let enrichedPersonMatches = personMatches;

    if (allArticles.length > 0) {
      try {
        const companyHasMore = new Map<string, boolean>();
        for (const [name, data] of companyNews) {
          companyHasMore.set(name, data.hasMore);
        }

        const aiResult = await generateDailyBriefing({
          companyArticles,
          companyHasMore,
          personMatches,
          allArticles,
        });
        aiSummary = aiResult.aiSummary;
        aiInsight = aiResult.aiInsight;
        enrichedPersonMatches = aiResult.enrichedPersonMatches;
      } catch (err) {
        console.error('[Newsflow] AI summarization failed, using fallback:', err);
        aiSummary = allArticles.slice(0, 5).map(a => `• ${a.title}`).join('\n');
        aiInsight = '(AI 总结暂不可用)';
      }
    }

    // ── Build briefing ──
    const briefing: DailyBriefing = {
      date: today,
      companies: Array.from(companyArticles.entries()).map(([name, articles]) => ({
        name,
        ticker: companies.find(c => c.name === name)?.ticker,
        market: companies.find(c => c.name === name)?.market,
        articles,
        hasMoreArticles: companyNews.get(name)?.hasMore || false,
      })),
      people: Array.from(personArticles.entries()).map(([name, articles]) => {
        const person = people.find(p => p.name === name);
        return {
          name,
          company: person?.company,
          role: person?.role,
          articles,
        };
      }),
      personMatches: enrichedPersonMatches,
      aiSummary,
      aiInsight,
      generatedAt: new Date().toISOString(),
    };

    // ── Phase 6: Telegram push ──
    console.log('[Newsflow] Phase 6: Sending to Telegram...');
    let telegramSuccess = false;
    try {
      telegramSuccess = await sendBriefingToTelegram(briefing);
    } catch (err) {
      console.error('[Newsflow] Telegram push failed:', err);
    }

    // ── Phase 7: Obsidian archive ──
    console.log('[Newsflow] Phase 7: Archiving to Obsidian...');
    let archiveSuccess = false;
    try {
      archiveSuccess = await archiveBriefing(briefing);
    } catch (err) {
      console.error('[Newsflow] Obsidian archive failed:', err);
    }

    const duration = Date.now() - startTime;
    console.log('='.repeat(50));
    console.log(`[Newsflow] Completed in ${duration}ms`);
    console.log(`[Newsflow] Stats:`, stats);
    console.log(`[Newsflow] Telegram: ${telegramSuccess ? '✅' : '❌'}`);
    console.log(`[Newsflow] Archive: ${archiveSuccess ? '✅' : '❌'}`);
    console.log('='.repeat(50));

    return { success: true, briefing, stats };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Newsflow] Error:', errorMessage);
    try {
      await sendErrorNotification(errorMessage);
    } catch { /* ignore notification failure */ }
    return { success: false, error: errorMessage, stats };
  }
}

// CLI runner
if (require.main === module) {
  runNewsflow()
    .then(result => {
      if (result.success) {
        console.log('[Newsflow] Run completed successfully.');
      } else {
        console.error('[Newsflow] Run failed:', result.error);
      }
      process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
      console.error('[Newsflow] Unhandled error:', err);
      process.exit(1);
    });
}

export default runNewsflow;
