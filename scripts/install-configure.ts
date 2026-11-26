#!/usr/bin/env tsx
import crypto from 'node:crypto';
import { createAgent } from '../server/agents/engine';
import { consumeOneTimeSetupCode } from '../server/security/auth';
import { toggleTotalAutonomyMode } from '../server/security/totalAutonomy';
import {
  appendAuditLog,
  clearWebAuthPassword,
  getState,
  hasWebAuthPassword,
  normalizePasswordInput,
  setTelegramTokenSecret,
  setWebAuthPassword,
  updateState,
} from '../server/state/store';
import { reselectOllamaSuite } from '../server/system/ollamaSelector';
import { createBackupPoint } from '../server/system/ops';

export interface InstallConfigureOptions {
  password?: string;
  noPassword?: boolean;
  generatePassword?: boolean;
  telegramToken?: string;
  telegramChatId?: string;
  skipOllamaPull?: boolean;
  skipOllamaBenchmark?: boolean;
  skipPhoenixBackup?: boolean;
  telegramSender?: (text: string) => Promise<unknown>;
}

export interface InstallConfigureResult {
  mode: 'password' | 'passwordless';
  generatedPassword?: string;
  webAuthEnabled: boolean;
  webAuthHasPassword: boolean;
  onboardingCompleted: boolean;
  ollamaTier: string;
  mainModel: string;
  fastModel: string;
  codeModel: string;
  embeddingModel: string;
  pendingPullModels: string[];
  tps: number | null;
  phoenixBackupCreated: boolean;
}

export function generateStrongOperatorPassword(length = 18): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%^&*-_+=';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export async function runInstallConfigure(
  opts: InstallConfigureOptions = {}
): Promise<InstallConfigureResult> {
  // Ensure initial state is loaded / created
  getState();

  let generatedPassword: string | undefined;
  let effectivePassword = '';

  if (opts.noPassword) {
    effectivePassword = '';
  } else if (opts.generatePassword) {
    generatedPassword = generateStrongOperatorPassword(18);
    effectivePassword = generatedPassword;
  } else if (typeof opts.password === 'string') {
    const norm = normalizePasswordInput(opts.password);
    if (norm.length > 0) {
      if (norm.length < 12) {
        throw new Error('A megadott operátori webes jelszónak legalább 12 karakter hosszúnak kell lennie.');
      }
      effectivePassword = norm;
    }
  }

  if (effectivePassword) {
    setWebAuthPassword(effectivePassword);
    consumeOneTimeSetupCode();
  } else {
    clearWebAuthPassword();
  }

  const tgToken = (opts.telegramToken || '').trim();
  const tgChat = (opts.telegramChatId || '').trim();
  const hasPw = hasWebAuthPassword();
  const mode: 'password' | 'passwordless' = hasPw ? 'password' : 'passwordless';

  updateState((s) => {
    s.settings.webAuthHasPassword = hasPw;
    s.settings.webAuthEnabled = hasPw;
    s.settings.onboardingCompleted = true;
    s.settings.autoPhoenixSnapshotInFullAutonomy = true;
    if (tgChat) {
      s.settings.telegramChatId = tgChat;
      const list = s.settings.telegramAllowedChatIds || [];
      if (!list.includes(tgChat)) {
        s.settings.telegramAllowedChatIds = [...list, tgChat];
      }
    }
    if (tgToken) {
      setTelegramTokenSecret(tgToken);
      s.settings.telegramHasToken = true;
      s.settings.telegramEnabled = Boolean(tgChat);
    }
  });

  appendAuditLog({
    type: 'security',
    sourceAgentId: 'installer',
    sourceAgentName: 'Telepítő',
    message: hasPw
      ? 'Telepítő konfiguráció lefutott: webes operátori jelszó beállítva (LAN zár AKTÍV).'
      : 'Telepítő konfiguráció lefutott: jelszó nélküli helyi hálózati (LAN) mód beállítva.',
    verifiedExecution: true,
    passwordlessMode: !hasPw,
  });

  if (getState().agents.filter((a) => !a.isSupervisor).length === 0) {
    createAgent({
      name: 'Központi Asszisztens',
      role: 'Általános Asszisztens',
      systemPrompt: 'Önállóan működő NovaSwarm koordinátor ágens a 3 sérthetetlen biztonsági garancia betartásával.',
      hostExecutionEnabled: true,
    });
  }

  const ollamaRes = await reselectOllamaSuite({
    pullMissing: !opts.skipOllamaPull,
    runBenchmark: !opts.skipOllamaBenchmark,
    checkRemoteRegistry: !opts.skipOllamaPull,
  });

  await toggleTotalAutonomyMode({
    enabled: true,
    bypassPasswordForInstaller: true,
    telegramSender: opts.telegramSender,
  });

  let phoenixBackupCreated = false;
  if (!opts.skipPhoenixBackup) {
    createBackupPoint();
    phoenixBackupCreated = true;
  }

  const finalSettings = getState().settings;
  return {
    mode,
    generatedPassword,
    webAuthEnabled: finalSettings.webAuthEnabled,
    webAuthHasPassword: finalSettings.webAuthHasPassword,
    onboardingCompleted: finalSettings.onboardingCompleted,
    ollamaTier: ollamaRes.selection.tierLabel,
    mainModel: ollamaRes.selection.mainModel,
    fastModel: ollamaRes.selection.fastModel,
    codeModel: ollamaRes.selection.codeModel,
    embeddingModel: ollamaRes.selection.embeddingModel,
    pendingPullModels: ollamaRes.pendingPullModels,
    tps: ollamaRes.benchmark?.tokensPerSec ?? null,
    phoenixBackupCreated,
  };
}

