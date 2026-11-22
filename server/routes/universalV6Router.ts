import express from 'express';
import type { AutonomyRule, MacroStepKind, SmartReminder } from '../../shared/types';
import { getState, updateState } from '../state/store';
import {
  createAutonomyRule,
  createQuickMacro,
  createSmartReminder,
  dispatchSwarmMeshTask,
  evaluateAutonomyRules,
  executeQuickMacro,
  processDueSmartReminders,
  runDockerWatchtowerHeal,
  runForensicSystemSnapshot,
  runLanSentinelAndSpeedtest,
  trustLanMacAddress,
} from '../power/batch6ApexEngine';

export function createUniversalV6Router(broadcastEvent: (type: string, payload?: unknown) => void): express.Router {
  const router = express.Router();

  // 1. Event-Action Autonomy Rules ("Ha ez történik -> Csináld ezt")
  router.get('/rules', (_req, res) => {
    res.json({ rules: getState().autonomyRules || [] });
  });

  router.post('/rules', (req, res) => {
    try {
      const body = req.body as {
        name: string;
        triggerKind: AutonomyRule['triggerKind'];
        thresholdValue: number;
        actionKind: AutonomyRule['actionKind'];
        actionTarget: string;
        cooldownMinutes?: number;
      };
      const rule = createAutonomyRule(body);
      broadcastEvent('state:updated');
      res.json({ ok: true, rule });
    } catch (err) {
      res.status(400).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.patch('/rules/:id', (req, res) => {
    const { enabled } = req.body as { enabled?: boolean };
    updateState((s) => {
      s.autonomyRules = (s.autonomyRules || []).map((r) =>
        r.id === req.params.id && typeof enabled === 'boolean' ? { ...r, enabled } : r
      );
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.delete('/rules/:id', (req, res) => {
    updateState((s) => {
      s.autonomyRules = (s.autonomyRules || []).filter((r) => r.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.post('/rules/evaluate', async (req, res) => {
    try {
      const body = req.body as { manualTrigger?: boolean } | undefined;
      const out = await evaluateAutonomyRules(body?.manualTrigger ? { manualTrigger: true } : undefined);
      broadcastEvent('state:updated');
      res.json({ ok: true, ...out });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 2. Multi-Node Swarm Mesh Task Offload
  router.post('/mesh/dispatch', async (req, res) => {
    try {
      const body = req.body as { prompt: string; preferredRole?: 'gpu_ollama' | 'worker' | 'desktop' | 'vps' | 'pi' | 'storage' };
      const record = await dispatchSwarmMeshTask(body);
      broadcastEvent('state:updated');
      res.json({ ok: true, record });
    } catch (err) {
      res.status(400).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 3. Docker Watchtower Auto-Healer
  router.post('/docker/heal', async (req, res) => {
    try {
      const { autoRestartExited = true } = (req.body || {}) as { autoRestartExited?: boolean };
      const out = await runDockerWatchtowerHeal({ autoRestartExited });
      broadcastEvent('state:updated');
      res.json({ ok: true, ...out });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 4. LAN Network Sentinel & Live Internet Speedtest
  router.post('/network/sentinel', async (req, res) => {
    try {
      const { runSpeedtest = true } = (req.body || {}) as { runSpeedtest?: boolean };
      const out = await runLanSentinelAndSpeedtest({ runSpeedtest });
      broadcastEvent('state:updated');
      res.json({ ok: true, ...out });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post('/network/trust-mac', (req, res) => {
    try {
      const { mac, label } = req.body as { mac: string; label?: string };
      const out = trustLanMacAddress(mac, label);
      broadcastEvent('state:updated');
      res.json(out);
    } catch (err) {
      res.status(400).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 5. Forensic Root-Cause Snapshot
  router.post('/forensic/run', (_req, res) => {
    const report = runForensicSystemSnapshot();
    broadcastEvent('state:updated');
    res.json({ ok: true, report });
  });

  // 6. Smart Reminders
  router.get('/reminders', (_req, res) => {
    res.json({ reminders: getState().smartReminders || [] });
  });

  router.post('/reminders', (req, res) => {
    try {
      const body = req.body as { timeExpr: string; message: string; channel?: SmartReminder['channel'] };
      const reminder = createSmartReminder(body);
      broadcastEvent('state:updated');
      res.json({ ok: true, reminder });
    } catch (err) {
      res.status(400).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post('/reminders/process', async (_req, res) => {
    const out = await processDueSmartReminders();
    broadcastEvent('state:updated');
    res.json({ ok: true, ...out });
  });

  router.delete('/reminders/:id', (req, res) => {
    updateState((s) => {
      s.smartReminders = (s.smartReminders || []).filter((r) => r.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  // 7. 1-Tap Quick Macros
  router.get('/macros', (_req, res) => {
    res.json({ macros: getState().quickMacros || [] });
  });

  router.post('/macros', (req, res) => {
    try {
      const body = req.body as { slug: string; name: string; description: string; steps: MacroStepKind[] };
      const macro = createQuickMacro(body);
      broadcastEvent('state:updated');
      res.json({ ok: true, macro });
    } catch (err) {
      res.status(400).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post('/macros/:idOrSlug/run', async (req, res) => {
    try {
      const out = await executeQuickMacro(req.params.idOrSlug);
      broadcastEvent('state:updated');
      res.json({ ok: true, ...out });
    } catch (err) {
      res.status(400).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
