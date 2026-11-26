#!/usr/bin/env tsx
/**
 * Ú56 + Local Recovery: NovaSwarm Terminal CLI Bridge
 * Usage:
 *   novaswarm status
 *   novaswarm set-password [--generate] [--password <pw>]
 *   novaswarm remove-password [--yes]
 *   novaswarm reset-login-lock
 *   novaswarm autonomy-status
 *   novaswarm ollama-reselect
 *   novaswarm ask "<kérdés>"
 *   novaswarm mission "<cél>"
 *   novaswarm kanban
 *   novaswarm weather [város]
 *   novaswarm doctor
 *   novaswarm backup
 */
import crypto from 'node:crypto';
import readline from 'node:readline';
import {
  consumeOneTimeSetupCode,
  resetAllLoginLocks,
} from '../server/security/auth';
import {
  activateEmergencyLockdown,
  getTotalAutonomySummary,
  restoreSecuritySnapshot,
  unlockEmergencyLockdown,
} from '../server/security/totalAutonomy';
import {
  appendAuditLog,
  clearWebAuthPassword,
  getState,
  hasWebAuthPassword,
  normalizePasswordInput,
  setWebAuthPassword,
  updateState,
} from '../server/state/store';
import { reselectOllamaSuite } from '../server/system/ollamaSelector';

const BASE_URL = (process.env.NOVASWARM_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const TOKEN = process.env.NOVASWARM_API_TOKEN || '';

async function callApi<T>(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}

export function generateCliPassword(length = 18): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%^&*-_+=';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export function cliSetOperatorPassword(rawPassword: string, actor = 'cli-set-password'): {
  webAuthEnabled: boolean;
  webAuthHasPassword: boolean;
} {
  getState();
  const normalized = normalizePasswordInput(rawPassword);
  if (normalized.length < 12) {
    throw new Error('Az operátori jelszónak legalább 12 karakter hosszúnak kell lennie.');
  }
  setWebAuthPassword(normalized);
  consumeOneTimeSetupCode();
  const hasPw = hasWebAuthPassword();
  updateState((s) => {
    s.settings.webAuthHasPassword = hasPw;
    s.settings.webAuthEnabled = hasPw;
    s.settings.onboardingCompleted = true;
  });
  appendAuditLog({
    type: 'security',
    sourceAgentId: actor,
    sourceAgentName: 'Helyi CLI Jelszókezelő',
    message: 'Operátori webes jelszó beállítva / lecserélve helyi CLI paranccsal (LAN zár AKTÍV).',
    verifiedExecution: true,
  });
  return {
    webAuthEnabled: getState().settings.webAuthEnabled,
    webAuthHasPassword: hasPw,
  };
}

export function cliRemoveOperatorPassword(actor = 'cli-remove-password'): {
  webAuthEnabled: boolean;
  webAuthHasPassword: boolean;
} {
  getState();
  clearWebAuthPassword();
  updateState((s) => {
    s.settings.webAuthHasPassword = false;
    s.settings.webAuthEnabled = false;
  });
  appendAuditLog({
    type: 'security',
    sourceAgentId: actor,
    sourceAgentName: 'Helyi CLI Jelszókezelő',
    message: 'Operátori webes jelszó eltávolítva helyi CLI paranccsal — jelszó nélküli LAN mód AKTÍV.',
    verifiedExecution: true,
    passwordlessMode: true,
  });
  return {
    webAuthEnabled: getState().settings.webAuthEnabled,
    webAuthHasPassword: hasWebAuthPassword(),
  };
}

export function cliResetLoginLocks(actor = 'cli-reset-login-lock'): { clearedCount: number } {
  getState();
  const clearedCount = resetAllLoginLocks(actor);
  return { clearedCount };
}

function readHiddenLineFromTty(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error('Nem interaktív terminál — használd a --generate vagy --password kapcsolót.'));
      return;
    }
    process.stdout.write(prompt);
    const stdin = process.stdin;
    const prevRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let buf = '';
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(Boolean(prevRaw));
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(buf);
          return;
        }
        if (c === '\u0003') {
          stdin.setRawMode(Boolean(prevRaw));
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          reject(new Error('Megszakítva (Ctrl+C).'));
          return;
        }
        if (c === '\u007f' || c === '\b') {
          buf = buf.slice(0, -1);
          continue;
        }
        buf += c;
      }
    };
    stdin.on('data', onData);
  });
}

