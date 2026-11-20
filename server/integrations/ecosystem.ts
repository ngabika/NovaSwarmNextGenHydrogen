import crypto from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';
import nodemailer from 'nodemailer';
import type {
  CalendarEvent,
  EmailSummaryItem,
  ExpenseRecord,
  RssFeedItem,
} from '../../shared/types';
import { invokeWithFailover } from '../providers/router';
import { requireDestructiveApproval } from '../security/permissionGate';
import { appendAuditLog, getNamedSecret, getState, setNamedSecret, updateState } from '../state/store';

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Ú6: RSS / Atom / GitHub Release Feed Parser & Daily Briefing */
export function parseRssOrAtomXml(
  xml: string,
  feedId: string,
  feedName: string
): RssFeedItem[] {
  const items: RssFeedItem[] = [];
  const itemMatches = xml.match(/<(?:item|entry)\b[^>]*>[\s\S]*?<\/(?:item|entry)>/gi) || [];
  for (const block of itemMatches.slice(0, 10)) {
    const title = decodeXml((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || 'Cím nélkül'));
    const linkTag =
      block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i)?.[1] ||
      block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] ||
      '';
    const pub =
      block.match(/<(?:pubDate|published|updated)[^>]*>([\s\S]*?)<\/(?:pubDate|published|updated)>/i)?.[1] ||
      new Date().toISOString();
    const desc =
      block.match(/<(?:description|summary|content)[^>]*>([\s\S]*?)<\/(?:description|summary|content)>/i)?.[1] ||
      '';
    items.push({
      id: `rss-${crypto.createHash('md5').update(`${feedId}:${title}:${linkTag}`).digest('hex').slice(0, 10)}`,
      feedId,
      feedName,
      title: title.slice(0, 160),
      link: decodeXml(linkTag),
      publishedAt: pub.trim(),
      summary: decodeXml(desc).slice(0, 260),
    });
  }
  return items;
}

