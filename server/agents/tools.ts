import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  Agent,
  KanbanCard,
  KanbanStatus,
  SessionIsolationMode,
  ToolExecutionStep,
} from '../../shared/types';
import { addPersistentMemory, searchMemories } from '../memory/vectorStore';
import { callMcpTool, listMcpTools } from '../mcp/manager';
import { runInSupervisorSandbox } from '../sandbox/supervisorSandbox';
import {
  assertHostPermission,
  detectDestructiveOperation,
  requireDestructiveApproval,
} from '../security/permissionGate';
import { assertNotForbiddenModificationZone } from '../selfmod/gitGuard';
import { createAndValidateSkill } from '../skills/loader';
import { appendAuditLog, getState, updateState } from '../state/store';

export const AGENT_TOOLS_INSTRUCTION = `Eszköz-használati protokoll (OpenClaw multi-step tool loop):
Ha egy művelethez valós rendszeradat, fájl, webes tartalom, memória, Kanban kártya vagy al-ágens szükséges, válaszolj KIZÁRÓLAG egy <tool_call>{"name":"...","args":{...}}</tool_call> blokkal, és várd meg az eredményt!
Elérhető eszközök:
1. exec_shell: {"command": "..."} — parancs futtatása (main_host szálon host kapuval, sandboxed szálon elszigetelt sandboxban).
2. read_file: {"path": "relatív/útvonal"} — fájl olvasása.
3. write_file: {"path": "relatív/útvonal", "content": "..."} — fájl írása (tiltott titkos zónák blokkolva).
4. web_fetch: {"url": "https://..."} — élő weboldal / API lekérdezése (webSearchEnabled szükséges).
5. memory_search: {"query": "..."} — hibrid RRF keresés a tartós memóriában.
6. memory_save: {"entity": "...", "content": "...", "tags": ["..."]} — új tartós memória mentése.
7. kanban_create: {"title": "...", "description": "...", "priority": "medium|high"} — új Kanban feladat felvétele.
8. kanban_move: {"cardId": "...", "status": "todo|in_progress|done"} — Kanban kártya mozgatása.
9. spawn_subagent: {"name": "...", "role": "...", "systemPrompt": "..."} — új al-ágens létrehozása a csapatban.
10. create_skill: {"name": "...", "description": "...", "code": "..."} — új Node.js skill létrehozása (Felügyelő Sandbox teszteli).
11. mcp_list_tools: {"mcpId": "opcionális-mcp-id"} — MCP szerver(ek) elérhető JSON-RPC eszközeinek lekérdezése.
12. mcp_call: {"mcpId": "...", "toolName": "...", "args": {...}} — külső MCP eszköz tényleges meghívása titkosított hitelesítéssel.
Ha már minden adat megvan a válaszadáshoz, válaszolj normál szöveggel (<tool_call> nélkül).`;

export function parseToolCallFromResponse(
  text: string
): { name: string; args: Record<string, unknown> } | null {
  const tagMatch = text.match(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/i);
  if (!tagMatch) return null;
  try {
    const parsed = JSON.parse(tagMatch[1]) as { name?: string; args?: Record<string, unknown> };
    if (!parsed?.name) return null;
    return { name: parsed.name, args: parsed.args || {} };
  } catch {
    return null;
  }
}

export async function executeAgentTool(params: {
  agent: Agent;
  toolName: string;
  args: Record<string, unknown>;
  isolationMode: SessionIsolationMode;
}): Promise<{ step: ToolExecutionStep; observation: string }> {
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

    if (toolName === 'web_fetch') {
      if (!agent.webSearchEnabled) throw new Error('Az ágens számára a webes lekérés le van tiltva.');
      const url = String(args.url || '').trim();
      if (!/^https?:\/\//i.test(url)) throw new Error('Csak http/https URL engedélyezett.');
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const html = await res.text();
      const stripped = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 2800);
      appendAuditLog({
        type: 'action',
        sourceAgentId: agent.id,
        sourceAgentName: agent.name,
        message: `Tool web_fetch (${res.status}): ${url}`,
        verifiedExecution: true,
      });
      return {
        step: { tool: 'web_fetch', args: { url }, ok: res.ok, sandboxed: isSandboxed, outputPreview: stripped.slice(0, 180) },
        observation: `HTTP ${res.status}: ${stripped}`,
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

    if (toolName === 'mcp_list_tools') {
      const mcpId = String(args.mcpId || '').trim();
      if (!mcpId) {
        const list = getState().mcpServers.map((m) => `- ${m.id}: ${m.name} (${m.endpointUrl}, status=${m.status})`).join('\n');
        return {
          step: { tool: 'mcp_list_tools', args: {}, ok: true, sandboxed: isSandboxed, outputPreview: 'MCP lista visszaadva' },
          observation: list || 'Nincs regisztrált MCP szerver.',
        };
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

    throw new Error(`Ismeretlen eszköz: ${toolName}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      step: { tool: toolName, args, ok: false, sandboxed: isSandboxed, outputPreview: msg.slice(0, 200) },
      observation: `HIBA (${toolName}): ${msg}`,
    };
  }
}
