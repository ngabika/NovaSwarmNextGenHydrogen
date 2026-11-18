import crypto from 'node:crypto';
import type { McpAuthType, McpServer } from '../../shared/types';
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
  kind: 'mcp' | 'skill';
  code?: string;
}

export function registerMcpServer(input: {
  name: string;
  description: string;
  endpointUrl: string;
  authType: McpAuthType;
}): McpServer {
  const server: McpServer = {
    id: `mcp-${crypto.randomUUID().slice(0, 8)}`,
    name: input.name.trim(),
    description: input.description.trim(),
    endpointUrl: input.endpointUrl.trim(),
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
    message: `MCP szerver regisztrálva: ${server.name} (${server.endpointUrl})`,
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
 * REAL network connection probe (Section 3.3 & 12.2).
 * Never uses artificial delays or fake "connected" status — runs a real HTTP probe
 * against the configured endpoint with stored credentials and reports actual result.
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
  const now = new Date().toISOString();

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

/**
 * Fetches an external MCP/skill JSON catalog URL (Section 12.3).
 */
export async function fetchExternalCatalog(catalogUrl: string): Promise<CatalogTemplate[]> {
  const res = await fetch(catalogUrl, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) {
    throw new Error(`Külső katalógus lekérése sikertelen: HTTP ${res.status}`);
  }
  const json = (await res.json()) as { items?: CatalogTemplate[] } | CatalogTemplate[];
  const items = Array.isArray(json) ? json : json.items ?? [];
  return items.filter((item) => item && typeof item.name === 'string' && typeof item.endpointUrl === 'string');
}

/**
 * Generates real Google OAuth2 authorization URL when GOOGLE_CLIENT_ID is configured (Section 12.4).
 */
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
