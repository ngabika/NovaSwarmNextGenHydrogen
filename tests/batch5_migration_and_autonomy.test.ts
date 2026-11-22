import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  classifyHardwareSpecs,
  applyHardwareAdaptiveOptimization,
  recordSdBufferedTelemetry,
  flushTelemetryRingBuffer,
  getTelemetryBufferStatus,
  runRamOomWatchdogTick,
  routeTaskModelHybrid,
} from '../server/system/hardwareOptimizer';
import {
  validateMigrationTarget,
  buildRemoteSetupScript,
  executeSshHostMigration,
  testSshMigrationTarget,
} from '../server/infra/sshHostMigrator';
import {
  routeTelegramPhotoIntent,
  validateGpioPin,
  buildProactiveBrief,
  runEmailInboxTriage,
  createAndSelfTestDynamicTool,
} from '../server/power/batch5AutonomyEngine';
import { createInitialState, getState, resetInMemoryStateForTests, updateState } from '../server/state/store';

test('Hardware profiler adapts settings for ultra-light 2 GB Pi vs GPU Workstation', () => {
  const pi = classifyHardwareSpecs({
    cpuCores: 4,
    arch: 'linux/arm64',
    ramTotalMb: 1843,
    ramAvailableMb: 900,
    swapTotalMb: 1842,
    storageKind: 'sd_or_emmc',
    hasGpu: false,
    gpuName: 'none',
  });
  assert.equal(pi.tier, 'ultra_light_pi');
  assert.equal(pi.recommendedOllamaModel, 'qwen2.5:1.5b');
  assert.equal(pi.recommendedHeapMb, 640);
  assert.equal(pi.recommendedConcurrency, 1);
  assert.equal(pi.sdCardSparingRecommended, true);
  assert.equal(pi.recommendedRamWatchdogPercent, 84);

  const ws = classifyHardwareSpecs({
    cpuCores: 16,
    arch: 'linux/x64',
    ramTotalMb: 32768,
    ramAvailableMb: 24000,
    swapTotalMb: 8192,
    storageKind: 'ssd_or_nvme',
    hasGpu: true,
    gpuName: 'NVIDIA RTX 4080',
  });
  assert.equal(ws.tier, 'workstation_gpu');
  assert.equal(ws.recommendedOllamaModel, 'qwen2.5-coder:7b');
  assert.equal(ws.recommendedHeapMb, 2048);
  assert.ok(ws.recommendedConcurrency >= 4);
  assert.equal(ws.sdCardSparingRecommended, false);
});

test('RAM/OOM Watchdog triggers cleanup above threshold and SD telemetry buffer flushes cleanly', async () => {
  resetInMemoryStateForTests(createInitialState());
  flushTelemetryRingBuffer();
  recordSdBufferedTelemetry('sample-1');
  recordSdBufferedTelemetry('sample-2');
  assert.equal(getTelemetryBufferStatus().bufferedCount, 2);

  const wdLow = await runRamOomWatchdogTick(42);
  assert.equal(wdLow.triggered, false);

  const wdHigh = await runRamOomWatchdogTick(91);
  assert.equal(wdHigh.triggered, true);
  assert.ok(wdHigh.actionsTaken.some((a) => /gyorsítótár/i.test(a)));
  assert.equal(getTelemetryBufferStatus().bufferedCount, 0);

  const applied = applyHardwareAdaptiveOptimization(true);
  assert.ok(applied.updatedSettingsFields.includes('detectedHardwareTier'));
  assert.ok(getState().hardwareProfile !== null);
});

