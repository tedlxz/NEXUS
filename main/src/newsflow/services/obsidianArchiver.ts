import fs from 'fs/promises';
import path from 'path';
import { newsflowConfig, newsflowPaths } from '../config';
import type { DailyBriefing } from '../types';

/**
 * Obsidian Archiver Service
 * 
 * Saves daily briefing to Obsidian vault in NewsFlow folder
 */

interface DailyBriefingMarkdown {
  frontmatter: {
    date: string;
    type: string;
    companiesCount: number;
    peopleCount: number;
    articlesCount: number;
  };
  content: string;
}

/**
 * Convert briefing to Markdown format
 */
function briefingToMarkdown(briefing: DailyBriefing): string {
  const lines: string[] = [];
  
  // Frontmatter
  lines.push('---');
  lines.push(`date: ${briefing.date}`);
  lines.push('type: newsflow-briefing');
  lines.push(`companies: ${briefing.companies.length}`);
  lines.push(`people: ${briefing.people.length}`);
  lines.push(`articles: ${briefing.companies.reduce((sum, c) => sum + c.articles.length, 0)}`);
  lines.push(`generated: ${briefing.generatedAt}`);
  lines.push('---');
  lines.push('');
  
  // Title
  lines.push(`# NEXUS Newsflow - ${briefing.date}`);
  lines.push('');
  
  // AI Summary
  lines.push('## 📊 今日新闻概要');
  lines.push(briefing.aiSummary);
  lines.push('');
  
  // Company News
  lines.push('## 🏢 公司新闻');
  for (const company of briefing.companies) {
    lines.push(`### ${company.name}${company.ticker ? ` (${company.ticker})` : ''}`);
    if (company.hasMoreArticles) {
      lines.push('*注：该公司今日新闻较多，仅展示前5条*');
    }
    company.articles.forEach((article, idx) => {
      lines.push(`${idx + 1}. [${article.title}](${article.url})`);
      if (article.summary) {
        const brief = article.summary.slice(0, 150).replace(/\n/g, ' ').trim();
        if (brief) lines.push(`   > ${brief}...`);
      }
      lines.push(`   - 来源: ${article.source} | ${article.publishedAt.slice(0, 10)}`);
    });
    lines.push('');
  }
  
  // People News
  if (briefing.people.length > 0) {
    lines.push('## 👤 人脉相关新闻');
    for (const person of briefing.people) {
      lines.push(`### ${person.name} ${person.role ? `@ ${person.role}` : ''} ${person.company ? `(${person.company})` : ''}`);
      for (const article of person.articles) {
        lines.push(`- [${article.title}](${article.url})`);
      }
      lines.push('');
    }
  }
  
  // Person Matches
  if (briefing.personMatches.length > 0) {
    lines.push('## 🔗 人脉推荐');
    for (const match of briefing.personMatches) {
      lines.push(`### ${match.person.name}`);
      lines.push(`- 职位: ${match.person.role || 'N/A'} @ ${match.person.company || 'N/A'}`);
      lines.push(`- 推荐理由: ${match.reason}`);
      lines.push('- 相关新闻:');
      for (const article of match.relatedArticles.slice(0, 3)) {
        lines.push(`  - [${article.title}](${article.url})`);
      }
      lines.push('');
    }
  }
  
  // AI Insight
  lines.push('## 💡 今日洞察');
  lines.push(briefing.aiInsight);
  lines.push('');
  
  // Footer
  lines.push('---');
  lines.push(`*Generated: ${briefing.generatedAt}*`);
  
  return lines.join('\n');
}

/**
 * Ensure NewsFlow folder exists
 */
async function ensureFolderExists(): Promise<void> {
  try {
    await fs.mkdir(newsflowPaths.newsflow, { recursive: true });
  } catch (error) {
    // Ignore if already exists
  }
}

/**
 * Save briefing to Obsidian vault
 */
export async function archiveBriefing(briefing: DailyBriefing): Promise<boolean> {
  try {
    await ensureFolderExists();
    
    const filename = `${briefing.date}.md`;
    const filePath = path.join(newsflowPaths.newsflow, filename);
    
    const markdown = briefingToMarkdown(briefing);
    await fs.writeFile(filePath, markdown, 'utf-8');
    
    console.log(`[Newsflow] Archived briefing to ${filePath}`);
    return true;
  } catch (error) {
    console.error('[Newsflow] Error archiving briefing:', error);
    return false;
  }
}

/**
 * Get list of archived briefings
 */
export async function getArchivedBriefings(): Promise<string[]> {
  try {
    await ensureFolderExists();
    const files = await fs.readdir(newsflowPaths.newsflow);
    return files
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''))
      .sort()
      .reverse();
  } catch (error) {
    console.error('[Newsflow] Error reading archived briefings:', error);
    return [];
  }
}

/**
 * Read a specific briefing
 */
export async function getBriefing(date: string): Promise<string | null> {
  try {
    const filePath = path.join(newsflowPaths.newsflow, `${date}.md`);
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    return null;
  }
}

export default {
  archiveBriefing,
  getArchivedBriefings,
  getBriefing,
  briefingToMarkdown,
};
