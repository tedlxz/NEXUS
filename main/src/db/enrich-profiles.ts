import { getDb } from '../db/database';
import { ContactsRepo } from '../db/contacts-repo';
import { ConversationsRepo } from '../db/conversations-repo';
import { config, vaultPaths } from '../config';
import { vaultWriter } from '../vault/writer';
import path from 'path';
import fs from 'fs/promises';

/**
 * Enrich contact profiles using AI - runs daily at 11:30 PM
 * Enriches Profile and Public Internet Info for contacts added/updated today
 */
export async function enrichContactProfiles(): Promise<{
  enriched: string[];
  errors: string[];
}> {
  console.log('[Enrich] Starting daily profile enrichment...');
  
  const db = getDb();
  const contactsRepo = new ContactsRepo(db);
  const conversationsRepo = new ConversationsRepo(db);
  
  // Get today's date
  const today = new Date().toISOString().slice(0, 10);
  
  // Find contacts created today or with conversations today
  const allContacts = contactsRepo.getAll();
  const contactsToEnrich: string[] = [];
  
  for (const contact of allContacts) {
    // Check if contact was created today
    if (contact.created === today) {
      contactsToEnrich.push(contact.name);
      continue;
    }
    
    // Check if contact had a conversation today
    const contactId = contactsRepo.getContactId(contact.name);
    if (contactId) {
      const convs = conversationsRepo.getByContact(contactId);
      const hasTodayConv = convs.some(c => c.date === today);
      if (hasTodayConv) {
        contactsToEnrich.push(contact.name);
      }
    }
  }
  
  console.log(`[Enrich] Found ${contactsToEnrich.length} contacts to enrich: ${contactsToEnrich.join(', ')}`);
  
  const enriched: string[] = [];
  const errors: string[] = [];
  
  for (const name of contactsToEnrich) {
    try {
      console.log(`[Enrich] Enriching profile for: ${name}`);
      
      // Get existing profile
      const contact = contactsRepo.findByName(name);
      if (!contact) continue;
      
      // Get conversation summaries for context
      const contactId = contactsRepo.getContactId(name);
      let conversationContext = '';
      if (contactId) {
        const convs = conversationsRepo.getByContact(contactId);
        conversationContext = convs.map(c => 
          `${c.date}: ${c.ai_summary || ''}`
        ).join('\n');
      }
      
      // Use AI to enrich profile
      const enrichedData = await enrichWithAI(name, contact.current_role, contact.current_org, conversationContext);
      
      // Read existing file
      const filePath = path.join(vaultPaths.people, `${name}.md`);
      let existingContent = '';
      try {
        existingContent = await fs.readFile(filePath, 'utf-8');
      } catch {
        // File doesn't exist, will create new
      }
      
      // Update file with enriched content
      if (enrichedData.profile || enrichedData.publicInfo) {
        await vaultWriter.updatePerson(name, {
          profile: enrichedData.profile,
          public_info: enrichedData.publicInfo,
        });
        
        enriched.push(name);
        console.log(`[Enrich] Enriched: ${name}`);
      }
      
    } catch (err) {
      console.error(`[Enrich] Error enriching ${name}:`, err);
      errors.push(name);
    }
  }
  
  console.log(`[Enrich] Complete: ${enriched.length} enriched, ${errors.length} errors`);
  return { enriched, errors };
}

/**
 * Use AI to generate enriched profile and public info
 */
async function enrichWithAI(
  name: string,
  role?: string,
  org?: string,
  conversationContext?: string
): Promise<{ profile?: string; publicInfo?: string }> {
  const { ai, MODEL } = await import('../ai/client');
  
  const prompt = `You are a PE (Private Equity) professional researching a contact.

Contact Name: ${name}
Current Role: ${role || 'Unknown'}
Current Organization: ${org || 'Unknown'}

Recent Conversation Context:
${conversationContext || 'No conversation data available'}

Based on the above information, please provide:

1. PROFILE: A 2-3 paragraph professional biography in English. Include:
   - Background and experience
   - Key achievements and expertise
   - What makes this person notable in their industry

2. PUBLIC_INTERNET_INFO: If you can find verifiable public information about this person, provide it in English (professional background, career history, board positions, LinkedIn, company bio, news articles, etc.)
   - If no verifiable information can be found, exactly use this text: "No verifiable information about this person could be found on public internet."

Format your response as JSON:
{
  "profile": "Your generated profile text...",
  "publicInfo": "Your public info text..."
}`;

  try {
    const resp = await ai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: 'You are a professional researcher. Generate accurate, well-structured information.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
    });

    const content = resp.choices[0]?.message?.content || '{}';
    
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      // Use default message if no public info found
      const publicInfo = parsed.publicInfo?.trim() 
        ? parsed.publicInfo 
        : 'No verifiable information about this person could be found on public internet.';
      return {
        profile: parsed.profile,
        publicInfo: publicInfo,
      };
    }
  } catch (err) {
    console.error('[Enrich] AI Error:', err);
  }
  
  return {};
}

// Run if called directly
if (require.main === module) {
  enrichContactProfiles()
    .then(result => {
      console.log('Enrich result:', result);
      process.exit(0);
    })
    .catch(err => {
      console.error('Error:', err);
      process.exit(1);
    });
}
