import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Skill } from '../../shared/types';
import { runInSupervisorSandbox } from '../sandbox/supervisorSandbox';
import { appendAuditLog, getState, updateState } from '../state/store';

const SKILLS_DIR = path.join(process.cwd(), 'skills');

/**
 * Dynamic Agent Skill Writer & Loader (Section 12.1).
 * Every newly written skill MUST pass Supervisor dry-run sandbox testing
 * before its status becomes `verified` and available in production.
 */
export function createAndValidateSkill(input: {
  name: string;
  description: string;
  code: string;
  createdByAgentId: string;
}): Skill {
  if (!fs.existsSync(SKILLS_DIR)) {
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
  }

  const id = `skill-${crypto.randomUUID().slice(0, 8)}`;
  const safeName = input.name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  const filePath = path.join('skills', `${safeName}-${id}.mjs`);

  // Run inside Supervisor isolated sandbox BEFORE activating or writing to production skills/
  const sandbox = runInSupervisorSandbox({
    scriptOrCommand: input.code,
    isNodeScript: true,
    realProtectedPaths: [path.join(process.cwd(), '.state.json')],
  });

  const status: Skill['status'] = sandbox.passed ? 'verified' : 'rejected';
  if (sandbox.passed) {
    fs.writeFileSync(path.join(process.cwd(), filePath), input.code, 'utf8');
  }

  const skill: Skill = {
    id,
    name: input.name.trim(),
    description: input.description.trim(),
    filePath: sandbox.passed ? filePath : '',
    code: input.code,
    createdByAgentId: input.createdByAgentId,
    status,
    sandboxReport: `Mode: ${sandbox.isolationMode} | Exit: ${sandbox.exitCode} | RealFS intact: ${sandbox.realWorkspaceIntact}\n${sandbox.stdout || sandbox.stderr}`,
    createdAt: new Date().toISOString(),
  };

  updateState((s) => {
    s.skills.unshift(skill);
  });

  appendAuditLog({
    type: 'supervisor',
    sourceAgentId: 'supervisor-auditor',
    sourceAgentName: 'Felügyelő Auditor',
    message: `Skill "${skill.name}" sandbox ellenőrzés: ${status} (${sandbox.isolationMode})`,
    verifiedExecution: sandbox.passed,
  });

  return skill;
}

export function listVerifiedSkills(): Skill[] {
  return getState().skills.filter((s) => s.status === 'verified');
}
