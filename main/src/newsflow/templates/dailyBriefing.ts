import type { DailyBriefing } from '../types';

/**
 * Daily Briefing Template
 * 
 * Formats the briefing for Telegram using the "简洁现代" (Minimal Pro) style
 */

export function formatBriefingMessage(briefing: DailyBriefing): string {
  const lines: string[] = [];
  
  // Header
  lines.push(`📰 *NEXUS NEWSFLOW* | ${briefing.date}`);
  lines.push('');
  lines.push('*━━━━━━━━━━━━━━━━━━━━━━━━*');
  lines.push('');
  
  // AI Summary
  lines.push('📊 *今日新闻概要*');
  lines.push('');
  
  // Company news
  for (const company of briefing.companies) {
    if (company.articles.length > 0) {
      const ticker = company.ticker ? ` *${company.ticker}*` : '';
      lines.push(`📌 *${company.name}*${ticker}`);
      company.articles.slice(0, 3).forEach((article, idx) => {
        lines.push(`   ${idx + 1}. ${article.title}`);
        if (article.summary) {
          // Show first ~100 chars of summary as a brief description
          const brief = article.summary.slice(0, 100).replace(/\n/g, ' ').trim();
          if (brief) lines.push(`      ${brief}...`);
        }
      });
      if (company.hasMoreArticles) {
        lines.push(`   *↑ 该司今日动态较多，仅展示前3条*`);
      }
      if (company.articles.length > 0) {
        const firstArticle = company.articles[0];
        lines.push(`   来源: ${firstArticle.source === 'finnhub' ? 'Finnhub' : firstArticle.source === 'akshare' ? 'AKShare' : 'Google News'}`);
      }
      lines.push('');
    }
  }
  
  // Person news (if any)
  for (const person of briefing.people) {
    if (person.articles.length > 0) {
      const role = person.role ? ` @ ${person.role}` : '';
      lines.push(`📌 *${person.name}*${role}`);
      person.articles.slice(0, 2).forEach((article, idx) => {
        lines.push(`   ${idx + 1}. ${article.title}`);
        if (article.summary) {
          const brief = article.summary.slice(0, 100).replace(/\n/g, ' ').trim();
          if (brief) lines.push(`      ${brief}...`);
        }
      });
      lines.push(`   来源: Google News`);
      lines.push('');
    }
  }
  
  lines.push('*━━━━━━━━━━━━━━━━━━━━━━━━*');
  lines.push('');
  
  // Person Matches (人脉关联)
  if (briefing.personMatches.length > 0) {
    lines.push('👥 *人脉关联*');
    lines.push('');
    
    for (const match of briefing.personMatches) {
      const { person, reason, relatedArticles } = match;
      const role = person.role ? ` @ ${person.role}` : '';
      const company = person.company ? ` *${person.company}*` : '';
      
      lines.push(`▶ *${person.name}*${role}${company}`);
      lines.push(`   📍 推荐理由: ${reason}`);
      if (relatedArticles.length > 0) {
        lines.push(`   📰 相关: ${relatedArticles[0].title}`);
      }
      lines.push('');
    }
    
    lines.push('*━━━━━━━━━━━━━━━━━━━━━━━━*');
    lines.push('');
  }
  
  // AI Insight
  lines.push('💡 *洞察*');
  lines.push(briefing.aiInsight);
  lines.push('');
  lines.push('*━━━━━━━━━━━━━━━━━━━━━━━━*');
  lines.push('');
  lines.push(`🕐 HKT 09:00`);
  
  return lines.join('\n');
}

/**
 * Format a short test message
 */
export function formatTestMessage(): string {
  return `✅ *Newsflow 配置测试*\n\nTelegram 连接成功！`;
}

export default {
  formatBriefingMessage,
  formatTestMessage,
};