test('Hybrid router routes simple queries locally and heavy coding queries to cloud when key exists', () => {
  const s = createInitialState();
  s.settings.ollamaOnlyMode = false;
  s.settings.hybridLocalFirst = true;
  s.settings.detectedHardwareTier = 'ultra_light_pi';
  s.settings.ollamaModel = 'qwen2.5:1.5b';
  s.settings.providerKeys.gemini = [
    { id: 'k1', label: 'Key', maskedKey: 'AIza...1234', enabled: true, failureCount: 0 },
  ];

  const simpleRoute = routeTaskModelHybrid('Mennyi az idő Budapesten?', 'simple', s);
  assert.equal(simpleRoute.target, 'local_ollama');
  assert.equal(simpleRoute.provider, 'ollama');

  const heavyRoute = routeTaskModelHybrid('Írj teljes TypeScript architektúrát és refaktoráld a rendszert', 'complex', s);
  assert.equal(heavyRoute.target, 'cloud_primary');
  assert.equal(heavyRoute.provider, 'gemini');
});

test('SSH migrator strictly rejects invalid IPs, loopback targets, and shell injection payloads', () => {
  assert.throws(
    () => validateMigrationTarget({ targetIp: '127.0.0.1', username: 'ngabika', password: 'secret' }),
    /loopback/i
  );
  assert.throws(
    () => validateMigrationTarget({ targetIp: '192.168.1.50; rm -rf /', username: 'ngabika', password: 'secret' }),
    /Érvénytelen cél IP/i
  );
  assert.throws(
    () => validateMigrationTarget({ targetIp: '192.168.1.50', username: 'root && whoami', password: 'secret' }),
    /felhasználónév/i
  );
  const valid = validateMigrationTarget({
    targetIp: '192.168.1.210',
    username: 'ngabika',
    password: 'MySuperSecretPassword!',
    sshPort: 22,
    targetAppPort: 3000,
    stopOldInstance: true,
  });
  assert.equal(valid.targetIp, '192.168.1.210');

  const script = buildRemoteSetupScript({
    target: valid,
    bundleRemotePath: '/tmp/bundle.tar.gz',
  });
  assert.ok(script.includes('HEALTHCHECK_OK'));
  assert.ok(script.includes('applyHardwareAdaptiveOptimization'));
  assert.ok(!script.includes('MySuperSecretPassword!'));
});

test('SSH migrator dry-run test and end-to-end cutover behavior never persist password and stop old host only after /healthz OK', async () => {
  resetInMemoryStateForTests(createInitialState());
  const secretPw = 'TopSecretPass9988!';

  const preview = await testSshMigrationTarget(
    { targetIp: '192.168.1.220', username: 'ngabika', password: secretPw },
    {
      execRemote: async () => ({
        code: 0,
        stdout: 'PROBE:x86_64|12|16384|NVIDIA RTX 3060\n',
        stderr: '',
      }),
      uploadFile: async () => ({ code: 0, stdout: '', stderr: '' }),
    }
  );
  assert.equal(preview.ok, true);
  assert.equal(preview.hardwarePreview?.recommendedModel, 'qwen2.5-coder:7b');

  // Case 1: Remote healthcheck fails -> stopOldInstance MUST NOT fire!
  let oldHostStoppedOnFail = false;
  const failedMig = await executeSshHostMigration(
    { targetIp: '192.168.1.220', username: 'ngabika', password: secretPw, stopOldInstance: true },
    {
      skipLocalArchiveForTest: true,
      transport: {
        uploadFile: async () => ({ code: 0, stdout: '', stderr: '' }),
        execRemote: async () => ({ code: 1, stdout: 'HEALTHCHECK_FAILED', stderr: 'port busy' }),
      },
      onStopOldHost: () => {
        oldHostStoppedOnFail = true;
      },
    }
  );
  assert.equal(failedMig.status, 'failed');
  assert.equal(oldHostStoppedOnFail, false);

  // Case 2: Remote healthcheck passes -> stopOldInstance fires AND password never leaks in state/logs!
  let oldHostStoppedOnSuccess = false;
  const okMig = await executeSshHostMigration(
    { targetIp: '192.168.1.220', username: 'ngabika', password: secretPw, stopOldInstance: true },
    {
      skipLocalArchiveForTest: true,
      transport: {
        uploadFile: async () => ({ code: 0, stdout: '', stderr: '' }),
        execRemote: async () => ({
          code: 0,
          stdout: 'TARGET_HW_SUMMARY=Arch=x86_64 CPU=12 RAM=16384MB GPU=NVIDIA Model=qwen2.5-coder:7b\nHEALTHCHECK_OK port=3000\n',
          stderr: '',
        }),
      },
      onStopOldHost: () => {
        oldHostStoppedOnSuccess = true;
      },
    }
  );
  assert.equal(okMig.status, 'completed');
  assert.equal(okMig.newUrl, 'http://192.168.1.220:3000');
  assert.equal(oldHostStoppedOnSuccess, true);

  const serializedState = JSON.stringify(getState());
  assert.ok(!serializedState.includes(secretPw), 'SSH password must never appear in persisted state or audit logs');
});

