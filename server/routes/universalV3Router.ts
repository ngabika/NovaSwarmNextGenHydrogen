import crypto from 'node:crypto';
import express from 'express';
import {
  generateWeeklyTimeCapsule,
  rewindThreadToMessage,
  runNightShiftCycle,
  runRedTeamCritique,
} from '../agents/engine';
import {
  addWolDevice,
  auditSecretFilePermissions,
  createPhoenixSnapshot,
  generateWireGuardClientBundle,
  inspectDomainOsint,
  inspectSshAuthLogs,
  pingClusterNodes,
  registerClusterNode,
  runNetworkSpeedtest,
  scanLanArpTable,
  sendWakeOnLanPacket,
} from '../infra/networkAndCluster';
import {
  auditDockerfileContent,
  buildOpenApiSpec,
  evaluateRegexAndCron,
  generateGitChangelog,
  generateSqlErMermaid,
  runCveVulnerabilityScan,
  runHttpLoadTest,
  runUiSeoAudit,
  scanRepoXRay,
} from '../power/devOpsStudio';
import {
  addCrmContact,
  addHomeInventoryItem,
  addMealAndSyncShoppingList,
  addPackageOrder,
  addVehicleMaintenanceItem,
  archiveBookmarkUrl,
  batchRenameFiles,
  checkWcagContrast,
  computeVatAndCompound,
  convertCurrencyLive,
  createSharedPortalLink,
  generateChartSvg,
  generateQrSvg,
  logNotaryAudit,
  searchAcademicPapers,
  stripImageMetadataBase64,
  transformTextUtility,
  upsertBudgetEnvelope,
  wrangleStructuredData,
} from '../power/lifeAndFinanceStudio';
import {
  generateTotpSecret,
  notarizeDocumentHash,
  verifyNotarizedHash,
  verifyTotpCode,
} from '../security/egressAndCrypto';
import { getSqliteWalStatus, queryWalAuditLogs } from '../state/sqliteWal';
import {
  getState,
  pruneRetentionData,
  updateState,
  verifyAuditLogChain,
} from '../state/store';

