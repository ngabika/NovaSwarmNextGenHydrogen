import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  Agent,
  CalendarEvent,
  KanbanCard,
  KanbanStatus,
  SessionIsolationMode,
  ToolExecutionStep,
} from '../../shared/types';
import {
  buildSvgChartArtifact,
  runSandboxedCodeInterpreter,
} from '../automation/workflowsAndProductivity';
import { checkSslCertificate, executeSshProfileCommand } from '../infra/hostAdmin';
import {
  callHomeAssistantService,
  publishMqttMessage,
  queryHomeAssistantStates,
} from '../integrations/ecosystem';
import { callMcpTool, listMcpTools } from '../mcp/manager';
import { addPersistentMemory, searchMemories } from '../memory/vectorStore';
import { generateImageArtifactWithGemini } from '../providers/router';
import { searchOfflineKnowledgePack } from '../rag/documents';
import { runInSupervisorSandbox } from '../sandbox/supervisorSandbox';
import {
  assertHostPermission,
  detectDestructiveOperation,
  requireDestructiveApproval,
} from '../security/permissionGate';
import { assertNotForbiddenModificationZone } from '../selfmod/gitGuard';
import { createAndValidateSkill } from '../skills/loader';
import { appendAuditLog, getState, updateState } from '../state/store';
import {
  cleanHtmlToMarkdown,
  performWebSearch,
  runHeadlessBrowserAction,
} from '../web/searchAndBrowser';

export const AGENT_TOOLS_INSTRUCTION = `Eszköz-használati protokoll (párhuzamos és többlépéses eszköz-lánc):
Ha egy művelethez valós rendszeradat, fájl, webes keresés, memória, Kanban kártya, kép, diagram, okosotthon vagy al-ágens szükséges, válaszolj egy vagy akár több <tool_call>{"name":"...","args":{...}}</tool_call> blokkal, és várd meg az eredményt!
Elérhető eszközök:
1. exec_shell: {"command": "..."} — parancs futtatása (main_host szálon host kapuval, sandboxed szálon elszigetelt sandboxban).
2. read_file: {"path": "relatív/útvonal"} — fájl olvasása.
3. write_file: {"path": "relatív/útvonal", "content": "..."} — teljes fájl írása (tiltott titkos zónák blokkolva).
4. patch_file: {"path": "relatív/útvonal", "search": "...", "replace": "..."} — célzott kódrészlet csere teljes újraírás nélkül.
5. web_fetch: {"url": "https://..."} — élő weboldal lekérdezése tiszta Markdown és fő linkek kivonatolásával.
6. web_search: {"query": "..."} — élő internetes keresés (DuckDuckGo / SearXNG / Brave).
7. browser_action: {"action": "navigate_dom|screenshot|extract_links", "url": "https://..."} — headless böngésző vezérlés.
8. memory_search: {"query": "..."} — hibrid RRF keresés a tartós memóriában.
9. memory_save: {"entity": "...", "content": "...", "tags": ["..."]} — új tartós memória mentése.
10. offline_knowledge: {"query": "..."} — internet nélküli keresés a helyi RAG dokumentumokban, Vaultban és Linux man oldalakban.
11. kanban_create: {"title": "...", "description": "...", "priority": "medium|high"} — új Kanban feladat felvétele.
12. kanban_move: {"cardId": "...", "status": "todo|in_progress|done"} — Kanban kártya mozgatása.
13. spawn_subagent: {"name": "...", "role": "...", "systemPrompt": "..."} — új al-ágens létrehozása a csapatban.
14. create_skill: {"name": "...", "description": "...", "code": "..."} — új Node.js skill létrehozása (Felügyelő Sandbox teszteli).
15. mcp_list_tools: {"mcpId": "opcionális-mcp-id"} — engedélyezett MCP szerverek eszközeinek lekérdezése.
16. mcp_call: {"mcpId": "...", "toolName": "...", "args": {...}} — külső MCP eszköz meghívása.
17. generate_image: {"prompt": "...", "title": "..."} — AI kép generálása az erőforrástárba.
18. run_code_sandbox: {"language": "javascript|python", "code": "..."} — elszigetelt kód-értelmező futtatása.
19. create_svg_chart: {"title": "...", "labels": ["..."], "values": [10,20], "unit": "%"} — SVG oszlopdiagram artifact készítése.
20. smart_home: {"mode": "ha_states|ha_service|mqtt", "domain": "...", "service": "...", "entityId": "...", "topic": "...", "payload": "..."} — Home Assistant vagy MQTT vezérlés.
21. ssh_exec: {"profileId": "...", "command": "..."} — távoli parancs futtatása SSH flottán.
22. check_ssl: {"host": "example.com", "port": 443} — TLS/SSL tanúsítvány lejáratának ellenőrzése.
23. schedule_reminder: {"title": "...", "startAt": "ISO-8601", "notes": "..."} — naptár esemény / emlékeztető mentése.
Ha már minden adat megvan a válaszadáshoz, válaszolj normál szöveggel (<tool_call> nélkül).`;

