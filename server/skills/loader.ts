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

export function createAndValidateSkill(input: {
  name: string;
  description: string;
  code: string;
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

  const status: Skill['status'] = sandboxRes.passed ? 'verified' : 'rejected';
  const stdoutText = sandboxRes.stdout.trim() || '(üres)';
  const stderrText = sandboxRes.stderr.trim();
  const sandboxReport = [
    `[${sandboxRes.isolationMode}] exit=${sandboxRes.exitCode} (${sandboxRes.durationMs}ms)`,
    `STDOUT: ${stdoutText}`,
    stderrText ? `STDERR: ${stderrText}` : '',
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
    message: `Skill ${status === 'verified' ? 'sandboxban jóváhagyva' : 'sandboxban elutasítva'}: ${skill.name}`,
    verifiedExecution: status === 'verified',
  });

  return skill;
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
      return `- ${s.name} (${s.id}): ${s.description || 'Egyedi skill'} [fájl: ${s.filePath}, használat: ${s.usageCount ?? 0}]${pitfallsPart}`;
    })
    .join('\n');
}
