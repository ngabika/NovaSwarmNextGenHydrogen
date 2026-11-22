import express from 'express';
import {
  executeSshHostMigration,
  scheduleLocalHostCutoverDecommission,
  testSshMigrationTarget,
} from '../infra/sshHostMigrator';
import {
  addVisualWatchItem,
  buildProactiveBrief,
  captureCameraSnapshot,
  captureWebScreenshotOrDom,
  createAndSelfTestDynamicTool,
  printDocumentViaCups,
  readOrWriteGpioPin,
  runEmailInboxTriage,
  runSelfHealingDaemonTick,
  runVisualWatchCheck,
  speakHostSpeakerAnnouncement,
} from '../power/batch5AutonomyEngine';
import { getState, updateState } from '../state/store';
import {
  applyHardwareAdaptiveOptimization,
  detectHardwareProfile,
  getTelemetryBufferStatus,
  routeTaskModelHybrid,
  runRamOomWatchdogTick,
} from '../system/hardwareOptimizer';
import { collectHardwareMetrics } from '../system/ops';
import { sendTelegramMessage, sendTelegramPhoto, stopTelegramPolling } from '../telegram/bot';

export function createUniversalV5Router(
  broadcastEvent: (type: string, payload?: unknown) => void
): express.Router {
  const router = express.Router();

  const handleErr = (res: express.Response, err: unknown) => {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  };

  // Hardware-Adaptive Auto-Profiler & Dynamic Optimization
  router.get('/hardware-profile', (_req, res) => {
    const profile = detectHardwareProfile();
    const hw = collectHardwareMetrics();
    res.json({
      profile,
      hwMetrics: hw,
      telemetryBuffer: getTelemetryBufferStatus(),
      settings: getState().settings,
    });
  });

  router.post('/hardware-profile/apply', (_req, res) => {
    try {
      const out = applyHardwareAdaptiveOptimization(true);
      broadcastEvent('state:updated');
      res.json({ ok: true, ...out, settings: getState().settings });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/ram-watchdog/run', async (_req, res) => {
    try {
      const out = await runRamOomWatchdogTick();
      broadcastEvent('state:updated');
      res.json(out);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/hybrid-route/preview', (req, res) => {
    const { prompt, complexity } = req.body as { prompt?: string; complexity?: 'simple' | 'complex' };
    res.json(routeTaskModelHybrid(prompt || '', complexity === 'complex' ? 'complex' : 'simple'));
  });

  // 1-Shot SSH Host Migration ("Költöztető")
  router.post('/migrate/test', async (req, res) => {
    try {
      const out = await testSshMigrationTarget(req.body || {});
      res.status(out.ok ? 200 : 400).json(out);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/migrate/start', async (req, res) => {
    try {
      const record = await executeSshHostMigration(req.body || {}, {
        onStopOldHost: async (target) => {
          await sendTelegramMessage(
            `NovaSwarm átköltöztetve az új gépre: http://${target.targetIp}:${target.targetAppPort}\nOnnantól kezdve csak az új gép fut — a régi példány leáll.`
          ).catch(() => {});
          scheduleLocalHostCutoverDecommission(stopTelegramPolling);
        },
      });
      broadcastEvent('state:updated');
      res.status(record.status === 'completed' ? 200 : 500).json({ record });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.get('/migrate/status', (_req, res) => {
    res.json({ record: getState().settings.lastMigrationRecord || null });
  });

  // Headless Screenshot & Visual Page Change Detector
  router.post('/screenshot', async (req, res) => {
    try {
      const { url, sendTelegram } = req.body as { url: string; sendTelegram?: boolean };
      const cap = await captureWebScreenshotOrDom(url || '');
      if (cap.ok && sendTelegram && cap.screenshotBase64) {
        await sendTelegramPhoto(Buffer.from(cap.screenshotBase64, 'base64'), `Web Képernyőkép: ${cap.url}`);
      }
      res.json(cap);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.get('/visual-watch', (_req, res) => {
    res.json({ items: getState().visualWatchItems || [] });
  });

  router.post('/visual-watch', (req, res) => {
    try {
      const { name, url } = req.body as { name?: string; url: string };
      const item = addVisualWatchItem({ name: name || '', url: url || '' });
      broadcastEvent('state:updated');
      res.json({ item });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/visual-watch/check', async (req, res) => {
    try {
      const { id } = (req.body || {}) as { id?: string };
      const out = await runVisualWatchCheck(id);
      for (const ch of out.changedItems) {
        await sendTelegramMessage(`Vizuális oldalváltozás észlelve: ${ch.name} (${ch.url})`).catch(() => {});
      }
      broadcastEvent('state:updated');
      res.json(out);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.delete('/visual-watch/:id', (req, res) => {
    updateState((s) => {
      s.visualWatchItems = (s.visualWatchItems || []).filter((i) => i.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  // Physical World: Camera, GPIO, CUPS Printer & LAN Speaker
  router.post('/camera/capture', async (req, res) => {
    try {
      const { devicePath, sendTelegram } = (req.body || {}) as { devicePath?: string; sendTelegram?: boolean };
      const out = captureCameraSnapshot(devicePath || '/dev/video0');
      if (out.ok && sendTelegram && out.imageBase64) {
        await sendTelegramPhoto(Buffer.from(out.imageBase64, 'base64'), `Kamera pillanatkép (${out.toolUsed})`);
      }
      res.json(out);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/gpio/read', (req, res) => {
    try {
      const { pin } = req.body as { pin: number };
      res.json(readOrWriteGpioPin('read', Number(pin)));
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/gpio/set', (req, res) => {
    try {
      const { pin, value } = req.body as { pin: number; value: 0 | 1 };
      const out = readOrWriteGpioPin('set', Number(pin), Number(value) === 1 ? 1 : 0);
      broadcastEvent('state:updated');
      res.json(out);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/print', (req, res) => {
    try {
      const { textContent, filePath, printerName } = req.body as {
        textContent?: string;
        filePath?: string;
        printerName?: string;
      };
      res.json(printDocumentViaCups({ textContent, filePath, printerName }));
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/speak', (req, res) => {
    try {
      const { text } = req.body as { text: string };
      res.json(speakHostSpeakerAnnouncement(text || ''));
    } catch (err) {
      handleErr(res, err);
    }
  });

  // Proactive "Second Self" & Self-Testing Dynamic Tool
  router.post('/proactive/brief', async (req, res) => {
    try {
      const { period, sendTelegram } = (req.body || {}) as {
        period?: 'morning' | 'evening';
        sendTelegram?: boolean;
      };
      const brief = await buildProactiveBrief(period === 'evening' ? 'evening' : 'morning');
      if (sendTelegram) {
        await sendTelegramMessage(brief.text).catch(() => {});
      }
      broadcastEvent('state:updated');
      res.json(brief);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/proactive/inbox-triage', (_req, res) => {
    try {
      const out = runEmailInboxTriage();
      broadcastEvent('state:updated');
      res.json(out);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/proactive/self-heal', async (_req, res) => {
    try {
      const out = await runSelfHealingDaemonTick();
      broadcastEvent('state:updated');
      res.json(out);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/tools/selftest', async (req, res) => {
    try {
      const { name, description, kind, targetOrCode, testInput } = req.body as {
        name: string;
        description?: string;
        kind: 'http_get' | 'http_post' | 'sandbox_js';
        targetOrCode: string;
        testInput?: Record<string, unknown>;
      };
      const out = await createAndSelfTestDynamicTool({
        name: name || '',
        description: description || '',
        kind: kind || 'sandbox_js',
        targetOrCode: targetOrCode || '',
        testInput,
      });
      broadcastEvent('state:updated');
      res.json(out);
    } catch (err) {
      handleErr(res, err);
    }
  });

  return router;
}