export async function refreshAllRssFeeds(fetchImpl: typeof fetch = fetch): Promise<RssFeedItem[]> {
  const feeds = [...getState().rssFeeds.filter((f) => f.enabled)];
  const collected: RssFeedItem[] = [];

  for (const feed of feeds) {
    try {
      const res = await fetchImpl(feed.url, {
        headers: { 'User-Agent': 'NovaSwarm-RSS/2.0', Accept: 'application/xml, application/atom+xml, text/xml' },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      const parsed = parseRssOrAtomXml(xml, feed.id, feed.name);
      collected.push(...parsed);
      updateState((s) => {
        const ref = s.rssFeeds.find((x) => x.id === feed.id);
        if (ref) {
          ref.lastCheckedAt = new Date().toISOString();
          ref.lastError = undefined;
        }
      });
    } catch (err) {
      updateState((s) => {
        const ref = s.rssFeeds.find((x) => x.id === feed.id);
        if (ref) {
          ref.lastCheckedAt = new Date().toISOString();
          ref.lastError = err instanceof Error ? err.message : String(err);
        }
      });
    }
  }

  if (collected.length > 0) {
    updateState((s) => {
      const existingIds = new Set(s.rssFeedItems.map((i) => i.id));
      for (const item of collected) {
        if (!existingIds.has(item.id)) {
          s.rssFeedItems.unshift(item);
        }
      }
      s.rssFeedItems = s.rssFeedItems.slice(0, 60);
    });
  }

  return getState().rssFeedItems;
}

export async function generateDailyBriefingText(): Promise<string> {
  const s = getState();
  const todoCards = s.kanban.filter((c) => !c.archived && c.status !== 'done').slice(0, 6);
  const upcomingEvents = s.calendarEvents
    .filter((ev) => Date.parse(ev.startAt) >= Date.now() - 3_600_000)
    .slice(0, 5);
  const recentRss = s.rssFeedItems.slice(0, 5);
  const downTargets = s.uptimeTargets.filter((u) => u.status === 'down');

  const weather = await import('../power/universalSuite')
    .then((m) => m.fetchOpenMeteoWeather())
    .catch(() => null);
  const weatherLine =
    weather && weather.ok
      ? `Helyi időjárás (${weather.location}): ${weather.temperatureC}°C, ${weather.condition}, szél ${weather.windKmh} km/h (min ${weather.dailyMinC}°C / max ${weather.dailyMaxC}°C)`
      : `Időjárás: nincs elérhető adat`;

  const rawFacts = [
    weatherLine,
    `Nyitott Kanban feladatok (${todoCards.length}): ${todoCards.map((c) => c.title).join(', ') || 'nincs'}`,
    `Közelgő naptár események (${upcomingEvents.length}): ${upcomingEvents.map((e) => `${e.title} (${e.startAt})`).join(', ') || 'nincs'}`,
    `Friss RSS/Release hírek (${recentRss.length}): ${recentRss.map((r) => `[${r.feedName}] ${r.title}`).join(' | ') || 'nincs'}`,
    `Uptime riasztások: ${downTargets.map((d) => d.name).join(', ') || 'minden cél rendben'}`,
  ].join('\n');

  try {
    const res = await invokeWithFailover({
      complexity: 'simple',
      prompt: `Állíts össze egy tömör, áttekinthető reggeli vezetői briefinget magyarul az alábbi élő adatok alapján:\n${rawFacts}`,
    });
    return res.text;
  } catch {
    return `Napi Összefoglaló (automatikus):\n${rawFacts}`;
  }
}

/** Ú7: Real SMTP & Lightweight Raw-TLS IMAP Email Client */
export function updateEmailConfig(params: {
  enabled?: boolean;
  imapHost?: string;
  imapPort?: number;
  smtpHost?: string;
  smtpPort?: number;
  username?: string;
  tls?: boolean;
  password?: string;
}) {
  if (typeof params.password === 'string' && params.password.trim()) {
    setNamedSecret('email_password', params.password.trim());
  }
  updateState((s) => {
    if (typeof params.enabled === 'boolean') s.emailConfig.enabled = params.enabled;
    if (typeof params.imapHost === 'string') s.emailConfig.imapHost = params.imapHost.trim();
    if (typeof params.imapPort === 'number') s.emailConfig.imapPort = params.imapPort;
    if (typeof params.smtpHost === 'string') s.emailConfig.smtpHost = params.smtpHost.trim();
    if (typeof params.smtpPort === 'number') s.emailConfig.smtpPort = params.smtpPort;
    if (typeof params.username === 'string') s.emailConfig.username = params.username.trim();
    if (typeof params.tls === 'boolean') s.emailConfig.tls = params.tls;
    s.emailConfig.hasPassword = Boolean(getNamedSecret('email_password'));
  });
  return getState().emailConfig;
}

function imapCommandSession(
  host: string,
  port: number,
  user: string,
  pass: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, rejectUnauthorized: false, timeout: 8000 });
    let buffer = '';
    let step = 0;

    const sendNext = () => {
      if (step === 0) {
        step = 1;
        socket.write(`A1 LOGIN "${user.replace(/"/g, '')}" "${pass.replace(/"/g, '')}"\r\n`);
      } else if (step === 1 && buffer.includes('A1 OK')) {
        step = 2;
        socket.write(`A2 EXAMINE INBOX\r\n`);
      } else if (step === 2 && buffer.includes('A2 OK')) {
        step = 3;
        const existMatch = buffer.match(/\*\s+(\d+)\s+EXISTS/i);
        const total = existMatch ? Number(existMatch[1]) : 0;
        if (total <= 0) {
          step = 4;
          socket.write(`A4 LOGOUT\r\n`);
          return;
        }
        const fromIdx = Math.max(1, total - 4);
        socket.write(`A3 FETCH ${fromIdx}:${total} (BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])\r\n`);
      } else if (step === 3 && buffer.includes('A3 OK')) {
        step = 4;
        socket.write(`A4 LOGOUT\r\n`);
      } else if (buffer.includes('A1 NO') || buffer.includes('A1 BAD')) {
        socket.destroy();
        reject(new Error('IMAP hitelesítés sikertelen.'));
      }
    };

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      sendNext();
      if (buffer.includes('A4 OK') || buffer.includes('* BYE')) {
        socket.end();
        resolve(buffer);
      }
    });
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('IMAP kapcsolódási időtúllépés.'));
    });
    socket.on('error', (err) => reject(err));
  });
}

