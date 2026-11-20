#!/usr/bin/env tsx
/**
 * Ú56: NovaSwarm Terminal CLI Bridge
 * Usage:
 *   novaswarm status
 *   novaswarm ask "<kérdés>"
 *   novaswarm mission "<cél>"
 *   novaswarm kanban
 *   novaswarm weather [város]
 *   novaswarm doctor
 *   novaswarm backup
 */
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

async function main() {
  const [, , cmd = 'help', ...rest] = process.argv;
  const argText = rest.join(' ').trim();

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

  console.log(`NovaSwarm CLI (Cél: ${BASE_URL})`);
  console.log('Parancsok: status | ask "<szöveg>" | mission "<cél>" | kanban | weather [város] | doctor | backup');
}

main().catch((err) => {
  console.error('HIBA:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
