import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendAuditLog, getNamedSecret, getState } from '../state/store';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

/**
 * M7: Readability HTML -> clean Markdown/text converter with extracted primary links
 */
export function cleanHtmlToMarkdown(html: string, baseUrl?: string): {
  title: string;
  text: string;
  links: Array<{ text: string; url: string }>;
} {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = (titleMatch?.[1] || '').replace(/\s+/g, ' ').trim();

  const cleanedHtml = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  const links: Array<{ text: string; url: string }> = [];
  const linkRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(cleanedHtml)) !== null && links.length < 25) {
    const rawHref = m[1].trim();
    const label = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:')) continue;
    try {
      const resolved = baseUrl ? new URL(rawHref, baseUrl).toString() : rawHref;
      if (label.length >= 2) {
        links.push({ text: label.slice(0, 80), url: resolved });
      }
    } catch {
      // ignore invalid URL
    }
  }

  const md = cleanedHtml
    .replace(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi, (_all, lvl, inner) => `\n\n${'#'.repeat(Number(lvl))} ${inner.replace(/<[^>]+>/g, '')}\n`)
    .replace(/<(li)[^>]*>([\s\S]*?)<\/\1>/gi, (_all, _t, inner) => `\n- ${inner.replace(/<[^>]+>/g, '')}`)
    .replace(/<\/?(p|div|section|article|br|tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    title,
    text: md.slice(0, 8000),
    links,
  };
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Ú2: Real Live Web Search supporting DuckDuckGo (zero-key), SearXNG, and Brave Search API
 */
export async function performWebSearch(
  query: string,
  maxResults = 6,
  fetchImpl: typeof fetch = fetch
): Promise<{ provider: string; results: WebSearchResult[]; error?: string }> {
  const q = query.trim();
  if (!q) return { provider: 'duckduckgo', results: [] };

  const state = getState();
  const mode = state.settings.searchProvider || 'duckduckgo';

  // 1. Optional SearXNG instance
  if (mode === 'searxng' && state.settings.searxngUrl?.trim()) {
    try {
      const base = state.settings.searxngUrl.trim().replace(/\/+$/, '');
      const res = await fetchImpl(`${base}/search?q=${encodeURIComponent(q)}&format=json`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(7000),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          results?: Array<{ title?: string; url?: string; content?: string }>;
        };
        const results = (data.results || []).slice(0, maxResults).map((r) => ({
          title: r.title || r.url || 'Találat',
          url: r.url || '',
          snippet: (r.content || '').slice(0, 260),
          source: 'searxng',
        }));
        return { provider: 'searxng', results };
      }
    } catch (err) {
      return {
        provider: 'searxng',
        results: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // 2. Optional Brave Search API
  if (mode === 'brave') {
    const braveKey = getNamedSecret('brave_search_key') || process.env.BRAVE_API_KEY?.trim();
    if (braveKey) {
      try {
        const res = await fetchImpl(
          `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=${maxResults}`,
          {
            headers: {
              Accept: 'application/json',
              'X-Subscription-Token': braveKey,
            },
            signal: AbortSignal.timeout(7000),
          }
        );
        if (res.ok) {
          const data = (await res.json()) as {
            web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
          };
          const results = (data.web?.results || []).slice(0, maxResults).map((r) => ({
            title: r.title || '',
            url: r.url || '',
            snippet: (r.description || '').slice(0, 260),
            source: 'brave',
          }));
          return { provider: 'brave', results };
        }
      } catch (err) {
        return {
          provider: 'brave',
          results: [],
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }
  }

  // 3. Default zero-key DuckDuckGo HTML endpoint + Instant Answer fallback
  try {
    const res = await fetchImpl(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux aarch64) NovaSwarm/2.0',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const html = await res.text();
      const results: WebSearchResult[] = [];
      const blockRe =
        /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="result__snippet"[^>]*>([\s\S]*?)<\/a>|class="result__snippet"[^>]*>([\s\S]*?)<\/div>)/gi;
      let match: RegExpExecArray | null;
      while ((match = blockRe.exec(html)) !== null && results.length < maxResults) {
        let href = match[1];
        if (href.includes('uddg=')) {
          try {
            const parsed = new URL(href, 'https://duckduckgo.com');
            href = parsed.searchParams.get('uddg') || href;
          } catch {
            // keep href
          }
        }
        results.push({
          title: decodeHtmlEntities(match[2]),
          url: href,
          snippet: decodeHtmlEntities(match[3] || match[4] || '').slice(0, 260),
          source: 'duckduckgo',
        });
      }
      if (results.length > 0) {
        appendAuditLog({
          type: 'action',
          sourceAgentId: 'web-search',
          sourceAgentName: 'Élő Web Kereső',
          message: `DuckDuckGo keresés ("${q}"): ${results.length} találat`,
          verifiedExecution: true,
        });
        return { provider: 'duckduckgo', results };
      }
    }
  } catch {
    // Fallback to DDG Instant Answer JSON API
  }

  try {
    const iaRes = await fetchImpl(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (iaRes.ok) {
      const data = (await iaRes.json()) as {
        AbstractText?: string;
        AbstractURL?: string;
        Heading?: string;
        RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
      };
      const results: WebSearchResult[] = [];
      if (data.AbstractText && data.AbstractURL) {
        results.push({
          title: data.Heading || q,
          url: data.AbstractURL,
          snippet: data.AbstractText.slice(0, 260),
          source: 'duckduckgo_ia',
        });
      }
      for (const topic of data.RelatedTopics || []) {
        if (topic.Text && topic.FirstURL && results.length < maxResults) {
          results.push({
            title: topic.Text.split(' - ')[0].slice(0, 90),
            url: topic.FirstURL,
            snippet: topic.Text.slice(0, 240),
            source: 'duckduckgo_ia',
          });
        }
      }
      return { provider: 'duckduckgo_ia', results };
    }
  } catch (err) {
    return {
      provider: 'duckduckgo',
      results: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return { provider: 'duckduckgo', results: [] };
}

/**
 * Ú1: Headless Browser probe & execution using installed chromium/google-chrome/playwright-cli
 * without forcing heavy npm browser downloads on 1 GB Raspberry Pi.
 */
export function detectHeadlessBrowserBinary(): string | null {
  for (const bin of ['chromium', 'chromium-browser', 'google-chrome', 'playwright-cli']) {
    try {
      const found = execFileSync('which', [bin], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (found) return found;
    } catch {
      // try next
    }
  }
  return null;
}

export async function runHeadlessBrowserAction(params: {
  action: 'navigate_dom' | 'screenshot' | 'extract_links';
  url: string;
}): Promise<{
  ok: boolean;
  browserBinary: string | null;
  title?: string;
  textPreview?: string;
  links?: Array<{ text: string; url: string }>;
  screenshotBase64?: string;
  error?: string;
}> {
  const url = params.url.trim();
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, browserBinary: null, error: 'Csak http:// vagy https:// URL engedélyezett.' };
  }

  const binary = detectHeadlessBrowserBinary();
  if (!binary) {
    return {
      ok: false,
      browserBinary: null,
      error:
        'Nincs telepített Chromium/Chrome/Playwright bináris a gazdagépen. Telepítés Debian/Ubuntu/Pi rendszeren: sudo apt install chromium',
    };
  }

  if (params.action === 'screenshot') {
    const tmpShot = path.join(os.tmpdir(), `novaswarm-shot-${Date.now()}.png`);
    try {
      if (binary.endsWith('playwright-cli')) {
        spawnSync(binary, ['open', url], { timeout: 15000, encoding: 'utf8' });
        spawnSync(binary, ['screenshot', '--filename', tmpShot], { timeout: 15000, encoding: 'utf8' });
        spawnSync(binary, ['close'], { timeout: 5000, encoding: 'utf8' });
      } else {
        spawnSync(
          binary,
          ['--headless', '--disable-gpu', '--no-sandbox', '--window-size=1280,800', `--screenshot=${tmpShot}`, url],
          { timeout: 20000, encoding: 'utf8' }
        );
      }
      if (!fs.existsSync(tmpShot)) {
        return { ok: false, browserBinary: binary, error: 'A böngésző nem készített képernyőképet.' };
      }
      const b64 = fs.readFileSync(tmpShot).toString('base64');
      appendAuditLog({
        type: 'action',
        sourceAgentId: 'headless-browser',
        sourceAgentName: 'Headless Böngésző',
        message: `Képernyőkép készült (${path.basename(binary)}): ${url}`,
        verifiedExecution: true,
      });
      return {
        ok: true,
        browserBinary: binary,
        screenshotBase64: b64,
      };
    } finally {
      if (fs.existsSync(tmpShot)) fs.rmSync(tmpShot, { force: true });
    }
  }

  // navigate_dom or extract_links via --dump-dom
  if (binary.endsWith('playwright-cli')) {
    const res = spawnSync(binary, ['open', url], { timeout: 15000, encoding: 'utf8' });
    const snap = spawnSync(binary, ['snapshot'], { timeout: 10000, encoding: 'utf8' });
    spawnSync(binary, ['close'], { timeout: 5000, encoding: 'utf8' });
    return {
      ok: res.status === 0,
      browserBinary: binary,
      textPreview: (snap.stdout || res.stdout || '').slice(0, 4000),
      error: res.status === 0 ? undefined : snap.stderr || res.stderr,
    };
  }

  const domRes = spawnSync(
    binary,
    ['--headless', '--disable-gpu', '--no-sandbox', '--dump-dom', url],
    { timeout: 20000, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }
  );
  if (domRes.status !== 0 && !domRes.stdout) {
    return {
      ok: false,
      browserBinary: binary,
      error: domRes.stderr || `Exit code ${domRes.status}`,
    };
  }
  const parsed = cleanHtmlToMarkdown(domRes.stdout || '', url);
  appendAuditLog({
    type: 'action',
    sourceAgentId: 'headless-browser',
    sourceAgentName: 'Headless Böngésző',
    message: `Headless DOM betöltve (${path.basename(binary)}): ${url}`,
    verifiedExecution: true,
  });
  return {
    ok: true,
    browserBinary: binary,
    title: parsed.title,
    textPreview: parsed.text.slice(0, 4000),
    links: parsed.links,
  };
}