export async function syncRecentEmailsViaImap(): Promise<{
  ok: boolean;
  emails: EmailSummaryItem[];
  error?: string;
}> {
  const cfg = getState().emailConfig;
  const pass = getNamedSecret('email_password');
  if (!cfg.imapHost || !cfg.username || !pass) {
    return {
      ok: false,
      emails: cfg.recentEmails,
      error: 'IMAP szerver, felhasználónév vagy jelszó nincs beállítva.',
    };
  }

  try {
    const raw = await imapCommandSession(cfg.imapHost, cfg.imapPort || 993, cfg.username, pass);
    const items: EmailSummaryItem[] = [];
    const fetchRe = /\*\s+(\d+)\s+FETCH[\s\S]*?\r\n([\s\S]*?)\r\n\)/gi;
    let m: RegExpExecArray | null;
    while ((m = fetchRe.exec(raw)) !== null) {
      const uid = Number(m[1]);
      const hdr = m[2];
      const from = (hdr.match(/^From:\s*(.+)$/im)?.[1] || '').trim();
      const subject = (hdr.match(/^Subject:\s*(.+)$/im)?.[1] || '(Nincs tárgy)').trim();
      const date = (hdr.match(/^Date:\s*(.+)$/im)?.[1] || '').trim();
      items.unshift({ uid, from, subject, date, snippet: '' });
    }
    updateState((s) => {
      s.emailConfig.recentEmails = items.slice(0, 15);
      s.emailConfig.lastCheckedAt = new Date().toISOString();
      s.emailConfig.lastError = undefined;
    });
    return { ok: true, emails: getState().emailConfig.recentEmails };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    updateState((s) => {
      s.emailConfig.lastCheckedAt = new Date().toISOString();
      s.emailConfig.lastError = msg;
    });
    return { ok: false, emails: cfg.recentEmails, error: msg };
  }
}