export interface ParsedToolCall {
  name: string;
  args: Record<string, unknown>;
}

export function parseToolCallFromResponse(text: string): ParsedToolCall | null {
  const all = parseAllToolCallsFromResponse(text);
  return all.length > 0 ? all[0] : null;
}

/** M3: Parse multiple <tool_call> blocks for parallel execution in a single turn */
export function parseAllToolCallsFromResponse(text: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];
  const regex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null && calls.length < 4) {
    try {
      const parsed = JSON.parse(match[1]) as { name?: string; args?: Record<string, unknown> };
      if (parsed?.name) {
        calls.push({ name: parsed.name, args: parsed.args || {} });
      }
    } catch {
      // skip malformed tool call block
    }
  }
  return calls;
}

function isMcpAllowedForAgent(agent: Agent, mcpId: string): boolean {
  if (!agent.allowedMcpIds || agent.allowedMcpIds.length === 0) return true;
  return agent.allowedMcpIds.includes(mcpId);
}

export async function executeAgentTool(params: {
  agent: Agent;
  toolName: string;
  args: Record<string, unknown>;
  isolationMode: SessionIsolationMode;
}): Promise<{ step: ToolExecutionStep; observation: string; createdArtifactId?: string }> {
  const { agent, toolName, args, isolationMode } = params;
  const isSandboxed = isolationMode === 'sandboxed' || !agent.hostExecutionEnabled;

  try {
    if (toolName === 'exec_shell') {
      const command = String(args.command || '').trim();
      if (!command) throw new Error('Parancs hiányzik.');

      if (isSandboxed) {
        const res = runInSupervisorSandbox({ scriptOrCommand: command, isNodeScript: false });
        const out = `SANDBOX (${res.isolationMode}, exit=${res.exitCode}):\n${res.stdout || res.stderr}`;
        return {
          step: {
            tool: 'exec_shell',
            args: { command },
            ok: res.passed,
            sandboxed: true,
            outputPreview: out.slice(0, 240),
          },
          observation: out,
        };
      }

      assertHostPermission(`exec:${command}`, agent.id);
      const destructive = detectDestructiveOperation(command);
      if (destructive.isDestructive && destructive.type && destructive.title) {
        const req = requireDestructiveApproval(destructive.type, destructive.title, command, agent.name);
        const msg = `Jóváhagyási sorba téve (${req.id}): ${destructive.title}`;
        return {
          step: { tool: 'exec_shell', args: { command }, ok: false, sandboxed: false, outputPreview: msg },
          observation: msg,
        };
      }

      const out = execSync(command, { cwd: process.cwd(), encoding: 'utf8', timeout: 12000 });
      appendAuditLog({
        type: 'action',
        sourceAgentId: agent.id,
        sourceAgentName: agent.name,
        message: `Tool exec_shell végrehajtva: ${command}`,
        verifiedExecution: true,
      });
      return {
        step: { tool: 'exec_shell', args: { command }, ok: true, sandboxed: false, outputPreview: out.slice(0, 240) },
        observation: out.slice(0, 3000) || '(üres kimenet)',
      };
    }

    if (toolName === 'read_file') {
      const rel = String(args.path || '').trim();
      if (!rel) throw new Error('Fájlútvonal hiányzik.');
      if (isSandboxed) throw new Error('Elszigetelt (sandboxed) szálban a host fájlolvasás tiltva.');
      assertHostPermission(`read_file:${rel}`, agent.id);
      const cleanRel = assertNotForbiddenModificationZone(rel);
      const abs = path.resolve(process.cwd(), cleanRel);
      const content = fs.readFileSync(abs, 'utf8').slice(0, 4000);
      appendAuditLog({
        type: 'action',
        sourceAgentId: agent.id,
        sourceAgentName: agent.name,
        message: `Tool read_file: ${cleanRel}`,
        verifiedExecution: true,
      });
      return {
        step: { tool: 'read_file', args: { path: cleanRel }, ok: true, sandboxed: false, outputPreview: content.slice(0, 180) },
        observation: content,
      };
    }

    if (toolName === 'write_file') {
      const rel = String(args.path || '').trim();
      const content = String(args.content ?? '');
      if (!rel) throw new Error('Fájlútvonal hiányzik.');
      if (isSandboxed) throw new Error('Elszigetelt (sandboxed) szálban a host fájlírás tiltva.');
      assertHostPermission(`write_file:${rel}`, agent.id);
      const cleanRel = assertNotForbiddenModificationZone(rel);
      const abs = path.resolve(process.cwd(), cleanRel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content, 'utf8');
      appendAuditLog({
        type: 'action',
        sourceAgentId: agent.id,
        sourceAgentName: agent.name,
        message: `Tool write_file: ${cleanRel}`,
        verifiedExecution: true,
      });
      return {
        step: { tool: 'write_file', args: { path: cleanRel }, ok: true, sandboxed: false, outputPreview: `Written ${content.length} bytes` },
        observation: `Sikeres fájlírás: ${cleanRel} (${content.length} bájt)`,
      };
    }

    /** M8: Surgical File Patch Tool */
    if (toolName === 'patch_file') {
      const rel = String(args.path || '').trim();
      const search = String(args.search ?? '');
      const replace = String(args.replace ?? '');
      if (!rel || !search) throw new Error('path és search paraméterek kötelezőek.');
      if (isSandboxed) throw new Error('Elszigetelt (sandboxed) szálban a host fájlmódosítás tiltva.');
      assertHostPermission(`patch_file:${rel}`, agent.id);
      const cleanRel = assertNotForbiddenModificationZone(rel);
      const abs = path.resolve(process.cwd(), cleanRel);
      if (!fs.existsSync(abs)) throw new Error(`Fájl nem található: ${cleanRel}`);
      const original = fs.readFileSync(abs, 'utf8');
      if (!original.includes(search)) {
        throw new Error(`A keresett szövegrészlet nem található a fájlban (${cleanRel}).`);
      }
      const next = original.replace(search, replace);
      fs.writeFileSync(abs, next, 'utf8');
      appendAuditLog({
        type: 'action',
        sourceAgentId: agent.id,
        sourceAgentName: agent.name,
        message: `Tool patch_file: ${cleanRel}`,
        verifiedExecution: true,
      });
      return {
        step: { tool: 'patch_file', args: { path: cleanRel }, ok: true, sandboxed: false, outputPreview: `Patched ${cleanRel}` },
        observation: `Sikeres célzott fájl-patch: ${cleanRel}`,
      };
    }

    /** M7: Upgraded HTML->Markdown Reader */
    if (toolName === 'web_fetch') {
      if (!agent.webSearchEnabled) throw new Error('Az ágens számára a webes lekérés le van tiltva.');
      const url = String(args.url || '').trim();
      if (!/^https?:\/\//i.test(url)) throw new Error('Csak http/https URL engedélyezett.');
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const html = await res.text();
      const parsed = cleanHtmlToMarkdown(html, url);
      const linkSummary = parsed.links.slice(0, 6).map((l) => `- [${l.text}](${l.url})`).join('\n');
      const obs = `HTTP ${res.status} (${parsed.title || url}):\n${parsed.text.slice(0, 2600)}${linkSummary ? `\n\nFőbb linkek:\n${linkSummary}` : ''}`;
      appendAuditLog({
        type: 'action',
        sourceAgentId: agent.id,
        sourceAgentName: agent.name,
        message: `Tool web_fetch (${res.status}): ${url}`,
        verifiedExecution: true,
      });
      return {
        step: { tool: 'web_fetch', args: { url }, ok: res.ok, sandboxed: isSandboxed, outputPreview: parsed.text.slice(0, 180) },
        observation: obs,
      };
    }

    /** Ú2: Live Web Search */
    if (toolName === 'web_search') {
      if (!agent.webSearchEnabled) throw new Error('Az ágens számára az internetes keresés le van tiltva.');
      const query = String(args.query || '').trim();
      if (!query) throw new Error('Keresőkifejezés (query) kötelező.');
      const searchRes = await performWebSearch(query, 6);
      const obs =
        searchRes.results.length > 0
          ? searchRes.results.map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`).join('\n')
          : searchRes.error || 'Nincs webes találat.';
      return {
        step: {
          tool: 'web_search',
          args: { query },
          ok: searchRes.results.length > 0,
          sandboxed: isSandboxed,
          outputPreview: `${searchRes.results.length} találat (${searchRes.provider})`,
        },
        observation: obs,
      };
    }

    /** Ú1: Headless Browser Action */
    if (toolName === 'browser_action') {
      if (!agent.webSearchEnabled) throw new Error('Webes böngészés le van tiltva ehhez az ágenshez.');
      const action = (String(args.action || 'navigate_dom') as 'navigate_dom' | 'screenshot' | 'extract_links');
      const url = String(args.url || '').trim();
      const bRes = await runHeadlessBrowserAction({ action, url });
      return {
        step: {
          tool: 'browser_action',
          args: { action, url },
          ok: bRes.ok,
          sandboxed: isSandboxed,
          outputPreview: bRes.ok ? (bRes.title || action) : (bRes.error || 'Hiba').slice(0, 180),
        },
        observation: bRes.ok
          ? `${bRes.title || url}\n${bRes.textPreview || (bRes.screenshotBase64 ? `Képernyőkép elkészült (${bRes.screenshotBase64.length} base64 char)` : 'OK')}`
          : `Böngésző hiba: ${bRes.error}`,
      };
    }

    if (toolName === 'memory_search') {
      const q = String(args.query || '');
      const hits = searchMemories(q, 5, { reinforce: true });
      const out = hits.map((h) => `[${h.tier || 'warm'} | ${h.entity}] ${h.content}`).join('\n') || 'Nincs találat.';
      return {
        step: { tool: 'memory_search', args: { query: q }, ok: true, sandboxed: isSandboxed, outputPreview: `${hits.length} találat` },
        observation: out,
      };
    }

    if (toolName === 'memory_save') {
      const entity = String(args.entity || agent.name);
      const content = String(args.content || '').trim();
      const tags = Array.isArray(args.tags) ? args.tags.map(String) : ['agent_memory'];
      if (!content) throw new Error('Memória tartalom hiányzik.');
      const saved = addPersistentMemory({
        entity,
        content,
        tags,
        tier: 'hot',
        importanceScore: 0.85,
        agentId: agent.id,
      });
      return {
        step: { tool: 'memory_save', args: { entity }, ok: true, sandboxed: isSandboxed, outputPreview: saved.id },
        observation: `Mentve (${saved.id}) az Obsidian vaultba (${saved.obsidianPath}).`,
      };
    }

    /** Ú27: Offline Knowledge Pack */
    if (toolName === 'offline_knowledge') {
      const q = String(args.query || '').trim();
      const res = searchOfflineKnowledgePack(q);
      const parts: string[] = [];
      if (res.memoryHits.length) parts.push(`Memóriák:\n${res.memoryHits.map((m) => `- ${m.entity}: ${m.content}`).join('\n')}`);
      if (res.localDocHits.length) parts.push(`Dokumentumok:\n${res.localDocHits.map((d) => `- ${d.file}: ${d.excerpt}`).join('\n')}`);
      if (res.manPageExcerpt) parts.push(`Man oldal:\n${res.manPageExcerpt.slice(0, 900)}`);
      return {
        step: {
          tool: 'offline_knowledge',
          args: { query: q },
          ok: true,
          sandboxed: isSandboxed,
          outputPreview: `${res.memoryHits.length} mem / ${res.localDocHits.length} dok`,
        },
        observation: parts.join('\n\n') || 'Nincs offline találat.',
      };
    }

    if (toolName === 'kanban_create') {
      const title = String(args.title || '').trim();
      if (!title) throw new Error('Kanban cím hiányzik.');
      const now = new Date().toISOString();
      const card: KanbanCard = {
        id: `card-${crypto.randomUUID().slice(0, 8)}`,
        title,
        description: String(args.description || ''),
        status: 'todo',
        assignedAgentId: agent.id,
        priority: (args.priority as KanbanCard['priority']) || 'medium',
        subtasks: [],
        createdAt: now,
        updatedAt: now,
      };
      updateState((s) => {
        s.kanban.unshift(card);
      });
      appendAuditLog({
        type: 'kanban',
        sourceAgentId: agent.id,
        sourceAgentName: agent.name,
        message: `Tool kanban_create: ${card.title}`,
        verifiedExecution: true,
      });
      return {
        step: { tool: 'kanban_create', args: { title }, ok: true, sandboxed: isSandboxed, outputPreview: card.id },
        observation: `Kanban kártya létrehozva: ${card.id} (${card.title})`,
      };
    }

    if (toolName === 'kanban_move') {
      const cardId = String(args.cardId || '');
      const status = (args.status as KanbanStatus) || 'in_progress';
      let found = false;
      updateState((s) => {
        const c = s.kanban.find((x) => x.id === cardId);
        if (c) {
          c.status = status;
          c.updatedAt = new Date().toISOString();
          found = true;
        }
      });
      if (!found) throw new Error(`Kártya nem található: ${cardId}`);
      appendAuditLog({
        type: 'kanban',
        sourceAgentId: agent.id,
        sourceAgentName: agent.name,
        message: `Tool kanban_move: ${cardId} -> ${status}`,
        verifiedExecution: true,
      });
      return {
        step: { tool: 'kanban_move', args: { cardId, status }, ok: true, sandboxed: isSandboxed, outputPreview: `${cardId} -> ${status}` },
        observation: `Kanban kártya mozgatva: ${cardId} -> ${status}`,
      };
    }

    if (toolName === 'spawn_subagent') {
      const name = String(args.name || '').trim();
      const role = String(args.role || 'Specialista').trim();
      const systemPrompt = String(args.systemPrompt || 'Specialista al-ágens.').trim();
      if (!name) throw new Error('Al-ágens név hiányzik.');
      const now = new Date().toISOString();
      const state = getState();
      const child: Agent = {
        id: `agent-${crypto.randomUUID().slice(0, 8)}`,
        name,
        avatar: 'cpu',
        role,
        parentAgentId: agent.id,
        systemPrompt,
        modelId: agent.modelId,
        providerId: agent.providerId,
        webSearchEnabled: agent.webSearchEnabled,
        hostExecutionEnabled: !isSandboxed && state.settings.hostPermissionsGranted,
        active: true,
        dailySpendUsd: 0,
        voiceReplyMode: 'off',
        createdAt: now,
        updatedAt: now,
      };
      updateState((s) => {
        s.agents.push(child);
      });
      appendAuditLog({
        type: 'system',
        sourceAgentId: agent.id,
        sourceAgentName: agent.name,
        message: `Tool spawn_subagent: ${child.name} (${child.role})`,
        verifiedExecution: true,
      });
      return {
        step: { tool: 'spawn_subagent', args: { name, role }, ok: true, sandboxed: isSandboxed, outputPreview: child.id },
        observation: `Új al-ágens létrehozva: ${child.name} (${child.id})`,
      };
    }

    if (toolName === 'create_skill') {
      const name = String(args.name || '').trim();
      const description = String(args.description || '');
      const code = String(args.code || '').trim();
      if (!name || !code) throw new Error('Skill név és kód kötelező.');
      const sk = createAndValidateSkill({ name, description, code, createdByAgentId: agent.id });
      return {
        step: { tool: 'create_skill', args: { name }, ok: sk.status === 'verified', sandboxed: true, outputPreview: sk.status },
        observation: `Skill státusz: ${sk.status}\n${sk.sandboxReport}`,
      };
    }

    /** M19: Per-agent MCP permission matrix enforcement */
    if (toolName === 'mcp_list_tools') {
      const mcpId = String(args.mcpId || '').trim();
      if (!mcpId) {
        const list = getState()
          .mcpServers.filter((m) => isMcpAllowedForAgent(agent, m.id))
          .map((m) => `- ${m.id}: ${m.name} (${m.transport || 'http'}, status=${m.status})`)
          .join('\n');
        return {
          step: { tool: 'mcp_list_tools', args: {}, ok: true, sandboxed: isSandboxed, outputPreview: 'MCP lista visszaadva' },
          observation: list || 'Nincs ehhez az ágenshez engedélyezett MCP szerver.',
        };
      }
      if (!isMcpAllowedForAgent(agent, mcpId)) {
        throw new Error(`Jogosultsági korlát: ${agent.name} nem férhet hozzá ehhez az MCP szerverhez (${mcpId}).`);
      }
      const res = await listMcpTools(mcpId);
      const summary = res.tools.map((t) => `- ${t.name}: ${t.description || ''}`).join('\n') || 'Nincs deklarált eszköz.';
      return {
        step: { tool: 'mcp_list_tools', args: { mcpId }, ok: true, sandboxed: isSandboxed, outputPreview: `${res.tools.length} eszköz` },
        observation: `MCP [${res.mcpName}] eszközei:\n${summary}`,
      };
    }

    if (toolName === 'mcp_call') {
      const mcpId = String(args.mcpId || '').trim();
      const mcpToolName = String(args.toolName || '').trim();
      const mcpArgs = (args.args && typeof args.args === 'object' ? args.args : {}) as Record<string, unknown>;
      if (!mcpId || !mcpToolName) throw new Error('mcpId és toolName kötelező az mcp_call eszközhöz.');
      if (!isMcpAllowedForAgent(agent, mcpId)) {
        throw new Error(`Jogosultsági korlát: ${agent.name} nem hívhatja meg ezt az MCP szervert (${mcpId}).`);
      }
      const outcome = await callMcpTool(mcpId, mcpToolName, mcpArgs);
      return {
        step: {
          tool: 'mcp_call',
          args: { mcpId, toolName: mcpToolName },
          ok: outcome.ok,
          sandboxed: isSandboxed,
          outputPreview: outcome.output.slice(0, 200),
        },
        observation: outcome.output,
      };
    }

    /** Ú4: AI Image Generation Tool */
    if (toolName === 'generate_image') {
      const prompt = String(args.prompt || '').trim();
      const title = String(args.title || prompt.slice(0, 50) || 'Generált kép');
      if (!prompt) throw new Error('Kép prompt kötelező.');
      const art = await generateImageArtifactWithGemini({ prompt, agentId: agent.id });
      return {
        step: { tool: 'generate_image', args: { title }, ok: true, sandboxed: isSandboxed, outputPreview: art.id },
        observation: `Kép legenerálva és elmentve az Erőforrástárba (ID: ${art.id}, cím: ${art.title}).`,
        createdArtifactId: art.id,
      };
    }

    /** Ú18: Sandboxed Code Interpreter */
    if (toolName === 'run_code_sandbox') {
      const language = String(args.language || 'javascript') === 'python' ? 'python' : 'javascript';
      const code = String(args.code || '').trim();
      if (!code) throw new Error('Futtatandó kód kötelező.');
      const res = runSandboxedCodeInterpreter({ language, code });
      const obs = `Sandbox (${language}, ${res.isolationMode}, ${res.durationMs}ms):\nSTDOUT:\n${res.stdout}\nSTDERR:\n${res.stderr}`;
      return {
        step: { tool: 'run_code_sandbox', args: { language }, ok: res.passed, sandboxed: true, outputPreview: (res.stdout || res.stderr).slice(0, 180) },
        observation: obs,
      };
    }

    /** Ú18: SVG Chart Artifact */
    if (toolName === 'create_svg_chart') {
      const title = String(args.title || 'Diagram');
      const labels = Array.isArray(args.labels) ? args.labels.map(String) : [];
      const values = Array.isArray(args.values) ? args.values.map(Number) : [];
      const unit = args.unit ? String(args.unit) : '';
      const art = buildSvgChartArtifact({ title, labels, values, unit });
      return {
        step: { tool: 'create_svg_chart', args: { title }, ok: true, sandboxed: isSandboxed, outputPreview: art.id },
        observation: `SVG oszlopdiagram elkészült (${art.id}): ${title}`,
        createdArtifactId: art.id,
      };
    }

    /** Ú13: Smart Home Tool */
    if (toolName === 'smart_home') {
      const mode = String(args.mode || 'ha_states');
      if (mode === 'ha_states') {
        const res = await queryHomeAssistantStates();
        const obs = res.ok
          ? res.states.map((s) => `${s.entity_id}: ${s.state}`).join('\n')
          : res.error || 'Home Assistant nem elérhető';
        return {
          step: { tool: 'smart_home', args: { mode }, ok: res.ok, sandboxed: isSandboxed, outputPreview: `${res.states.length} entitás` },
          observation: obs,
        };
      }
      if (mode === 'ha_service') {
        const res = await callHomeAssistantService(
          String(args.domain || 'light'),
          String(args.service || 'toggle'),
          String(args.entityId || '')
        );
        return {
          step: { tool: 'smart_home', args: { mode, entityId: args.entityId }, ok: res.ok, sandboxed: isSandboxed, outputPreview: res.message },
          observation: res.message,
        };
      }
      if (mode === 'mqtt') {
        const cfg = getState().settings;
        if (!cfg.mqttBrokerHost) throw new Error('MQTT bróker nincs konfigurálva a Beállításokban.');
        const res = await publishMqttMessage(
          cfg.mqttBrokerHost,
          cfg.mqttBrokerPort || 1883,
          String(args.topic || 'novaswarm/cmd'),
          String(args.payload || 'ping')
        );
        return {
          step: { tool: 'smart_home', args: { mode, topic: args.topic }, ok: res.ok, sandboxed: isSandboxed, outputPreview: res.message },
          observation: res.message,
        };
      }
      throw new Error(`Ismeretlen smart_home mód: ${mode}`);
    }

    /** Ú15: SSH Fleet Execution */
    if (toolName === 'ssh_exec') {
      if (isSandboxed) throw new Error('Elszigetelt szálban az SSH flotta hívás tiltva.');
      const profileId = String(args.profileId || '').trim();
      const command = String(args.command || 'uptime').trim();
      const res = executeSshProfileCommand(profileId, command);
      return {
        step: { tool: 'ssh_exec', args: { profileId, command }, ok: res.ok, sandboxed: false, outputPreview: res.output.slice(0, 180) },
        observation: res.output,
      };
    }

    /** Ú26: SSL Certificate Inspection */
    if (toolName === 'check_ssl') {
      const host = String(args.host || '').trim();
      const port = Number(args.port || 443);
      if (!host) throw new Error('host kötelező a check_ssl eszközhöz.');
      const res = await checkSslCertificate(host, port);
      return {
        step: { tool: 'check_ssl', args: { host, port }, ok: !res.error, sandboxed: isSandboxed, outputPreview: res.error || `${res.daysRemaining} nap` },
        observation: res.error
          ? `SSL hiba (${host}): ${res.error}`
          : `SSL OK (${host}:${port}): Kibocsátó=${res.issuer}, Lejárat=${res.expiresAt}, Hátralévő napok=${res.daysRemaining}`,
      };
    }

    /** Ú8: Calendar Reminder Tool */
    if (toolName === 'schedule_reminder') {
      const title = String(args.title || '').trim();
      const startAt = String(args.startAt || new Date(Date.now() + 3_600_000).toISOString());
      if (!title) throw new Error('Emlékeztető címe kötelező.');
      const ev: CalendarEvent = {
        id: `cal-${crypto.randomUUID().slice(0, 8)}`,
        title,
        startAt,
        notes: args.notes ? String(args.notes) : undefined,
        reminderMinutes: Number(args.reminderMinutes ?? 15),
        createdAt: new Date().toISOString(),
      };
      updateState((s) => {
        s.calendarEvents.unshift(ev);
      });
      return {
        step: { tool: 'schedule_reminder', args: { title, startAt }, ok: true, sandboxed: isSandboxed, outputPreview: ev.id },
        observation: `Naptár emlékeztető rögzítve: ${ev.title} (${ev.startAt})`,
      };
    }

    throw new Error(`Ismeretlen eszköz: ${toolName}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      step: { tool: toolName, args, ok: false, sandboxed: isSandboxed, outputPreview: msg.slice(0, 200) },
      observation: `HIBA (${toolName}): ${msg}`,
    };
  }
}
