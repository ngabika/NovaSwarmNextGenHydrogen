import crypto from 'node:crypto';
import express from 'express';
import type {
  Agent,
  KanbanCard,
  KanbanStatus,
  McpAuthType,
  ProviderId,
  Settings,
} from '../../shared/types';
import {
  auditRecentCycle,
  createAgent,
  handleUserTurn,
  SELF_DOCUMENTATION_TEXT,
} from '../agents/engine';
import { runDreamingCycle } from '../dreaming/engine';
import {
  buildGoogleOAuthUrl,
  fetchExternalCatalog,
  registerMcpServer,
  testMcpConnection,
  updateMcpCredentials,
} from '../mcp/manager';
import {
  addPersistentMemory,
  listObsidianNotes,
  searchMemories,
} from '../memory/vectorStore';
import {
  addProviderKey,
  discoverModels,
  invokeWithFailover,
  removeProviderKey,
} from '../providers/router';
import { runDestructiveSandboxProof } from '../sandbox/supervisorSandbox';
import {
  activateKillSwitch,
  assertHostPermission,
  deactivateKillSwitch,
  HostPermissionDeniedError,
  KillSwitchActiveError,
  resolveApproval,
} from '../security/permissionGate';
import {
  applyGuardedSelfModification,
  ForbiddenZoneError,
  getRecentGitHistory,
  SecretLeakDetectedError,
} from '../selfmod/gitGuard';
import { createAndValidateSkill } from '../skills/loader';
import {
  appendAuditLog,
  getState,
  setTelegramTokenSecret,
  updateState,
} from '../state/store';
import {
  checkOtaUpdates,
  collectHardwareMetrics,
  createBackupPoint,
  registerCronTask,
  requestOsPackageUpgrade,
  restoreBackupPoint,
  speakOnHostSpeaker,
} from '../system/ops';
import { processTelegramInput, sendTelegramMessage } from '../telegram/bot';
import {
  closeTerminalSession,
  createTerminalSession,
  listTerminalSessions,
} from '../terminal/ptyManager';