test('Batch 5 Autonomy: Telegram photo router, GPIO pin bounds, Inbox Triage, Brief & Self-Testing Dynamic Tool', async () => {
  resetInMemoryStateForTests(createInitialState());

  // Photo intent routing
  const expRoute = routeTelegramPhotoIntent({
    caption: 'Aldi blokk',
    aiReplyText: 'Végösszeg: 14500 Ft élelmiszer',
  });
  assert.equal(expRoute.category, 'receipt');
  assert.equal(getState().expenses.length, 1);
  assert.equal(getState().expenses[0].amount, 14500);

  const warRoute = routeTelegramPhotoIntent({
    caption: 'Laptop garancia jegy',
    aiReplyText: 'Jótállás érvényes 2028-11-20 dátumig.',
  });
  assert.equal(warRoute.category, 'warranty_doc');
  assert.equal(getState().documentSafe.length, 1);

  // GPIO bounds check
  assert.equal(validateGpioPin(17), 17);
  assert.throws(() => validateGpioPin(99), /GPIO/);

  // Email Inbox Triage
  updateState((s) => {
    s.emailConfig.recentEmails = [
      { uid: 101, from: 'shop@example.hu', subject: 'Csomag feladva GLS-88332211', date: '2026-11-22', snippet: 'Követés aktív' },
      { uid: 102, from: 'szamla@provider.hu', subject: 'Sürgős számla értesítő', date: '2026-11-22', snippet: 'Fizetendő összeg 8990 Ft' },
    ];
  });
  const triage = runEmailInboxTriage();
  assert.equal(triage.packagesAdded, 1);
  assert.equal(triage.expensesAdded, 1);
  assert.equal(triage.urgentAlerts.length, 1);

  // Brief
  const brief = await buildProactiveBrief('morning');
  assert.ok(brief.text.includes('Reggeli Főnöki Összefoglaló'));

  // Self-testing & auto-repairing dynamic tool
  const built = await createAndSelfTestDynamicTool({
    name: 'double_num',
    description: 'Duplázó segédeszköz',
    kind: 'sandbox_js',
    targetOrCode: 'Number(input.sample || 5) * 2', // missing 'return' -> deterministic self-repair fixes it!
  });
  assert.equal(built.ok, true);
  assert.equal(built.repaired, true);
  assert.equal(built.testOutput, '84');
});

test('Zero banned brand/platform terms exist across Batch 5 source files', () => {
  const files = [
    'server/system/hardwareOptimizer.ts',
    'server/infra/sshHostMigrator.ts',
    'server/power/batch5AutonomyEngine.ts',
    'server/routes/universalV5Router.ts',
    'src/components/Batch5MigrationAndAutoPanel.tsx',
  ];
  const banned = /\b(marveen|openclaw|litellm|binance)\b/i;
  for (const rel of files) {
    const content = fs.readFileSync(rel, 'utf8');
    assert.equal(banned.test(content), false, `Banned term found in ${rel}`);
  }
});