function askVisibleLine(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

async function main() {
  const [, , cmd = 'help', ...rest] = process.argv;
  const argText = rest.join(' ').trim();

  if (cmd === 'set-password') {
    let pw = '';
    let generated = false;
    if (rest.includes('--generate')) {
      pw = generateCliPassword(18);
      generated = true;
    } else {
      const idx = rest.indexOf('--password');
      if (idx >= 0 && rest[idx + 1] !== undefined) {
        pw = rest[idx + 1];
      } else if (process.env.NOVASWARM_NEW_PASSWORD) {
        pw = process.env.NOVASWARM_NEW_PASSWORD;
      } else {
        const p1 = await readHiddenLineFromTty('Új operátori jelszó (min. 12 karakter): ');
        const p2 = await readHiddenLineFromTty('Új operátori jelszó megerősítése: ');
        if (normalizePasswordInput(p1) !== normalizePasswordInput(p2)) {
          throw new Error('A két megadott jelszó nem egyezik.');
        }
        pw = p1;
      }
    }

    cliSetOperatorPassword(pw);
    if (generated) {
      console.log(`✅ Új generált operátori jelszó (mentsd el most, többé nem jelenik meg): ${pw}`);
    } else {
      console.log('✅ Operátori jelszó sikeresen beállítva (LAN WebUI zár aktív).');
    }
    return;
  }

  if (cmd === 'remove-password') {
    const confirmed = rest.includes('--yes') || rest.includes('-y');
    if (!confirmed) {
      const ans = await askVisibleLine(
        'Biztosan törlöd a webes jelszót (bárki elérheti a felületet a helyi hálózaton)? [i/N]: '
      );
      if (!/^[iy]/i.test(ans)) {
        console.log('Művelet megszakítva.');
        return;
      }
    }
    cliRemoveOperatorPassword();
    console.log('⚠️ Webes jelszó eltávolítva — a felület most jelszó nélküli LAN módban működik.');
    return;
  }

  if (cmd === 'reset-login-lock') {
    const out = cliResetLoginLocks();
    console.log(`🔓 Bejelentkezési zárak feloldva (${out.clearedCount} IP rekord törölve).`);
    return;
  }

  if (cmd === 'lockdown') {
    const reason = argText || 'CLI vészleállítás';
    getState();
    const localRes = await activateEmergencyLockdown('cli', reason);
    try {
      await callApi('/api/total-autonomy/lockdown', 'POST', { reason });
    } catch {
      // Server might be down or auth-protected; local state + lockfile already written
    }
    console.log(
      `🛑 VÉSZLEÁLLÍTÁS AKTIVÁLVA (CLI). Zárfájl: ${localRes.lockfilePath || 'állapotfájl'} | Megállított folyamatok: ${localRes.terminatedProcesses}`
    );
    return;
  }

  if (cmd === 'unlock') {
    const password = argText || process.env.NOVASWARM_PASSWORD || '';
    getState();
    const localRes = await unlockEmergencyLockdown({ password, actorLabel: 'cli-unlock' });
    if (!localRes.ok) {
      throw new Error(localRes.error || 'Vészleállítás feloldása sikertelen.');
    }
    try {
      await callApi('/api/total-autonomy/unlock', 'POST', { password });
    } catch {
      // ignore if server not running
    }
    console.log('✅ Vészleállítás (LOCKDOWN) feloldva hitelesített tulajdonosi jelszóval.');
    return;
  }

  if (cmd === 'restore-security') {
    const steps = Math.max(1, Number(rest[0] || 1) || 1);
    getState();
    const localRes = restoreSecuritySnapshot(steps, 'cli');
    try {
      await callApi('/api/total-autonomy/restore', 'POST', { stepsBack: steps });
    } catch {
      // ignore if server offline or unreachable
    }
    if (!localRes.ok) {
      throw new Error(localRes.message);
    }
    console.log(`♻️ ${localRes.message}`);
    return;
  }

  if (cmd === 'autonomy-status') {
    getState();
    const summary = getTotalAutonomySummary();
    console.log(`Totális autonómia: ${summary.totalAutonomyEnabled ? 'AKTÍV' : 'KI'}`);
    console.log(`Vészleállítás: ${summary.lockdownActive ? 'AKTÍV' : 'KI'}`);
    console.log(`Audit lánc: ${summary.guarantees.appendOnlyAudit.chainValid ? 'ÉP' : 'SÉRÜLT'} (${summary.guarantees.appendOnlyAudit.entriesCount} sor)`);
    console.log(`Biztonsági mentések: ${summary.guarantees.securityRestore.snapshotsCount} db`);
    return;
  }

  if (cmd === 'status') {
    const data = await callApi<{
      state: {
        settings: { instanceName: string; primaryProvider: string; ollamaModel: string; dailySpendUsd: number; killSwitchActive: boolean };
        agents: Array<{ active: boolean; isSupervisor?: boolean }>;
        kanban: Array<{ status: string; archived?: boolean }>;
        memories: Array<unknown>;
      };
      hardware: { cpuLoadPercent: number; ramPercent: number; temperatureCelsius: number | null };
    }>('/api/state');
    const s = data.state;
    const hw = data.hardware;
    console.log(`NovaSwarm (${s.settings.instanceName})`);
    console.log(`  Ágensek: ${s.agents.filter((a) => a.active && !a.isSupervisor).length} aktív (+1 Felügyelő)`);
    console.log(`  Szolgáltató: ${s.settings.primaryProvider} | Ollama: ${s.settings.ollamaModel}`);
    console.log(`  CPU: ${hw.cpuLoadPercent}% | RAM: ${hw.ramPercent}% | Hőfok: ${hw.temperatureCelsius ?? 'N/A'}°C`);
    console.log(`  Kanban: ${s.kanban.filter((c) => !c.archived).length} kártya | Memória: ${s.memories.length} db`);
    console.log(`  Napi költés: $${s.settings.dailySpendUsd.toFixed(4)} | KillSwitch: ${s.settings.killSwitchActive ? 'AKTÍV' : 'Ki'}`);
    return;
  }

  if (cmd === 'ask') {
    if (!argText) throw new Error('Használat: novaswarm ask "<kérdés>"');
    const out = await callApi<{ coordinatorReply: { senderName: string; content: string; modelUsed?: string } }>(
      '/api/chat/send',
      'POST',
      { content: argText }
    );
    console.log(`[${out.coordinatorReply.senderName} · ${out.coordinatorReply.modelUsed || 'auto'}]\n${out.coordinatorReply.content}`);
    return;
  }

  if (cmd === 'mission') {
    if (!argText) throw new Error('Használat: novaswarm mission "<cél>"');
    const out = await callApi<{ mission: { status: string; goal: string; steps: Array<{ title: string; status: string }>; finalSummary?: string } }>(
      '/api/missions',
      'POST',
      { goal: argText }
    );
    console.log(`Küldetés (${out.mission.status}): ${out.mission.goal}`);
    for (const st of out.mission.steps) {
      console.log(`  - [${st.status}] ${st.title}`);
    }
    if (out.mission.finalSummary) console.log(`\n${out.mission.finalSummary}`);
    return;
  }

  if (cmd === 'kanban') {
    const data = await callApi<{ state: { kanban: Array<{ id: string; title: string; status: string; priority?: string; archived?: boolean }> } }>('/api/state');
    const cards = data.state.kanban.filter((c) => !c.archived);
    if (cards.length === 0) {
      console.log('A Kanban tábla üres.');
      return;
    }
    for (const c of cards) {
      console.log(`[${c.status.toUpperCase()} · ${c.priority || 'medium'}] ${c.title} (${c.id})`);
    }
    return;
  }

  if (cmd === 'weather') {
    const q = argText ? `?location=${encodeURIComponent(argText)}` : '';
    const w = await callApi<{ ok: boolean; location: string; temperatureC?: number; condition?: string; windKmh?: number; error?: string }>(
      `/api/weather${q}`
    );
    if (!w.ok) throw new Error(w.error || 'Időjárás hiba');
    console.log(`${w.location}: ${w.temperatureC}°C · ${w.condition} · Szél: ${w.windKmh} km/h`);
    return;
  }

  if (cmd === 'doctor') {
    const out = await callApi<{ uptimeSummary: string; healedActions: string[]; warnings: string[] }>('/api/system/doctor', 'POST');
    console.log(`Swarm Auto-Doctor (${out.uptimeSummary})`);
    for (const h of out.healedActions) console.log(`  [JAVÍTVA] ${h}`);
    for (const w of out.warnings) console.log(`  [FIGYELEM] ${w}`);
    return;
  }

  if (cmd === 'backup') {
    const out = await callApi<{ backup: { id: string; fileName: string; sizeBytes: number } }>('/api/system/backup', 'POST');
    console.log(`Mentés elkészült: ${out.backup.fileName} (${out.backup.sizeBytes} byte)`);
    return;
  }

  if (cmd === 'ollama-reselect') {
    const noPull = rest.includes('--no-pull');
    const noBench = rest.includes('--no-benchmark');
    try {
      const out = await callApi<{
        hardware: { arch: string; cpuCores: number; ramTotalMb: number; ramFreeMb: number; gpuName: string; gpuVramMb: number; storageKind: string };
        selection: {
          tierLabel: string;
          mainModel: string;
          fastModel: string;
          codeModel: string;
          embeddingModel: string;
          visionModel: string | null;
          numCtx: number;
          keepAlive: string;
          singleModelMutex: boolean;
          sdCardSparingMode: boolean;
        };
        cleanupSuggestions: string[];
        pulledModels: string[];
        pendingPullModels: string[];
        benchmark?: { tokensPerSec: number; latencyMs: number } | null;
      }>('/api/providers/ollama/reselect', 'POST', {
        pullMissing: !noPull,
        runBenchmark: !noBench,
        checkRemoteRegistry: true,
      });
      console.log(`Hardver tier: ${out.selection.tierLabel} (${out.hardware.arch}, ${out.hardware.cpuCores} mag, ${out.hardware.ramFreeMb}/${out.hardware.ramTotalMb} MB RAM, GPU=${out.hardware.gpuName} ${out.hardware.gpuVramMb} MB, tároló=${out.hardware.storageKind})`);
      console.log(`Kiválasztott modellek -> Fő: ${out.selection.mainModel} | Gyors: ${out.selection.fastModel} | Kód: ${out.selection.codeModel} | Embed: ${out.selection.embeddingModel}${out.selection.visionModel ? ` | Látás: ${out.selection.visionModel}` : ''}`);
      console.log(`Hangolás -> num_ctx=${out.selection.numCtx} | keep_alive=${out.selection.keepAlive} | egy-modell mutex=${out.selection.singleModelMutex ? 'BE' : 'KI'} | Pi SD-kímélő=${out.selection.sdCardSparingMode ? 'BE' : 'KI'}`);
      if (out.pulledModels.length > 0) console.log(`Letöltött modellek: ${out.pulledModels.join(', ')}`);
      if (out.pendingPullModels.length > 0) console.log(`Függőben lévő letöltések (offline/később): ${out.pendingPullModels.join(', ')}`);
      if (out.benchmark) console.log(`Benchmark: ${out.benchmark.tokensPerSec} tok/s (${out.benchmark.latencyMs}ms)`);
      for (const s of out.cleanupSuggestions) console.log(`  [TAKARÍTÁS] ${s}`);
      return;
    } catch {
      getState();
      const out = await reselectOllamaSuite({
        pullMissing: !noPull,
        runBenchmark: !noBench,
        checkRemoteRegistry: true,
      });
      console.log(`[Offline mód] Hardver tier: ${out.selection.tierLabel}`);
      console.log(`Kiválasztott modellek -> Fő: ${out.selection.mainModel} | Gyors: ${out.selection.fastModel} | Kód: ${out.selection.codeModel} | Embed: ${out.selection.embeddingModel}`);
      if (out.pendingPullModels.length > 0) console.log(`Függőben lévő letöltések: ${out.pendingPullModels.join(', ')}`);
      if (out.benchmark) console.log(`Benchmark: ${out.benchmark.tokensPerSec} tok/s (${out.benchmark.latencyMs}ms)`);
      for (const s of out.cleanupSuggestions) console.log(`  [TAKARÍTÁS] ${s}`);
      return;
    }
  }

  console.log(`NovaSwarm CLI (Cél: ${BASE_URL})`);
  console.log(
    'Parancsok: status | set-password [--generate] | remove-password [--yes] | reset-login-lock | autonomy-status | ollama-reselect | lockdown [ok] | unlock <jelszó> | restore-security [lépés] | ask "<szöveg>" | mission "<cél>" | kanban | weather [város] | doctor | backup'
  );
}

const isMain = Boolean(process.argv[1] && process.argv[1].endsWith('novaswarm-cli.ts'));
if (isMain) {
  main().catch((err) => {
    console.error('HIBA:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