export function createApiRouter(broadcastEvent: (type: string, payload?: unknown) => void): express.Router {
  const router = express.Router();

  const handleErr = (res: express.Response, err: unknown) => {
    if (err instanceof HostPermissionDeniedError || err instanceof KillSwitchActiveError) {
      return res.status(403).json({ error: err.message, code: err.code });
    }
    if (err instanceof ForbiddenZoneError || err instanceof SecretLeakDetectedError) {
      return res.status(403).json({ error: err.message, code: err.code });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(400).json({ error: msg });
  };

  router.get('/state', (_req, res) => {
    const state = getState();
    const hardware = collectHardwareMetrics();
    const terminalSessions = listTerminalSessions();
    res.json({
      state,
      hardware,
      terminalSessions,
    });
  });

  // 6-step Setup Wizard completion (Section 6)
  router.post('/onboarding/complete', async (req, res) => {
    try {
      const body = req.body as {
        language: Settings['language'];
        ollamaOnlyMode: boolean;
        primaryProvider: ProviderId;
        apiKeys?: Partial<Record<ProviderId, string>>;
        telegramToken?: string;
        telegramChatId?: string;
        userProfile: string;
        firstAgent: {
          name: string;
          role: string;
          avatar?: string;
          systemPrompt: string;
          modelId?: string;
          providerId?: ProviderId;
          webSearchEnabled?: boolean;
          hostExecutionEnabled?: boolean;
        };
        hostPermissionsGranted: boolean;
      };

      if (!body.firstAgent?.name?.trim()) {
        return res.status(400).json({ error: 'Az első ágens neve kötelező.' });
      }

      updateState((s) => {
        s.settings.language = body.language || 'hu';
        s.settings.ollamaOnlyMode = Boolean(body.ollamaOnlyMode);
        s.settings.primaryProvider = body.ollamaOnlyMode
          ? 'ollama'
          : body.primaryProvider || 'gemini';
        s.settings.userProfile = (body.userProfile || '').trim();
        s.settings.hostPermissionsGranted = Boolean(body.hostPermissionsGranted);
        s.settings.telegramChatId = (body.telegramChatId || '').trim();
        if (body.telegramToken?.trim()) {
          setTelegramTokenSecret(body.telegramToken.trim());
          s.settings.telegramHasToken = true;
          s.settings.telegramEnabled = Boolean(s.settings.telegramChatId);
        }
        s.settings.onboardingCompleted = true;
      });

      if (body.apiKeys) {
        for (const [prov, key] of Object.entries(body.apiKeys)) {
          if (key && key.trim().length > 4) {
            addProviderKey(prov as ProviderId, key.trim(), 'Kezdő API kulcs');
          }
        }
      }

      // Remove any non-supervisor agents if re-running setup so ONLY the 1st user agent + Supervisor exist
      updateState((s) => {
        s.agents = s.agents.filter((a) => a.isSupervisor);
        s.kanban = [];
      });

      createAgent({
        name: body.firstAgent.name,
        role: body.firstAgent.role || 'Általános Asszisztens',
        avatar: body.firstAgent.avatar || 'bot',
        parentAgentId: null,
        systemPrompt: body.firstAgent.systemPrompt,
        providerId: body.ollamaOnlyMode
          ? 'ollama'
          : body.firstAgent.providerId || body.primaryProvider || 'gemini',
        modelId: body.firstAgent.modelId,
        webSearchEnabled: body.firstAgent.webSearchEnabled ?? true,
        hostExecutionEnabled:
          Boolean(body.hostPermissionsGranted) &&
          (body.firstAgent.hostExecutionEnabled ?? true),
      });

      if (body.userProfile?.trim()) {
        addPersistentMemory({
          content: `Felhasználói bemutatkozás és kommunikációs elvárás: ${body.userProfile.trim()}`,
          entity: 'Felhasználói Profil',
          tags: ['profile', 'preferences'],
          links: ['Kezdő Ágens'],
          importanceScore: 1.0,
        });
      }

      void discoverModels().catch(() => {});
      broadcastEvent('state:updated');
      res.json({ ok: true, state: getState() });
    } catch (err) {
      handleErr(res, err);
    }
  });

  // Autostart bootstrap strictly for automated verification (?autostart=1)
  router.post('/onboarding/autostart', (_req, res) => {
    const state = getState();
    if (!state.settings.onboardingCompleted) {
      updateState((s) => {
        s.settings.onboardingCompleted = true;
        s.settings.hostPermissionsGranted = true;
        s.settings.ollamaOnlyMode = s.settings.providerKeys.gemini.length === 0;
        if (!s.settings.userProfile) {
          s.settings.userProfile = 'Rendszermérnök felhasználó, tömör technikai válaszokat preferál.';
        }
      });
      if (state.agents.filter((a) => !a.isSupervisor).length === 0) {
        createAgent({
          name: 'Központi Asszisztens',
          role: 'Általános Asszisztens',
          systemPrompt: 'Segítőkész, precíz személyi AI asszisztens.',
          hostExecutionEnabled: true,
        });
      }
      broadcastEvent('state:updated');
    }
    res.json({ ok: true, state: getState() });
  });

  router.patch('/settings', (req, res) => {
    try {
      const patch = req.body as Partial<Settings> & { telegramToken?: string };
      updateState((s) => {
        if (patch.language) s.settings.language = patch.language;
        if (typeof patch.hostPermissionsGranted === 'boolean') {
          s.settings.hostPermissionsGranted = patch.hostPermissionsGranted;
        }
        if (typeof patch.userProfile === 'string') s.settings.userProfile = patch.userProfile;
        if (patch.primaryProvider) s.settings.primaryProvider = patch.primaryProvider;
        if (patch.secondaryProvider) s.settings.secondaryProvider = patch.secondaryProvider;
        if (typeof patch.ollamaOnlyMode === 'boolean') s.settings.ollamaOnlyMode = patch.ollamaOnlyMode;
        if (typeof patch.ollamaUrl === 'string') s.settings.ollamaUrl = patch.ollamaUrl;
        if (typeof patch.ollamaModel === 'string') s.settings.ollamaModel = patch.ollamaModel;
        if (patch.manualModelPriority) s.settings.manualModelPriority = patch.manualModelPriority;
        if (typeof patch.dailyCostLimitEnabled === 'boolean') {
          s.settings.dailyCostLimitEnabled = patch.dailyCostLimitEnabled;
        }
        if (typeof patch.dailyCostLimitUsd === 'number' && patch.dailyCostLimitUsd >= 0) {
          s.settings.dailyCostLimitUsd = patch.dailyCostLimitUsd;
        }
        if (typeof patch.dreamingIdleMinutes === 'number' && patch.dreamingIdleMinutes >= 1) {
          s.settings.dreamingIdleMinutes = patch.dreamingIdleMinutes;
        }
        if (typeof patch.thermalThrottleCelsius === 'number') {
          s.settings.thermalThrottleCelsius = patch.thermalThrottleCelsius;
        }
        if (typeof patch.batteryThrottlePercent === 'number') {
          s.settings.batteryThrottlePercent = patch.batteryThrottlePercent;
        }
        if (typeof patch.auditLogMaxEntries === 'number') {
          s.settings.auditLogMaxEntries = Math.max(100, patch.auditLogMaxEntries);
        }
        if (typeof patch.telegramEnabled === 'boolean') s.settings.telegramEnabled = patch.telegramEnabled;
        if (typeof patch.telegramChatId === 'string') s.settings.telegramChatId = patch.telegramChatId;
        if (patch.backupSchedule) s.settings.backupSchedule = patch.backupSchedule;
        if (typeof patch.ttsEnabled === 'boolean') s.settings.ttsEnabled = patch.ttsEnabled;
        if (typeof patch.ttsHostSpeakerEnabled === 'boolean') {
          s.settings.ttsHostSpeakerEnabled = patch.ttsHostSpeakerEnabled;
        }
        if (typeof patch.autoTaskRouting === 'boolean') s.settings.autoTaskRouting = patch.autoTaskRouting;
        if (typeof patch.telegramToken === 'string' && patch.telegramToken.trim()) {
          setTelegramTokenSecret(patch.telegramToken.trim());
          s.settings.telegramHasToken = true;
        }
      });

      appendAuditLog({
        type: 'system',
        sourceAgentId: 'user',
        sourceAgentName: 'Beállítások',
        message: 'Rendszerbeállítások frissítve.',
      });
      broadcastEvent('state:updated');
      res.json({ ok: true, settings: getState().settings });
    } catch (err) {
      handleErr(res, err);
    }
  });

  // Multi-provider key pool & model discovery
  router.post('/providers/keys', (req, res) => {
    try {
      const { provider, rawKey, label } = req.body as {
        provider: ProviderId;
        rawKey: string;
        label?: string;
      };
      if (!provider || !rawKey?.trim()) {
        return res.status(400).json({ error: 'Szolgáltató és API kulcs kötelező.' });
      }
      const entry = addProviderKey(provider, rawKey, label);
      broadcastEvent('state:updated');
      res.json({ ok: true, entry });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.delete('/providers/keys/:provider/:keyId', (req, res) => {
    removeProviderKey(req.params.provider as ProviderId, req.params.keyId);
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.post('/providers/discover', async (_req, res) => {
    try {
      const result = await discoverModels();
      broadcastEvent('state:updated');
      res.json(result);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/providers/test-failover', async (req, res) => {
    try {
      const { prompt } = req.body as { prompt?: string };
      const result = await invokeWithFailover({
        prompt: prompt || 'Válaszolj röviden: Működik a failover router?',
        complexity: 'simple',
      });
      broadcastEvent('state:updated');
      res.json(result);
    } catch (err) {
      handleErr(res, err);
    }
  });

  // Unified Chat & Threads
  router.post('/threads', (req, res) => {
    const { title, folder } = req.body as { title?: string; folder?: string };
    const now = new Date().toISOString();
    const thread = {
      id: `thread-${crypto.randomUUID().slice(0, 8)}`,
      title: (title || 'Új beszélgetés').trim(),
      folder: (folder || 'Általános').trim(),
      createdAt: now,
      updatedAt: now,
    };
    updateState((s) => {
      s.threads.unshift(thread);
    });
    broadcastEvent('state:updated');
    res.json({ thread });
  });

  router.post('/chat/send', async (req, res) => {
    try {
      const { threadId, content, targetAgentId } = req.body as {
        threadId?: string;
        content: string;
        targetAgentId?: string | null;
      };
      if (!content?.trim()) {
        return res.status(400).json({ error: 'Üres üzenet nem küldhető.' });
      }
      const state = getState();
      const targetThread = threadId || state.threads[0]?.id || 'thread-main';
      const result = await handleUserTurn({
        threadId: targetThread,
        content: content.trim(),
        channel: 'web',
        targetAgentId,
      });

      if (state.settings.ttsHostSpeakerEnabled) {
        speakOnHostSpeaker(result.coordinatorReply.content);
      }

      broadcastEvent('state:updated');
      res.json(result);
    } catch (err) {
      handleErr(res, err);
    }
  });

  // Agents & Hierarchy
  router.post('/agents', (req, res) => {
    try {
      const body = req.body as Partial<Agent>;
      if (!body.name?.trim()) {
        return res.status(400).json({ error: 'Az ágens neve kötelező.' });
      }
      const agent = createAgent({
        name: body.name,
        role: body.role || 'Specialista',
        avatar: body.avatar,
        parentAgentId: body.parentAgentId ?? null,
        systemPrompt: body.systemPrompt || 'Autonóm AI specialista ágens.',
        modelId: body.modelId,
        providerId: body.providerId,
        webSearchEnabled: body.webSearchEnabled,
        hostExecutionEnabled: body.hostExecutionEnabled,
      });
      broadcastEvent('state:updated');
      res.json({ agent });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.patch('/agents/:id', (req, res) => {
    const patch = req.body as Partial<Agent>;
    let updated: Agent | null = null;
    updateState((s) => {
      const target = s.agents.find((a) => a.id === req.params.id);
      if (!target) return;
      if (typeof patch.name === 'string') target.name = patch.name.trim();
      if (typeof patch.role === 'string') target.role = patch.role.trim();
      if (patch.parentAgentId !== undefined && !target.isSupervisor) {
        target.parentAgentId = patch.parentAgentId;
      }
      if (typeof patch.systemPrompt === 'string') target.systemPrompt = patch.systemPrompt;
      if (typeof patch.modelId === 'string') target.modelId = patch.modelId;
      if (patch.providerId) target.providerId = patch.providerId;
      if (typeof patch.webSearchEnabled === 'boolean') target.webSearchEnabled = patch.webSearchEnabled;
      if (typeof patch.hostExecutionEnabled === 'boolean') {
        target.hostExecutionEnabled = patch.hostExecutionEnabled;
      }
      if (typeof patch.active === 'boolean' && !target.isSupervisor) target.active = patch.active;
      target.updatedAt = new Date().toISOString();
      updated = target;
    });
    if (!updated) return res.status(404).json({ error: 'Ágens nem található.' });
    broadcastEvent('state:updated');
    res.json({ agent: updated });
  });

  router.delete('/agents/:id', (req, res) => {
    const state = getState();
    const target = state.agents.find((a) => a.id === req.params.id);
    if (!target) return res.status(404).json({ error: 'Ágens nem található.' });
    if (target.isSupervisor) {
      return res.status(403).json({ error: 'Az állandó Felügyelő Auditor ágens nem törölhető.' });
    }
    updateState((s) => {
      s.agents = s.agents.filter((a) => a.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  // Kanban
  router.post('/kanban', (req, res) => {
    const { title, description, status, assignedAgentId } = req.body as Partial<KanbanCard>;
    if (!title?.trim()) return res.status(400).json({ error: 'Kártya címe kötelező.' });
    const now = new Date().toISOString();
    const card: KanbanCard = {
      id: `card-${crypto.randomUUID().slice(0, 8)}`,
      title: title.trim(),
      description: (description || '').trim(),
      status: status || 'todo',
      assignedAgentId: assignedAgentId ?? null,
      createdAt: now,
      updatedAt: now,
    };
    updateState((s) => {
      s.kanban.unshift(card);
    });
    appendAuditLog({
      type: 'kanban',
      sourceAgentId: assignedAgentId || 'user',
      sourceAgentName: 'Kanban',
      message: `Új kártya: ${card.title} [${card.status}]`,
    });
    broadcastEvent('state:updated');
    res.json({ card });
  });

  router.patch('/kanban/:id', (req, res) => {
    const { status, title, description, assignedAgentId } = req.body as {
      status?: KanbanStatus;
      title?: string;
      description?: string;
      assignedAgentId?: string | null;
    };
    let card: KanbanCard | null = null;
    updateState((s) => {
      const target = s.kanban.find((c) => c.id === req.params.id);
      if (!target) return;
      if (status) target.status = status;
      if (typeof title === 'string') target.title = title;
      if (typeof description === 'string') target.description = description;
      if (assignedAgentId !== undefined) target.assignedAgentId = assignedAgentId;
      target.updatedAt = new Date().toISOString();
      card = target;
    });
    if (!card) return res.status(404).json({ error: 'Kanban kártya nem található.' });
    broadcastEvent('state:updated');
    res.json({ card });
  });

  router.delete('/kanban/:id', (req, res) => {
    updateState((s) => {
      s.kanban = s.kanban.filter((c) => c.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  // Memory & Dreaming
  router.post('/memory/search', (req, res) => {
    const { query } = req.body as { query: string };
    const results = searchMemories(query || '', 12);
    res.json({ results });
  });

  router.post('/memory/add', (req, res) => {
    const { content, entity, tags, links } = req.body as {
      content: string;
      entity?: string;
      tags?: string[];
      links?: string[];
    };
    if (!content?.trim()) return res.status(400).json({ error: 'Tartalom kötelező.' });
    const entry = addPersistentMemory({
      content: content.trim(),
      entity: (entity || 'Kézi Jegyzet').trim(),
      tags: tags && tags.length > 0 ? tags : ['memory'],
      links: links || [],
    });
    broadcastEvent('state:updated');
    res.json({ entry });
  });

  router.get('/memory/vault', (_req, res) => {
    res.json({ notes: listObsidianNotes() });
  });

  router.post('/dreaming/run', async (_req, res) => {
    try {
      const hardware = collectHardwareMetrics();
      const outcome = await runDreamingCycle({ hardware, forceRun: true });
      broadcastEvent('state:updated');
      res.json(outcome);
    } catch (err) {
      handleErr(res, err);
    }
  });

  // Supervisor & Sandbox
  router.post('/supervisor/audit', (_req, res) => {
    const report = auditRecentCycle();
    broadcastEvent('state:updated');
    res.json(report);
  });

  router.post('/supervisor/destructive-proof', (_req, res) => {
    const proof = runDestructiveSandboxProof();
    broadcastEvent('state:updated');
    res.json(proof);
  });

  // Skills & MCP
  router.post('/skills', (req, res) => {
    try {
      const { name, description, code, createdByAgentId } = req.body as {
        name: string;
        description: string;
        code: string;
        createdByAgentId?: string;
      };
      if (!name?.trim() || !code?.trim()) {
        return res.status(400).json({ error: 'Skill név és kód kötelező.' });
      }
      const skill = createAndValidateSkill({
        name,
        description: description || '',
        code,
        createdByAgentId: createdByAgentId || 'user',
      });
      broadcastEvent('state:updated');
      res.json({ skill });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/mcp', (req, res) => {
    const { name, description, endpointUrl, authType } = req.body as {
      name: string;
      description?: string;
      endpointUrl: string;
      authType?: McpAuthType;
    };
    if (!name?.trim() || !endpointUrl?.trim()) {
      return res.status(400).json({ error: 'MCP név és végpont URL kötelező.' });
    }
    const server = registerMcpServer({
      name,
      description: description || '',
      endpointUrl,
      authType: authType || 'none',
    });
    broadcastEvent('state:updated');
    res.json({ server });
  });

  router.patch('/mcp/:id/credentials', (req, res) => {
    const creds = req.body as Record<string, string>;
    const updated = updateMcpCredentials(req.params.id, creds);
    if (!updated) return res.status(404).json({ error: 'MCP szerver nem található.' });
    broadcastEvent('state:updated');
    res.json({ server: updated });
  });

  router.post('/mcp/:id/test', async (req, res) => {
    try {
      const server = await testMcpConnection(req.params.id);
      broadcastEvent('state:updated');
      res.json({ server });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/mcp/import-catalog', async (req, res) => {
    try {
      const { catalogUrl } = req.body as { catalogUrl: string };
      if (!catalogUrl?.trim()) return res.status(400).json({ error: 'Katalógus URL kötelező.' });
      const items = await fetchExternalCatalog(catalogUrl.trim());
      res.json({ items });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.get('/mcp/google-oauth-url', (req, res) => {
    const origin = `${req.protocol}://${req.get('host')}`;
    const info = buildGoogleOAuthUrl(`${origin}/api/mcp/google-oauth-callback`);
    res.json(info);
  });

  // Terminal REST endpoints (protected by unified Permission Gate)
  router.get('/terminal/sessions', (_req, res) => {
    res.json({ sessions: listTerminalSessions() });
  });

  router.post('/terminal/sessions', (req, res) => {
    try {
      const { initiator, agentId, cols, rows } = req.body as {
        initiator?: string;
        agentId?: string;
        cols?: number;
        rows?: number;
      };
      const session = createTerminalSession({
        initiator: initiator || 'Felhasználó',
        agentId,
        cols,
        rows,
      });
      broadcastEvent('state:updated');
      res.json({ session });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.delete('/terminal/sessions/:id', (req, res) => {
    closeTerminalSession(req.params.id);
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  // Approvals & Kill Switch
  router.post('/approvals/:id/resolve', (req, res) => {
    const { decision } = req.body as { decision: 'approved' | 'rejected' };
    const resolved = resolveApproval(req.params.id, decision, 'web');
    if (!resolved) return res.status(404).json({ error: 'Függőben lévő kérelem nem található.' });
    broadcastEvent('state:updated');
    res.json({ approval: resolved });
  });

  router.post('/kill-switch', (req, res) => {
    const { active } = req.body as { active: boolean };
    if (active) {
      activateKillSwitch('web');
    } else {
      deactivateKillSwitch();
    }
    broadcastEvent('state:updated');
    res.json({ active: getState().settings.killSwitchActive });
  });

  // Self-modification & Git history
  router.get('/selfmod/history', (_req, res) => {
    res.json({ commits: getRecentGitHistory() });
  });

  router.post('/selfmod/apply', (req, res) => {
    try {
      const { targetPath, newContent, commitMessage, agentId } = req.body as {
        targetPath: string;
        newContent: string;
        commitMessage?: string;
        agentId?: string;
      };
      const result = applyGuardedSelfModification({
        targetPath,
        newContent,
        commitMessage: commitMessage || `feat(selfmod): update ${targetPath}`,
        agentId: agentId || 'user',
      });
      if (result.pendingApproval) {
        void sendTelegramMessage(
          `Érzékeny önmódosítási kérelem: ${targetPath}\nJóváhagyás: /approve ${result.approvalId?.slice(0, 8)}`
        );
      }
      broadcastEvent('state:updated');
      res.json(result);
    } catch (err) {
      handleErr(res, err);
    }
  });

  // System Backups, OS Upgrade, OTA, Docs, Cron, Telegram Command Tester
  router.post('/system/backup', (_req, res) => {
    const point = createBackupPoint();
    broadcastEvent('state:updated');
    res.json({ backup: point });
  });

  router.post('/system/restore/:id', (req, res) => {
    const ok = restoreBackupPoint(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Mentési pont nem található.' });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.post('/system/os-upgrade', (_req, res) => {
    try {
      const queued = requestOsPackageUpgrade('Web UI');
      void sendTelegramMessage(
        `OS csomagfrissítés jóváhagyásra vár: ${queued.command}\nJóváhagyás: /approve ${queued.queuedApprovalId.slice(0, 8)}`
      );
      broadcastEvent('state:updated');
      res.json(queued);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.get('/system/ota', async (_req, res) => {
    const status = await checkOtaUpdates();
    res.json(status);
  });

  router.get('/system/docs', (_req, res) => {
    res.json({ documentation: SELF_DOCUMENTATION_TEXT });
  });

  router.post('/cron', (req, res) => {
    const { name, cronExpression, prompt, targetAgentId } = req.body as {
      name: string;
      cronExpression: string;
      prompt: string;
      targetAgentId?: string;
    };
    if (!name?.trim() || !cronExpression?.trim() || !prompt?.trim()) {
      return res.status(400).json({ error: 'Név, cron kifejezés és feladat prompt kötelező.' });
    }
    const task = {
      id: `cron-${crypto.randomUUID().slice(0, 8)}`,
      name: name.trim(),
      cronExpression: cronExpression.trim(),
      prompt: prompt.trim(),
      targetAgentId: targetAgentId || getState().agents.find((a) => !a.isSupervisor)?.id || '',
      enabled: true,
      lastRunAt: null,
      lastResult: null,
    };
    updateState((s) => {
      s.cronTasks.push(task);
    });
    registerCronTask(task, async (t) => {
      const state = getState();
      if (state.settings.killSwitchActive) return;
      const turn = await handleUserTurn({
        threadId: state.threads[0]?.id || 'thread-main',
        content: `[Cron: ${t.name}] ${t.prompt}`,
        channel: 'web',
        targetAgentId: t.targetAgentId,
      });
      updateState((s) => {
        const ref = s.cronTasks.find((c) => c.id === t.id);
        if (ref) {
          ref.lastRunAt = new Date().toISOString();
          ref.lastResult = turn.coordinatorReply.content.slice(0, 200);
        }
      });
      broadcastEvent('state:updated');
    });
    broadcastEvent('state:updated');
    res.json({ task });
  });

  router.delete('/cron/:id', (req, res) => {
    updateState((s) => {
      s.cronTasks = s.cronTasks.filter((c) => c.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.post('/telegram/command', async (req, res) => {
    try {
      const { text } = req.body as { text: string };
      if (!text?.trim()) return res.status(400).json({ error: 'Parancs vagy szöveg kötelező.' });
      const reply = await processTelegramInput(text);
      broadcastEvent('state:updated');
      res.json({ reply });
    } catch (err) {
      handleErr(res, err);
    }
  });

  // Simple local permission-guarded file test endpoint for diagnostics
  router.get('/host/check-access', (_req, res) => {
    try {
      assertHostPermission('host_access_check');
      res.json({ granted: true });
    } catch (err) {
      handleErr(res, err);
    }
  });

  return router;
}