/** M50: Fetch full plain-text body for a specific IMAP message sequence/UID */
export async function fetchEmailBodyByUid(uid: number): Promise<{ ok: boolean; body: string; error?: string }> {
  const cfg = getState().emailConfig;
  const pass = getNamedSecret('email_password');
  if (!cfg.imapHost || !cfg.username || !pass) {
    return { ok: false, body: '', error: 'IMAP nincs konfigurálva.' };
  }
  try {
    const raw = await new Promise<string>((resolve, reject) => {
      const socket = tls.connect({ host: cfg.imapHost, port: cfg.imapPort || 993, rejectUnauthorized: false, timeout: 8000 });
      let buffer = '';
      let step = 0;
      const advance = () => {
        if (step === 0) {
          step = 1;
          socket.write(`B1 LOGIN "${cfg.username.replace(/"/g, '')}" "${pass.replace(/"/g, '')}"\r\n`);
        } else if (step === 1 && buffer.includes('B1 OK')) {
          step = 2;
          socket.write(`B2 EXAMINE INBOX\r\n`);
        } else if (step === 2 && buffer.includes('B2 OK')) {
          step = 3;
          socket.write(`B3 FETCH ${Math.max(1, Math.floor(uid))} (BODY.PEEK[TEXT])\r\n`);
        } else if (step === 3 && buffer.includes('B3 OK')) {
          step = 4;
          socket.write(`B4 LOGOUT\r\n`);
        } else if (buffer.includes('B1 NO') || buffer.includes('B1 BAD')) {
          socket.destroy();
          reject(new Error('IMAP hitelesítés sikertelen.'));
        }
      };
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        advance();
        if (buffer.includes('B4 OK') || buffer.includes('* BYE')) {
          socket.end();
          resolve(buffer);
        }
      });
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('IMAP időtúllépés.'));
      });
      socket.on('error', reject);
    });
    const bodyMatch = raw.match(/BODY\[TEXT\][^\r\n]*\r\n([\s\S]*?)\r\n\)\r\nB3 OK/i);
    const cleaned = (bodyMatch?.[1] || raw).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 6000);
    return { ok: true, body: cleaned || '(üres levéltörzs)' };
  } catch (err) {
    return { ok: false, body: '', error: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendEmailViaSmtp(params: {
  to: string;
  subject: string;
  text: string;
  inReplyTo?: string;
  requireApproval?: boolean;
}): Promise<{ sent: boolean; pendingApproval?: boolean; approvalId?: string; message: string }> {
  const { shouldRequireApproval } = await import('../security/permissionGate');
  if (params.requireApproval && shouldRequireApproval()) {
    const req = requireDestructiveApproval(
      'email_send',
      `E-mail küldése: ${params.to} — ${params.subject}`,
      `${params.to}: ${params.subject}`,
      'Email Ügyfél'
    );
    return {
      sent: false,
      pendingApproval: true,
      approvalId: req.id,
      message: `E-mail küldés jóváhagyásra vár (#${req.id.slice(0, 8)}).`,
    };
  }

  const cfg = getState().emailConfig;
  const pass = getNamedSecret('email_password');
  if (!cfg.smtpHost || !cfg.username || !pass) {
    return { sent: false, message: 'SMTP szerver, felhasználónév vagy jelszó nincs beállítva.' };
  }

  const transporter = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort || 465,
    secure: (cfg.smtpPort || 465) === 465,
    auth: { user: cfg.username, pass },
  });

  const info = await transporter.sendMail({
    from: cfg.username,
    to: params.to,
    subject: params.subject,
    text: params.text,
    ...(params.inReplyTo ? { inReplyTo: params.inReplyTo, references: params.inReplyTo } : {}),
  });

  appendAuditLog({
    type: 'action',
    sourceAgentId: 'email-smtp',
    sourceAgentName: 'SMTP Levélküldő',
    message: `E-mail elküldve -> ${params.to} (${params.subject}) [${info.messageId}]`,
    verifiedExecution: true,
  });

  return { sent: true, message: `Elküldve (${info.messageId}).` };
}

/** Ú8: Calendar / .ics / CalDAV Parser & Natural-Language Reminder */
export function parseIcsCalendarText(icsText: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const blocks = icsText.split(/BEGIN:VEVENT/i).slice(1);
  for (const blk of blocks.slice(0, 30)) {
    const endIdx = blk.search(/END:VEVENT/i);
    const body = endIdx >= 0 ? blk.slice(0, endIdx) : blk;
    const summary = (body.match(/SUMMARY[^:]*:([^\r\n]+)/i)?.[1] || 'Esemény').trim();
    const dtStartRaw = (body.match(/DTSTART[^:]*:([^\r\n]+)/i)?.[1] || '').trim();
    const location = (body.match(/LOCATION[^:]*:([^\r\n]+)/i)?.[1] || '').trim();
    const description = (body.match(/DESCRIPTION[^:]*:([^\r\n]+)/i)?.[1] || '').trim();

    let startIso = new Date().toISOString();
    const compact = dtStartRaw.replace(/[^0-9TZ]/g, '');
    if (/^\d{8}T\d{6}/.test(compact)) {
      startIso = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}T${compact.slice(9, 11)}:${compact.slice(11, 13)}:${compact.slice(13, 15)}Z`;
    } else if (/^\d{8}$/.test(compact)) {
      startIso = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}T09:00:00Z`;
    }

    events.push({
      id: `cal-${crypto.randomUUID().slice(0, 8)}`,
      title: summary,
      startAt: startIso,
      location: location || undefined,
      notes: description || undefined,
      reminderMinutes: 15,
      createdAt: new Date().toISOString(),
    });
  }
  return events;
}

