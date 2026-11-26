import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Skill } from '../../shared/types';
import { runInSupervisorSandbox } from '../sandbox/supervisorSandbox';
import { appendAuditLog, getState, updateState } from '../state/store';

function getSkillsDir(): string {
  return path.join(process.cwd(), 'skills');
}

function toSafeSlug(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'skill';
}

export function buildDefaultSkillTestCode(skillName: string, skillCode: string): string {
  const exportsRun = /\bexport\s+(async\s+)?function\s+run\b|\bmodule\.exports\b/.test(skillCode);
  return [
    `// Automatikus Skill egységteszt (${skillName})`,
    exportsRun
      ? `if (typeof run === 'function') { const res = await Promise.resolve(run('teszt-bemenet')); if (res === undefined || res === null) { throw new Error('A run() visszatérési értéke üres'); } if (typeof res === 'object' && 'ok' in res && res.ok === false) { throw new Error('A run() ok=false értékkel tért vissza'); } }`
      : `// Kimenet és futási stabilitás ellenőrzése`,
    `console.log('SKILL_TEST_OK:${toSafeSlug(skillName)}');`,
  ].join('\n');
}

function combineSkillAndTestForSandbox(code: string, testCode: string): string {
  // Strip ESM export keywords cleanly so combined sandbox snippet executes in single module/script context
  const sanitizedCode = code.replace(/\bexport\s+(?=(async\s+)?function\s+|const\s+|let\s+)/g, '');
  const sanitizedTest = testCode.replace(/\bexport\s+/g, '');
  return `'use strict';\n(async () => {\n${sanitizedCode}\n;\n${sanitizedTest}\n})().catch((err) => { console.error(err && err.stack ? err.stack : String(err)); process.exit(1); });`;
}

