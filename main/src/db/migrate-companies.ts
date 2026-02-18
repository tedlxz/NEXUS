import './database';  // Initialize DB first
import { getDb } from '../db/database';
import { ContactsRepo } from '../db/contacts-repo';
import { CompaniesRepo } from '../db/companies-repo';
import path from 'path';
import fs from 'fs/promises';
import { vaultPaths } from '../config';
import { companyTemplate } from '../vault/templates';
import { getUserVaultPaths } from '../vault/writer';

/**
 * Migrate companies - OBSIDIAN IS THE SOURCE OF TRUTH
 *
 * This script:
 * 1. Scans existing Company files to build the canonical company name list
 * 2. Scans People files for current_org references
 * 3. For stale current_org references (no matching Company file):
 *    - Detects renames by checking if the person appears in an existing Company file
 *    - Updates the Person file's current_org if a rename is detected
 *    - Only creates NEW company files for genuinely new companies
 * 4. Syncs everything from Obsidian to SQL database
 */
export async function migrateCompanies(userId?: string): Promise<void> {
  // Use user-specific vault paths if userId is provided
  const paths = userId ? getUserVaultPaths(userId) : vaultPaths;
  const db = getDb();
  const contactsRepo = new ContactsRepo(db);
  const companiesRepo = new CompaniesRepo(db);

  console.log('[Migrate] Starting company migration...');

  // Ensure companies directory exists
  await fs.mkdir(paths.companies, { recursive: true });

  // ── Step 1: Scan existing Company files ──
  // Build: companyNameSet (lowercase → canonical name), personToCompany (person name → company name)
  const existingCompanyNames = new Map<string, string>(); // lowercase → canonical name
  const personToCompany = new Map<string, string>();       // person name → company they're listed under

  try {
    const companiesDir = paths.companies;
    const companyFiles = await fs.readdir(companiesDir);

    for (const file of companyFiles) {
      if (!file.endsWith('.md')) continue;

      try {
        const filePath = path.join(companiesDir, file);
        const content = await fs.readFile(filePath, 'utf-8');

        // Extract company name from YAML frontmatter
        const nameMatch = content.match(/^name:\s*"?([^"\n]+)"?/m);
        if (nameMatch) {
          const companyName = nameMatch[1].trim();
          if (companyName) {
            existingCompanyNames.set(companyName.toLowerCase(), companyName);
            console.log(`[Migrate] Found existing company: ${companyName}`);

            // Parse "Related Contacts" section to build person→company map
            // Format: - [[PersonName]] — Role (Current/Past)
            const personLinks = content.matchAll(/\[\[([^\]]+)\]\]/g);
            for (const match of personLinks) {
              const personName = match[1].trim();
              // Only track if it's in the Related Contacts section (after "## Related Contacts")
              const relatedIdx = content.indexOf('## Related Contacts');
              const nextSectionIdx = content.indexOf('\n## ', relatedIdx + 1);
              if (relatedIdx >= 0) {
                const sectionEnd = nextSectionIdx >= 0 ? nextSectionIdx : content.length;
                const relatedSection = content.slice(relatedIdx, sectionEnd);
                if (relatedSection.includes(`[[${personName}]]`)) {
                  personToCompany.set(personName, companyName);
                }
              }
            }
          }
        }
      } catch (err) {
        console.error(`[Migrate] Error reading ${file}:`, err);
      }
    }
  } catch (err) {
    // Companies dir might not exist yet, that's ok
  }

  console.log(`[Migrate] Found ${existingCompanyNames.size} existing companies, ${personToCompany.size} person→company mappings`);

  // ── Step 2: Scan People files for current_org references ──
  // Collect: orgName → list of { personName, personFile }
  const orgReferences = new Map<string, Array<{ personName: string; personFile: string }>>();

  try {
    const peopleDir = paths.people;
    const peopleFiles = await fs.readdir(peopleDir);

    for (const file of peopleFiles) {
      if (!file.endsWith('.md')) continue;

      try {
        const filePath = path.join(peopleDir, file);
        const content = await fs.readFile(filePath, 'utf-8');

        const orgMatch = content.match(/current_org:\s*"?\[\[([^\]]+)\]\]"?/);
        const nameMatch = content.match(/^name:\s*"?([^"\n]+)"?/m);

        if (orgMatch && nameMatch) {
          const companyName = orgMatch[1].trim();
          const personName = nameMatch[1].trim();

          if (companyName) {
            if (!orgReferences.has(companyName)) {
              orgReferences.set(companyName, []);
            }
            orgReferences.get(companyName)!.push({ personName, personFile: file });
          }
        }
      } catch (err) {
        console.error(`[Migrate] Error reading ${file}:`, err);
      }
    }
  } catch (err) {
    console.error('[Migrate] Error reading People dir:', err);
  }

  // ── Step 3: Process each current_org reference ──
  let newCompanyFiles = 0;
  let renamedOrgs = 0;

  for (const [orgName, persons] of orgReferences) {
    // Check if this org already has a matching Company file
    if (existingCompanyNames.has(orgName.toLowerCase())) {
      console.log(`[Migrate] Org "${orgName}" matches existing company — OK`);
      continue;
    }

    // No matching Company file — check if this is a rename
    // Look up each person in the personToCompany map (built from existing Company files)
    let renamedTo: string | undefined;
    for (const { personName } of persons) {
      const existingCompany = personToCompany.get(personName);
      if (existingCompany && existingCompany.toLowerCase() !== orgName.toLowerCase()) {
        renamedTo = existingCompany;
        break;
      }
    }

    if (renamedTo) {
      // Detected rename: update Person files' current_org
      console.log(`[Migrate] Detected rename: "${orgName}" → "${renamedTo}". Updating Person files...`);

      const safeNewName = renamedTo.replace(/[<>:"/\\|?*]/g, ' ');

      for (const { personFile } of persons) {
        try {
          const filePath = path.join(paths.people, personFile);
          let content = await fs.readFile(filePath, 'utf-8');

          // Update current_org in YAML frontmatter
          content = content.replace(
            /current_org:\s*"?\[\[[^\]]+\]\]"?/,
            `current_org: "[[${safeNewName}]]"`
          );

          // Also update [[OldCompany]] links in the body (Company section)
          const oldSafeName = orgName.replace(/[<>:"/\\|?*]/g, ' ');
          content = content.replace(
            new RegExp(`\\[\\[${escapeRegex(oldSafeName)}\\]\\]`, 'g'),
            `[[${safeNewName}]]`
          );

          await fs.writeFile(filePath, content, 'utf-8');
          console.log(`[Migrate] Updated ${personFile}: current_org "${orgName}" → "${renamedTo}"`);
          renamedOrgs++;
        } catch (err) {
          console.error(`[Migrate] Error updating ${personFile}:`, err);
        }
      }

      continue; // Don't create a new company file
    }

    // No rename detected — this is a genuinely new company. Create file.
    const safeName = orgName.replace(/[<>:"/\\|?*]/g, ' ');
    const filePath = path.join(paths.companies, `${safeName}.md`);

    // Double-check file doesn't exist (by filename)
    try {
      await fs.access(filePath);
      console.log(`[Migrate] Skipping ${safeName}.md (file already exists)`);
      continue;
    } catch {
      // File doesn't exist — create it
    }

    // Get related contacts for the new company file
    const relatedContacts: Array<{ name: string; role: string; relationship: 'current' | 'past' }> = [];

    for (const { personName, personFile } of persons) {
      try {
        const content = await fs.readFile(path.join(paths.people, personFile), 'utf-8');
        const roleMatch = content.match(/current_role:\s*"?([^"\n]+)"?/m);
        relatedContacts.push({
          name: personName,
          role: roleMatch ? roleMatch[1].trim() : '',
          relationship: 'current'
        });
      } catch {
        relatedContacts.push({ name: personName, role: '', relationship: 'current' });
      }
    }

    const content = companyTemplate({
      name: orgName,
      related_contacts: relatedContacts,
      related_conversations: []
    });

    await fs.writeFile(filePath, content, 'utf-8');
    newCompanyFiles++;
    console.log(`[Migrate] Created: ${safeName}.md with ${relatedContacts.length} related contacts`);
  }

  console.log(`[Migrate] Created ${newCompanyFiles} NEW company files, fixed ${renamedOrgs} renamed org references`);

  // Step 4: Sync from Obsidian to SQL
  console.log('[Migrate] Syncing from Obsidian to update database...');
  const { syncFromObsidian } = await import('./sync-from-obsidian');
  await syncFromObsidian();
  console.log('[Migrate] Database synced from Obsidian - all your changes are preserved!');

  console.log('[Migrate] Company migration complete!');
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Run if called directly
if (require.main === module) {
  migrateCompanies()
    .then(() => {
      console.log('Done');
      process.exit(0);
    })
    .catch(err => {
      console.error('Error:', err);
      process.exit(1);
    });
}