/** Ú13: Home Assistant REST + Pure-Node TCP MQTT Publish */
export async function queryHomeAssistantStates(fetchImpl: typeof fetch = fetch): Promise<{
  ok: boolean;
  states: Array<{ entity_id: string; state: string; attributes?: Record<string, unknown> }>;
  error?: string;
}> {
  const s = getState().settings;
  const token = getNamedSecret('home_assistant_token');
  if (!s.homeAssistantUrl?.trim() || !token) {
    return {
      ok: false,
      states: [],
      error: 'Home Assistant URL vagy Long-Lived Token nincs megadva.',
    };
  }
  try {
    const base = s.homeAssistantUrl.trim().replace(/\/+$/, '');
    const res = await fetchImpl(`${base}/api/states`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ok: false, states: [], error: `HTTP ${res.status}` };
    const data = (await res.json()) as Array<{ entity_id: string; state: string; attributes?: Record<string, unknown> }>;
    return { ok: true, states: Array.isArray(data) ? data.slice(0, 40) : [] };
  } catch (err) {
    return { ok: false, states: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export async function callHomeAssistantService(
  domain: string,
  service: string,
  entityId: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: boolean; message: string }> {
  const s = getState().settings;
  const token = getNamedSecret('home_assistant_token');
  if (!s.homeAssistantUrl?.trim() || !token) {
    return { ok: false, message: 'Home Assistant nincs konfigurálva.' };
  }
  const base = s.homeAssistantUrl.trim().replace(/\/+$/, '');
  const res = await fetchImpl(`${base}/api/services/${encodeURIComponent(domain)}/${encodeURIComponent(service)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ entity_id: entityId }),
    signal: AbortSignal.timeout(5000),
  });
  return { ok: res.ok, message: res.ok ? `Home Assistant ${domain}.${service} -> ${entityId} OK` : `HTTP ${res.status}` };
}

function encodeMqttString(str: string): Buffer {
  const b = Buffer.from(str, 'utf8');
  const len = Buffer.alloc(2);
  len.writeUInt16BE(b.length, 0);
  return Buffer.concat([len, b]);
}

function encodeRemainingLength(len: number): Buffer {
  const bytes: number[] = [];
  let x = len;
  do {
    let digit = x % 128;
    x = Math.floor(x / 128);
    if (x > 0) digit |= 128;
    bytes.push(digit);
  } while (x > 0);
  return Buffer.from(bytes);
}

/** Raw MQTT v3.1.1 CONNECT + PUBLISH + DISCONNECT over Node TCP */
export function publishMqttMessage(
  host: string,
  port: number,
  topic: string,
  payload: string
): Promise<{ ok: boolean; message: string }> {
  return new Promise((resolve) => {
    const client = net.createConnection({ host: host.trim(), port: port || 1883, timeout: 4000 }, () => {
      const clientId = `novaswarm-${crypto.randomUUID().slice(0, 6)}`;
      const varHeader = Buffer.concat([
        encodeMqttString('MQTT'),
        Buffer.from([0x04, 0x02, 0x00, 0x1e]), // v3.1.1, clean session, keepalive 30s
      ]);
      const connectPayload = encodeMqttString(clientId);
      const remConnect = encodeRemainingLength(varHeader.length + connectPayload.length);
      const connectPkt = Buffer.concat([Buffer.from([0x10]), remConnect, varHeader, connectPayload]);

      const topicBuf = encodeMqttString(topic);
      const msgBuf = Buffer.from(payload, 'utf8');
      const remPub = encodeRemainingLength(topicBuf.length + msgBuf.length);
      const publishPkt = Buffer.concat([Buffer.from([0x30]), remPub, topicBuf, msgBuf]);
      const disconnectPkt = Buffer.from([0xe0, 0x00]);

      client.write(Buffer.concat([connectPkt, publishPkt, disconnectPkt]), () => {
        client.end();
        resolve({ ok: true, message: `MQTT üzenet közzétéve -> ${topic}` });
      });
    });
    client.on('timeout', () => {
      client.destroy();
      resolve({ ok: false, message: 'MQTT időtúllépés' });
    });
    client.on('error', (err) => {
      resolve({ ok: false, message: `MQTT hiba: ${err.message}` });
    });
  });
}

/** Ú16: GitHub Repo Watcher */
export async function syncWatchedGithubRepo(
  repoId: string,
  fetchImpl: typeof fetch = fetch
) {
  const repo = getState().watchedRepos.find((r) => r.id === repoId);
  if (!repo) throw new Error('Figyelt GitHub repo nem található.');

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'NovaSwarm-RepoWatcher',
  };
  if (process.env.GITHUB_TOKEN?.trim()) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN.trim()}`;
  }

  try {
    const [commitRes, issuesRes] = await Promise.all([
      fetchImpl(`https://api.github.com/repos/${repo.slug}/commits/${repo.branch || 'main'}`, {
        headers,
        signal: AbortSignal.timeout(5000),
      }),
      fetchImpl(`https://api.github.com/repos/${repo.slug}/issues?state=open&per_page=10`, {
        headers,
        signal: AbortSignal.timeout(5000),
      }),
    ]);

    const commitData = commitRes.ok
      ? ((await commitRes.json()) as { sha?: string; commit?: { message?: string } })
      : null;
    const issuesData = issuesRes.ok
      ? ((await issuesRes.json()) as Array<{ number: number; title: string; html_url: string; pull_request?: unknown }>)
      : [];
    const realIssues = Array.isArray(issuesData) ? issuesData.filter((i) => !i.pull_request) : [];

    updateState((s) => {
      const ref = s.watchedRepos.find((r) => r.id === repoId);
      if (ref) {
        ref.lastCheckedAt = new Date().toISOString();
        ref.lastCommitSha = commitData?.sha?.slice(0, 7);
        ref.lastCommitMsg = commitData?.commit?.message?.split('\n')[0];
        ref.openIssuesCount = realIssues.length;
        ref.lastError = !commitRes.ok ? `GitHub HTTP ${commitRes.status}` : undefined;
      }
    });

    return {
      repo: getState().watchedRepos.find((r) => r.id === repoId)!,
      issues: realIssues.slice(0, 10),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    updateState((s) => {
      const ref = s.watchedRepos.find((r) => r.id === repoId);
      if (ref) {
        ref.lastCheckedAt = new Date().toISOString();
        ref.lastError = msg;
      }
    });
    return { repo: getState().watchedRepos.find((r) => r.id === repoId)!, issues: [] };
  }
}

/** Ú25: Local Bank/Expense CSV Importer & Receipt Categorizer */
export function importExpensesFromCsv(csvText: string, defaultCurrency = 'HUF'): ExpenseRecord[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const created: ExpenseRecord[] = [];
  const startIdx = /date|dátum|amount|összeg|merchant/i.test(lines[0]) ? 1 : 0;

  for (const line of lines.slice(startIdx, 200)) {
    const cols = line.split(/[;,]/).map((c) => c.replace(/^"|"$/g, '').trim());
    if (cols.length < 3) continue;
    const date = cols[0] || new Date().toISOString().slice(0, 10);
    const merchant = cols[1] || 'Ismeretlen';
    const rawAmount = Number(cols[2].replace(/\s+/g, '').replace(',', '.'));
    if (Number.isNaN(rawAmount)) continue;
    const category = cols[3] || categorizeMerchant(merchant);
    created.push({
      id: `exp-${crypto.randomUUID().slice(0, 8)}`,
      date,
      merchant,
      category,
      amount: Math.abs(rawAmount),
      currency: cols[4] || defaultCurrency,
      source: 'csv',
    });
  }

  if (created.length > 0) {
    updateState((s) => {
      s.expenses.unshift(...created);
    });
  }
  return created;
}

export function categorizeMerchant(merchant: string): string {
  const m = merchant.toLowerCase();
  if (/aldi|lidl|tesco|spar|auchan|penny|bolt|grocery|market/.test(m)) return 'Élelmiszer';
  if (/mol|shell|omv|bkk|máv|uber|bolt|taxi|fuel/.test(m)) return 'Közlekedés';
  if (/telekom|vodafone|digi|yettel|eon|mvm|víz|gáz|áram/.test(m)) return 'Rezsi & Telekom';
  if (/aws|hetzner|github|openai|google|digitalocean|cloudflare/.test(m)) return 'Tech & Felhő';
  return 'Egyéb';
}