export function createAndValidateSkill(input: {
  name: string;
  description: string;
  code: string;
  testCode?: string;
  createdByAgentId: string;
  pitfalls?: string[];
}): Skill {
  const id = `skill-${crypto.randomUUID().slice(0, 8)}`;
  const fileName = `${toSafeSlug(input.name)}-${id.slice(-4)}.js`;
  const skillsDir = getSkillsDir();
  if (!fs.existsSync(skillsDir)) {
    fs.mkdirSync(skillsDir, { recursive: true });
  }

  const absPath = path.join(skillsDir, path.basename(fileName));
  fs.writeFileSync(absPath, input.code, 'utf8');

  const sandboxRes = runInSupervisorSandbox({
    scriptOrCommand: input.code,
    isNodeScript: true,
    timeoutMs: 4000,
  });

  const testCode = (input.testCode && input.testCode.trim())
    ? input.testCode.trim()
    : buildDefaultSkillTestCode(input.name, input.code);

  const testSandboxRes = runInSupervisorSandbox({
    scriptOrCommand: combineSkillAndTestForSandbox(input.code, testCode),
    isNodeScript: true,
    timeoutMs: 4000,
  });

  const testPassed = testSandboxRes.passed;
  const bothPassed = sandboxRes.passed && testPassed;
  const status: Skill['status'] = bothPassed ? 'verified' : 'rejected';

  const stdoutText = sandboxRes.stdout.trim() || '(üres)';
  const stderrText = sandboxRes.stderr.trim();
  const sandboxReport = [
    `[${sandboxRes.isolationMode}] exit=${sandboxRes.exitCode} (${sandboxRes.durationMs}ms)`,
    `STDOUT: ${stdoutText}`,
    stderrText ? `STDERR: ${stderrText}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const testReport = [
    `[Skill Teszt / ${testSandboxRes.isolationMode}] ${testPassed ? 'SIKERES ✅' : 'ELBUKOTT ❌'} (exit=${testSandboxRes.exitCode}, ${testSandboxRes.durationMs}ms)`,
    testSandboxRes.stdout.trim() ? `STDOUT: ${testSandboxRes.stdout.trim()}` : '',
    testSandboxRes.stderr.trim() ? `STDERR: ${testSandboxRes.stderr.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const pitfalls = Array.isArray(input.pitfalls)
    ? input.pitfalls.map((p) => p.trim()).filter(Boolean)
    : [];

  const skill: Skill = {
    id,
    name: input.name.trim(),
    description: input.description?.trim() || '',
    filePath: path.join('skills', path.basename(fileName)),
    code: input.code,
    testCode,
    testPassed,
    testReport,
    createdByAgentId: input.createdByAgentId || 'user',
    status,
    sandboxReport,
    pitfalls,
    usageCount: 0,
    createdAt: new Date().toISOString(),
  };

  updateState((s) => {
    s.skills.push(skill);
  });

  appendAuditLog({
    type: 'skill',
    sourceAgentId: skill.createdByAgentId,
    sourceAgentName: skill.createdByAgentId,
    message: `Skill ${status === 'verified' ? 'sandboxban és egységteszten jóváhagyva' : 'sandboxban vagy egységteszten elutasítva'}: ${skill.name}`,
    verifiedExecution: status === 'verified',
  });

  return skill;
}

export function runSkillSelfTest(skillId: string, customTestCode?: string): Skill | null {
  const state = getState();
  const existing = state.skills.find((sk) => sk.id === skillId);
  if (!existing) return null;

  const testCode = (customTestCode && customTestCode.trim())
    ? customTestCode.trim()
    : existing.testCode?.trim() || buildDefaultSkillTestCode(existing.name, existing.code);

  const res = runInSupervisorSandbox({
    scriptOrCommand: combineSkillAndTestForSandbox(existing.code, testCode),
    isNodeScript: true,
    timeoutMs: 4000,
  });

  const testReport = [
    `[Skill Teszt / ${res.isolationMode}] ${res.passed ? 'SIKERES ✅' : 'ELBUKOTT ❌'} (exit=${res.exitCode}, ${res.durationMs}ms)`,
    res.stdout.trim() ? `STDOUT: ${res.stdout.trim()}` : '',
    res.stderr.trim() ? `STDERR: ${res.stderr.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  let updated: Skill | null = null;
  updateState((s) => {
    const target = s.skills.find((sk) => sk.id === skillId);
    if (!target) return;
    target.testCode = testCode;
    target.testPassed = res.passed;
    target.testReport = testReport;
    target.status = res.passed ? 'verified' : 'rejected';
    updated = { ...target };
  });

  appendAuditLog({
    type: 'skill',
    sourceAgentId: 'skill-factory',
    sourceAgentName: 'Skill Önteszt',
    message: `Skill egységteszt (${existing.name}): ${res.passed ? 'SIKERES' : 'SIKERTELEN'}`,
    verifiedExecution: res.passed,
  });

  return updated;
}

export function addSkillPitfall(skillId: string, pitfall: string): Skill | null {
  const clean = pitfall.trim();
  if (!clean) return null;

  let updated: Skill | null = null;
  updateState((s) => {
    const target = s.skills.find((sk) => sk.id === skillId);
    if (!target) return;
    const existing = target.pitfalls || [];
    if (!existing.includes(clean)) {
      target.pitfalls = [...existing, clean];
    }
    updated = { ...target, pitfalls: [...(target.pitfalls || [])] };
  });

  if (updated) {
    appendAuditLog({
      type: 'skill',
      sourceAgentId: 'skill-factory',
      sourceAgentName: 'Skill Gyár',
      message: `Tanult buktató hozzáadva (${(updated as Skill).name}): ${clean}`,
      verifiedExecution: true,
    });
  }

  return updated;
}

export function recordSkillUsage(skillId: string): void {
  updateState((s) => {
    const target = s.skills.find((sk) => sk.id === skillId);
    if (!target) return;
    target.usageCount = (target.usageCount ?? 0) + 1;
    target.lastUsedAt = new Date().toISOString();
  });
}

export function buildProgressiveSkillsIndex(): string {
  const verified = getState().skills.filter((s) => s.status === 'verified');
  if (verified.length === 0) return '';

  return verified
    .map((s) => {
      const pitfallsPart =
        s.pitfalls && s.pitfalls.length > 0 ? ` | Buktatók: ${s.pitfalls.join('; ')}` : '';
      const testBadge = s.testPassed === true ? 'teszt:OK' : s.testPassed === false ? 'teszt:HIBA' : 'teszt:-';
      return `- ${s.name} (${s.id}): ${s.description || 'Egyedi skill'} [fájl: ${s.filePath}, használat: ${s.usageCount ?? 0}, ${testBadge}]${pitfallsPart}`;
    })
    .join('\n');
}
