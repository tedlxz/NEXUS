import https from 'https';
import http from 'http';
import { URL } from 'url';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { config } from '../config';

export interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
  age?: string;
}

interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
}

interface BraveApiResponse {
  web?: {
    results?: BraveWebResult[];
  };
}

function httpsGet(url: string, headers: Record<string, string>, agent?: https.Agent): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options: https.RequestOptions = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers,
      agent,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`Brave API HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error('Brave API request timeout'));
    });
    req.end();
  });
}

export async function braveSearch(query: string, count = 5): Promise<BraveSearchResult[]> {
  const apiKey = config.brave.apiKey;
  if (!apiKey) {
    console.error('[BraveSearch] No API key configured');
    return [];
  }

  try {
    const params = new URLSearchParams({ q: query, count: String(count) });
    const url = `${config.brave.baseUrl}/web/search?${params}`;

    const headers: Record<string, string> = {
      'X-Subscription-Token': apiKey,
      'Accept': 'application/json',
    };

    const agent = config.telegram.proxy
      ? new HttpsProxyAgent(config.telegram.proxy)
      : undefined;

    const body = await httpsGet(url, headers, agent);
    const data: BraveApiResponse = JSON.parse(body);

    const results = data.web?.results || [];
    return results.map((r) => ({
      title: r.title || '',
      url: r.url || '',
      description: r.description || '',
      age: r.age,
    }));
  } catch (err) {
    console.error('[BraveSearch] Error:', err);
    return [];
  }
}