export function createUniversalV3Router(
  broadcastEvent: (type: string, payload?: unknown) => void
): express.Router {
  const router = express.Router();

  // M61 + M117 + M156: SQLite WAL, Audit Hash-Chain Verify, Retention Prune
  router.get('/sqlite-wal/status', (_req, res) => {
    res.json({
      wal: getSqliteWalStatus(),
      recentWalLogs: queryWalAuditLogs(25),
      auditChain: verifyAuditLogChain(),
    });
  });

  router.post('/audit/verify', (_req, res) => {
    res.json(verifyAuditLogChain());
  });

  router.post('/retention/prune', (_req, res) => {
    const out = pruneRetentionData();
    broadcastEvent('state:updated');
    res.json(out);
  });

  // Ú61, Ú63, Ú64, Ú157: Autonomy NextGen (Night Shift, Red-Team, Rewind, Time Capsule)
  router.post('/nightshift/run', async (_req, res) => {
    try {
      const run = await runNightShiftCycle();
      broadcastEvent('state:updated');
      res.json({ run });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post('/chat/redteam', async (req, res) => {
    try {
      const { threadId, targetMessageId } = req.body as { threadId: string; targetMessageId: string };
      const out = await runRedTeamCritique({ threadId, targetMessageId });
      broadcastEvent('state:updated');
      res.json(out);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post('/chat/rewind', (req, res) => {
    const { threadId, messageId } = req.body as { threadId: string; messageId: string };
    const out = rewindThreadToMessage(threadId, messageId);
    broadcastEvent('state:updated');
    res.json(out);
  });

  router.post('/time-capsule/generate', (_req, res) => {
    const capsule = generateWeeklyTimeCapsule();
    broadcastEvent('state:updated');
    res.json({ capsule });
  });

  // Ú72, Ú75..Ú80, Ú134, M144: DevOps Studio
  router.get('/devops/xray', (req, res) => {
    res.json(scanRepoXRay(String(req.query.dir || '')));
  });

  router.post('/cve-scan', async (_req, res) => {
    const scan = await runCveVulnerabilityScan();
    broadcastEvent('state:updated');
    res.json(scan);
  });

  router.post('/regex-cron', (req, res) => {
    res.json(evaluateRegexAndCron(req.body || {}));
  });

  router.post('/sql-er', (req, res) => {
    res.json(generateSqlErMermaid(String(req.body?.sql || '')));
  });

  router.post('/loadtest', async (req, res) => {
    const { url, totalRequests, concurrency, method } = req.body as {
      url: string;
      totalRequests?: number;
      concurrency?: number;
      method?: 'GET' | 'POST';
    };
    res.json(await runHttpLoadTest({ url, totalRequests, concurrency, method }));
  });

  router.get('/changelog', (req, res) => {
    res.json(generateGitChangelog(Number(req.query.limit || 30)));
  });

  router.post('/dockerfile-audit', (req, res) => {
    res.json(auditDockerfileContent(String(req.body?.content || '')));
  });

  router.post('/ui-seo-audit', async (req, res) => {
    res.json(await runUiSeoAudit(String(req.body?.url || '')));
  });

  router.get('/openapi.json', (_req, res) => {
    res.json(buildOpenApiSpec());
  });

  // Ú83, Ú87..Ú90, Ú131, Ú136, Ú150: Data, Media & Design Studio
  router.post('/data-wrangle', (req, res) => {
    res.json(wrangleStructuredData(req.body || { raw: '', format: 'json' }));
  });

  router.post('/chart-svg', (req, res) => {
    const { type, title, labels, values } = req.body as {
      type?: 'bar' | 'line' | 'pie';
      title?: string;
      labels?: string[];
      values?: number[];
    };
    const svg = generateChartSvg({
      type: type || 'bar',
      title: title || 'Grafikon',
      labels: Array.isArray(labels) ? labels : ['A', 'B', 'C'],
      values: Array.isArray(values) ? values : [10, 20, 15],
    });
    res.json({ svg });
  });

  router.post('/exif-strip', (req, res) => {
    res.json(stripImageMetadataBase64(String(req.body?.dataBase64 || '')));
  });

  router.post('/qr-generate', (req, res) => {
    const text = String(req.body?.text || 'https://novaswarm.local');
    res.json({ svg: generateQrSvg(text, Number(req.body?.size || 220)) });
  });

  router.post('/batch-rename', (req, res) => {
    res.json(batchRenameFiles(req.body || { directory: '.', findRegex: '', replaceWith: '' }));
  });

  router.post('/text-transform', (req, res) => {
    const out = transformTextUtility(req.body || { mode: 'json_pretty', input: '{}' });
    if (req.body?.saveToClipboard) broadcastEvent('state:updated');
    res.json(out);
  });

  router.post('/wcag-contrast', (req, res) => {
    res.json(checkWcagContrast(String(req.body?.fg || '#0f172a'), String(req.body?.bg || '#ffffff')));
  });

  router.post('/notary/stamp', (req, res) => {
    const { filename, fileName, content, note } = req.body as {
      filename?: string;
      fileName?: string;
      content?: string;
      note?: string;
    };
    const record = notarizeDocumentHash({
      fileName: fileName || filename || 'dokumentum.txt',
      textContent: content || '',
      note,
    });
    logNotaryAudit(record.fileName, record.sha256);
    broadcastEvent('state:updated');
    res.json({ record });
  });

  router.post('/notary/verify', (req, res) => {
    const { content, expectedSha256 } = req.body as { content?: string; expectedSha256?: string };
    const result = verifyNotarizedHash(content || '', false);
    const valid = expectedSha256
      ? result.sha256 === expectedSha256.trim().toLowerCase()
      : Boolean(result.matchedRecord);
    res.json({ valid, sha256: result.sha256, matchedRecord: result.matchedRecord });
  });

  // Ú91, Ú99, Ú100, Ú106, Ú107, Ú113-115, Ú141-147: Life, CRM, Knowledge & Finance
  router.post('/crm', (req, res) => {
    const contact = addCrmContact(req.body || { name: 'Új Névjegy' });
    broadcastEvent('state:updated');
    res.json({ contact });
  });

  router.delete('/crm/:id', (req, res) => {
    updateState((s) => {
      s.crmContacts = s.crmContacts.filter((c) => c.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.post('/packages', (req, res) => {
    const pkg = addPackageOrder(req.body || { trackingNumber: 'N/A', carrier: 'MPL', title: 'Csomag' });
    broadcastEvent('state:updated');
    res.json({ package: pkg });
  });

  router.patch('/packages/:id', (req, res) => {
    updateState((s) => {
      const p = s.packages.find((x) => x.id === req.params.id);
      if (p && req.body?.status) {
        p.status = req.body.status;
        p.updatedAt = new Date().toISOString();
      }
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.post('/share-links', (req, res) => {
    const link = createSharedPortalLink(
      req.body || { title: 'Megosztott Nézet', resourceType: 'list', resourceId: 'default' }
    );
    broadcastEvent('state:updated');
    res.json({ link });
  });

  router.delete('/share-links/:id', (req, res) => {
    updateState((s) => {
      s.sharedLinks = s.sharedLinks.filter((l) => l.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.post('/academic-search', async (req, res) => {
    res.json(await searchAcademicPapers(String(req.body?.query || 'autonomous agents')));
  });

  router.post('/bookmarks', async (req, res) => {
    const entry = await archiveBookmarkUrl(String(req.body?.url || ''), Array.isArray(req.body?.tags) ? req.body.tags : []);
    broadcastEvent('state:updated');
    res.json({ bookmark: entry });
  });

  router.delete('/bookmarks/:id', (req, res) => {
    updateState((s) => {
      s.bookmarks = s.bookmarks.filter((b) => b.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.post('/home/inventory', (req, res) => {
    const item = addHomeInventoryItem(req.body || { name: 'Tétel', quantity: 1, unit: 'db' });
    broadcastEvent('state:updated');
    res.json({ item });
  });

  router.post('/home/meals', (req, res) => {
    const out = addMealAndSyncShoppingList(
      req.body || { day: 'Hétfő', mealName: 'Vacsora', ingredients: [] }
    );
    broadcastEvent('state:updated');
    res.json(out);
  });

  router.post('/home/vehicle', (req, res) => {
    const item = addVehicleMaintenanceItem(req.body || { vehicleOrAsset: 'Autó', task: 'Olajcsere' });
    broadcastEvent('state:updated');
    res.json({ item });
  });

  router.post('/finance/calc', (req, res) => {
    res.json(computeVatAndCompound(req.body || {}));
  });

  router.post('/finance/envelopes', (req, res) => {
    const envelope = upsertBudgetEnvelope(req.body || { category: 'Egyéb', monthlyLimit: 50000 });
    broadcastEvent('state:updated');
    res.json({ envelope });
  });

  router.post('/finance/fx', async (req, res) => {
    res.json(
      await convertCurrencyLive(
        Number(req.body?.amount ?? 100),
        String(req.body?.from || 'EUR'),
        String(req.body?.to || 'HUF')
      )
    );
  });

  // Ú120..Ú130, Ú152..Ú160: Network, Cluster, WireGuard, WOL, TOTP, Phoenix
  router.post('/wol', async (req, res) => {
    const { mac, broadcastIp, saveName } = req.body as { mac: string; broadcastIp?: string; saveName?: string };
    if (saveName && mac) addWolDevice({ name: saveName, mac, broadcastIp });
    const out = await sendWakeOnLanPacket(mac || '', broadcastIp);
    broadcastEvent('state:updated');
    res.json(out);
  });

  router.post('/wireguard/generate', (req, res) => {
    res.json(generateWireGuardClientBundle(req.body || {}));
  });

  router.get('/lan-arp', (_req, res) => {
    res.json(scanLanArpTable());
  });

  router.get('/ssh-audit', (_req, res) => {
    res.json({ sshLogs: inspectSshAuthLogs(), filePermissions: auditSecretFilePermissions() });
  });

  router.post('/speedtest', async (_req, res) => {
    res.json(await runNetworkSpeedtest());
  });

  router.post('/osint-domain', async (req, res) => {
    res.json(await inspectDomainOsint(String(req.body?.domain || 'example.com')));
  });

  router.post('/cluster/nodes', (req, res) => {
    const node = registerClusterNode(req.body || { name: 'GPU-Node', url: 'http://192.168.1.50:11434', role: 'gpu_ollama' });
    broadcastEvent('state:updated');
    res.json({ node });
  });

  router.post('/cluster/ping', async (_req, res) => {
    const nodes = await pingClusterNodes();
    broadcastEvent('state:updated');
    res.json({ nodes });
  });

  router.delete('/cluster/nodes/:id', (req, res) => {
    updateState((s) => {
      s.clusterNodes = s.clusterNodes.filter((n) => n.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.post('/phoenix/snapshot', (_req, res) => {
    res.json(createPhoenixSnapshot());
  });

  router.post('/totp/generate', (req, res) => {
    const secret = generateTotpSecret();
    res.json({
      secret,
      otpauthUri: `otpauth://totp/NovaSwarm:operator?secret=${secret}&issuer=NovaSwarm`,
    });
  });

  router.post('/totp/verify', (req, res) => {
    const { secret, code } = req.body as { secret: string; code: string };
    res.json({ valid: verifyTotpCode(secret || '', code || '') });
  });

  return router;
}
