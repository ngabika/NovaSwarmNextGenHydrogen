import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import type { McpAuthType, McpServer, McpTransport } from '../../shared/types';
import {
  appendAuditLog,
  getMcpCredentialSecret,
  getState,
  setMcpCredentialSecret,
  updateState,
} from '../state/store';

export interface CatalogTemplate {
  name: string;
  description: string;
  endpointUrl: string;
  authType: McpAuthType;
  transport?: McpTransport;
  command?: string;
  args?: string[];
  kind: 'mcp' | 'skill';
  code?: string;
}

export function registerMcpServer(input: {
  name: string;
  description: string;
  endpointUrl?: string;
  transport?: McpTransport;
  command?: string;
  args?: string[];
  authType: McpAuthType;
}): McpServer {
  const transport: McpTransport = input.transport || 'http';
  const server: McpServer = {
    id: `mcp-${crypto.randomUUID().slice(0, 8)}`,
    name: input.name.trim(),
    description: input.description.trim(),
    endpointUrl: (input.endpointUrl || (transport === 'stdio' ? `stdio://${input.command || ''}` : '')).trim(),
    transport,
    command: input.command?.trim() || undefined,
    args: Array.isArray(input.args) ? input.args.map((a) => String(a).trim()).filter(Boolean) : undefined,
    authType: input.authType,
    hasCredentials: false,
    oauthConfigured: false,
    status: input.authType === 'oauth2' ? 'not_configured' : 'untested',
    lastCheckedAt: null,
    lastCheckMessage:
      input.authType === 'oauth2'
        ? 'Nincs bekötve — OAuth2 hitelesítés szükséges'
        : 'Még nem tesztelve — kattints a Kapcsolat tesztelése gombra',
  };

  updateState((s) => {
    s.mcpServers.push(server);
  });

  appendAuditLog({
    type: 'system',
    sourceAgentId: 'mcp-manager',
    sourceAgentName: 'MCP Kezelő',
    message: `MCP szerver regisztrálva (${transport}): ${server.name} (${transport === 'stdio' ? `${server.command} ${(server.args || []).join(' ')}` : server.endpointUrl})`,
  });

  return server;
}

export function updateMcpCredentials(
  mcpId: string,
  creds: Record<string, string>
): McpServer | null {
  setMcpCredentialSecret(mcpId, creds);
  let updated: McpServer | null = null;
  updateState((s) => {
    const srv = s.mcpServers.find((m) => m.id === mcpId);
    if (!srv) return;
    srv.hasCredentials = Object.values(creds).some((v) => v.trim().length > 0);
    if (srv.authType === 'oauth2') {
      srv.oauthConfigured = Boolean(creds.accessToken || creds.refreshToken);
      if (!srv.oauthConfigured) {
        srv.status = 'not_configured';
        srv.lastCheckMessage = 'Nincs bekötve — OAuth2 token hiányzik';
      }
    }
    updated = srv;
  });
  return updated;
}

/**
 * M20: Execute a short-lived stdio JSON-RPC 2.0 session (initialize -> request) with 6s timeout.
 */
async function invokeStdioJsonRpc(
  command: string,
  args: string[],
  method: string,
  params: Record<string, unknown>,
  envOverrides?: Record<string, string>
): Promise<{ result?: unknown; error?: { message?: string } }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...(envOverrides || {}) },
    });

    let stdoutBuf = '';
    let stderrBuf = '';
    let finished = false;
    const targetId = 2;

    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        try {
          child.kill('SIGTERM');
        } catch {
          // ignore
        }
        reject(new Error(`stdio MCP időtúllépés (6s) — ${command}`));
      }
    }, 6000);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString('utf8');
      const lines = stdoutBuf.split('\n');
      stdoutBuf = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed) as { id?: number; result?: unknown; error?: { message?: string } };
          if (msg.id === targetId && !finished) {
            finished = true;
            clearTimeout(timer);
            try {
              child.kill('SIGTERM');
            } catch {
              // ignore
            }
            resolve(msg);
            return;
          }
        } catch {
          // ignore non-JSON log lines
        }
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString('utf8');
    });

    child.on('error', (err) => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        reject(new Error(`stdio MCP indítási hiba (${command}): ${err.message}`));
      }
    });

    child.on('exit', (code) => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        reject(new Error(`stdio MCP folyamat kilépett (code=${code}): ${stderrBuf.slice(0, 200)}`));
      }
    });

    const initMsg = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'novaswarm', version: '2.0.0' } },
    });
    const notifyMsg = JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
    const reqMsg = JSON.stringify({ jsonrpc: '2.0', id: targetId, method, params });

    child.stdin?.write(`${initMsg}\n${notifyMsg}\n${reqMsg}\n`);
  });
}

/**
 * REAL network / stdio connection probe.
 */