function parseCliArgs(argv: string[]): InstallConfigureOptions {
  const out: InstallConfigureOptions = {
    password:
      process.env.NOVASWARM_INSTALL_PW ??
      process.env.NOVASWARM_OPERATOR_PASSWORD ??
      '',
    noPassword: process.env.NOVASWARM_NO_PASSWORD === '1',
    generatePassword: process.env.NOVASWARM_GENERATE_PASSWORD === '1',
    telegramToken: process.env.NOVASWARM_INSTALL_TG_TOKEN ?? '',
    telegramChatId: process.env.NOVASWARM_INSTALL_TG_CHAT ?? '',
    skipOllamaPull: process.env.NOVASWARM_SKIP_OLLAMA_PULL === '1',
    skipOllamaBenchmark: process.env.NOVASWARM_SKIP_OLLAMA_BENCH === '1',
    skipPhoenixBackup: process.env.NOVASWARM_SKIP_PHOENIX_BACKUP === '1',
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-password') out.noPassword = true;
    else if (a === '--generate-password') out.generatePassword = true;
    else if (a === '--skip-ollama-pull') out.skipOllamaPull = true;
    else if (a === '--skip-ollama-bench') out.skipOllamaBenchmark = true;
    else if (a === '--skip-phoenix') out.skipPhoenixBackup = true;
    else if (a === '--password' && argv[i + 1] !== undefined) {
      out.password = argv[++i];
    } else if (a.startsWith('--password=')) {
      out.password = a.slice('--password='.length);
    }
  }
  return out;
}

// Execute only when invoked as a standalone CLI script
const isMain = Boolean(process.argv[1] && process.argv[1].endsWith('install-configure.ts'));
if (isMain) {
  const opts = parseCliArgs(process.argv.slice(2));
  runInstallConfigure(opts)
    .then((res) => {
      if (res.generatedPassword) {
        console.log(`GENERATED_PASSWORD=${res.generatedPassword}`);
      }
      console.log(
        `INSTALL_CONFIG_OK=${JSON.stringify({
          mode: res.mode,
          webAuthEnabled: res.webAuthEnabled,
          onboardingCompleted: res.onboardingCompleted,
        })}`
      );
      console.log(
        `OLLAMA_SUITE=${JSON.stringify({
          tier: res.ollamaTier,
          main: res.mainModel,
          fast: res.fastModel,
          code: res.codeModel,
          embed: res.embeddingModel,
          pending: res.pendingPullModels,
          tps: res.tps,
        })}`
      );
    })
    .catch((err) => {
      console.error('HIBA az install-configure futása közben:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