export async function testMcpConnection(mcpId: string): Promise<McpServer> {
  const state = getState();
  const srv = state.mcpServers.find((m) => m.id === mcpId);
  if (!srv) {
    throw new Error(`MCP szerver nem található: ${mcpId}`);
  }

  const creds = getMcpCredentialSecret(mcpId);
  if (srv.authType === 'oauth2' && !srv.oauthConfigured && !creds?.accessToken) {
    updateState((s) => {
      const target = s.mcpServers.find((m) => m.id === mcpId);
      if (target) {
        target.status = 'not_configured';
        target.lastCheckedAt = new Date().toISOString();
        target.lastCheckMessage = 'Nincs bekötve — érvényes OAuth2 hozzáférési token szükséges';
      }
    });
    return getState().mcpServers.find((m) => m.id === mcpId)!;
  }

  const now = new Date().toISOString();

  if (srv.transport === 'stdio') {
    if (!srv.command?.trim()) {
      updateState((s) => {
        const target = s.mcpServers.find((m) => m.id === mcpId);
        if (target) {
          target.status = 'error';
          target.lastCheckedAt = now;
          target.lastCheckMessage = 'Hiányzó stdio parancs';
        }
      });
      return getState().mcpServers.find((m) => m.id === mcpId)!;
    }

    try {
      const resp = await invokeStdioJsonRpc(srv.command, srv.args || [], 'tools/list', {}, creds || undefined);
      const ok = !resp.error;
      updateState((s) => {
        const target = s.mcpServers.find((m) => m.id === mcpId);
        if (target) {
          target.status = ok ? 'connected' : 'error';
          target.lastCheckedAt = now;
          target.lastCheckMessage = ok
            ? `Valós stdio JSON-RPC kapcsolat rendben (${srv.command})`
            : `stdio hiba: ${resp.error?.message}`;
        }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      updateState((s) => {
        const target = s.mcpServers.find((m) => m.id === mcpId);
        if (target) {
          target.status = 'disconnected';
          target.lastCheckedAt = now;
          target.lastCheckMessage = msg;
        }
      });
    }
  } else {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (srv.authType === 'apikey' && creds?.apiKey) {
      headers['Authorization'] = `Bearer ${creds.apiKey}`;
    } else if (srv.authType === 'basic' && creds?.username) {
      const token = Buffer.from(`${creds.username}:${creds.password || ''}`).toString('base64');
      headers['Authorization'] = `Basic ${token}`;
    } else if (srv.authType === 'oauth2' && creds?.accessToken) {
      headers['Authorization'] = `Bearer ${creds.accessToken}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(srv.endpointUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      clearTimeout(timer);

      const isOk = res.ok;
      updateState((s) => {
        const target = s.mcpServers.find((m) => m.id === mcpId);
        if (target) {
          target.status = isOk ? 'connected' : 'error';
          target.lastCheckedAt = now;
          target.lastCheckMessage = isOk
            ? `Valós kapcsolat rendben (HTTP ${res.status})`
            : `Sikertelen válasz (HTTP ${res.status} ${res.statusText})`;
        }
      });
    } catch (err) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : String(err);
      updateState((s) => {
        const target = s.mcpServers.find((m) => m.id === mcpId);
        if (target) {
          target.status = 'disconnected';
          target.lastCheckedAt = now;
          target.lastCheckMessage = `Hálózati hiba: ${msg}`;
        }
      });
    }
  }

  const finalSrv = getState().mcpServers.find((m) => m.id === mcpId)!;
  appendAuditLog({
    type: 'system',
    sourceAgentId: 'mcp-manager',
    sourceAgentName: 'MCP Kezelő',
    message: `MCP kapcsolat teszt (${finalSrv.name}): ${finalSrv.status} — ${finalSrv.lastCheckMessage}`,
    verifiedExecution: true,
  });

  return finalSrv;
}

export async function fetchExternalCatalog(catalogUrl: string): Promise<CatalogTemplate[]> {
  const res = await fetch(catalogUrl, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) {
    throw new Error(`Külső katalógus lekérése sikertelen: HTTP ${res.status}`);
  }
  const json = (await res.json()) as { items?: CatalogTemplate[] } | CatalogTemplate[];
  const items = Array.isArray(json) ? json : json.items ?? [];
  return items.filter(
    (item) => item && typeof item.name === 'string' && (typeof item.endpointUrl === 'string' || typeof item.command === 'string')
  );
}

export function buildGoogleOAuthUrl(redirectUri: string): { configured: boolean; url: string | null; reason?: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    return {
      configured: false,
      url: null,
      reason: 'Nincs konfigurálva GOOGLE_CLIENT_ID a szerver környezetben (.env). Valós OAuth2 hitelesítéshez add meg a Google Cloud OAuth2 kliens adatait.',
    };
  }
  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/photoslibrary.readonly',
  ].join(' ');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
  });
  return {
    configured: true,
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  };
}

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

function buildMcpAuthHeaders(srv: McpServer, creds: Record<string, string> | null): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (srv.authType === 'apikey' && creds?.apiKey) {
    headers['Authorization'] = `Bearer ${creds.apiKey}`;
  } else if (srv.authType === 'basic' && creds?.username) {
    const token = Buffer.from(`${creds.username}:${creds.password || ''}`).toString('base64');
    headers['Authorization'] = `Basic ${token}`;
  } else if (srv.authType === 'oauth2' && creds?.accessToken) {
    headers['Authorization'] = `Bearer ${creds.accessToken}`;
  }
  return headers;
}

/**
 * Queries a registered MCP HTTP or stdio JSON-RPC 2.0 server for available tools (`tools/list`).
 */
export async function listMcpTools(
  mcpId: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ mcpId: string; mcpName: string; tools: McpToolInfo[]; raw?: unknown }> {
  const state = getState();
  const srv = state.mcpServers.find((m) => m.id === mcpId);
  if (!srv) throw new Error(`MCP szerver nem található: ${mcpId}`);

  const creds = getMcpCredentialSecret(mcpId);

  if (srv.transport === 'stdio') {
    if (!srv.command?.trim()) throw new Error(`MCP stdio parancs hiányzik (${srv.name}).`);
    const data = (await invokeStdioJsonRpc(srv.command, srv.args || [], 'tools/list', {}, creds || undefined)) as {
      result?: { tools?: McpToolInfo[] };
      error?: { message?: string };
    };
    if (data.error?.message) throw new Error(`MCP stdio hiba (${srv.name}): ${data.error.message}`);
    const tools = data.result?.tools ?? [];
    return { mcpId: srv.id, mcpName: srv.name, tools: Array.isArray(tools) ? tools : [], raw: data };
  }

  const headers = buildMcpAuthHeaders(srv, creds);
  const res = await fetchImpl(srv.endpointUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) {
    throw new Error(`MCP tools/list sikertelen (${srv.name}): HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    result?: { tools?: McpToolInfo[] };
    tools?: McpToolInfo[];
    error?: { message?: string };
  };
  if (data.error?.message) {
    throw new Error(`MCP hiba (${srv.name}): ${data.error.message}`);
  }
  const tools = data.result?.tools ?? data.tools ?? [];
  return {
    mcpId: srv.id,
    mcpName: srv.name,
    tools: Array.isArray(tools) ? tools : [],
    raw: data,
  };
}

/**
 * Invokes an MCP tool (`tools/call`) via HTTP JSON-RPC 2.0 or stdio child process.
 */
export async function callMcpTool(
  mcpId: string,
  toolName: string,
  args: Record<string, unknown> = {},
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: boolean; output: string; raw?: unknown }> {
  const state = getState();
  const srv = state.mcpServers.find((m) => m.id === mcpId);
  if (!srv) throw new Error(`MCP szerver nem található: ${mcpId}`);
  if (!toolName.trim()) throw new Error('MCP toolName kötelező.');

  const creds = getMcpCredentialSecret(mcpId);

  let data: {
    result?: { content?: Array<{ type?: string; text?: string }>; isError?: boolean } | unknown;
    error?: { message?: string };
  };

  if (srv.transport === 'stdio') {
    if (!srv.command?.trim()) throw new Error(`MCP stdio parancs hiányzik (${srv.name}).`);
    data = (await invokeStdioJsonRpc(
      srv.command,
      srv.args || [],
      'tools/call',
      { name: toolName.trim(), arguments: args },
      creds || undefined
    )) as typeof data;
  } else {
    const headers = buildMcpAuthHeaders(srv, creds);
    const res = await fetchImpl(srv.endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: toolName.trim(), arguments: args },
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      throw new Error(`MCP tools/call sikertelen (${srv.name}/${toolName}): HTTP ${res.status}`);
    }
    data = (await res.json()) as typeof data;
  }

  if (data.error?.message) {
    return { ok: false, output: `MCP hiba: ${data.error.message}`, raw: data };
  }

  const resObj = data.result as { content?: Array<{ type?: string; text?: string }>; isError?: boolean } | undefined;
  let output = '';
  if (resObj && Array.isArray(resObj.content)) {
    output = resObj.content
      .map((c) => (typeof c.text === 'string' ? c.text : JSON.stringify(c)))
      .join('\n');
  } else {
    output = JSON.stringify(data.result ?? data);
  }

  const ok = !resObj?.isError;
  appendAuditLog({
    type: 'action',
    sourceAgentId: 'mcp-manager',
    sourceAgentName: 'MCP Eszköz Hívás',
    message: `MCP [${srv.name}] -> ${toolName}: ${ok ? 'OK' : 'ERR'} (${output.slice(0, 100)})`,
    verifiedExecution: true,
  });

  return { ok, output, raw: data };
}

