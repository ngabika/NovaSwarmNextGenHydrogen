import express from 'express';
import type {
  ArchitectureBlueprint,
  CommunicationDraft,
  HierarchicalGoalNode,
  StudyPlanItem,
  TimeBlockSlot,
} from '../../shared/types';
import {
  addGlossaryTerm,
  addTimeBlock,
  advanceAgentHandoff,
  analyzeNumericSeries,
  analyzeProseQuality,
  analyzeWritingStyle,
  auditSqlQuery,
  buildKnowledgeConceptGraph,
  buildMultiLevelDigest,
  calculateFinancialModel,
  calculateProjectEstimations,
  convertUnitsAndTimezones,
  createAgentHandoff,
  createAgentPersona,
  createGoalTree,
  createStudyPlan,
  evaluateDecisionMatrix,
  exportOmniExecutiveReportMarkdown,
  generateArchitectureBlueprint,
  generateCommunicationDraft,
  generateStructuredFramework,
  importMeetingActionsToKanban,
  lintInfraManifest,
  logWellnessCheckin,
  processMeetingNotes,
  queryFactVault,
  renderSnippetWithVars,
  runDevConverters,
  runRedTeamCritique,
  runScenarioSimulation,
  sanitizeSensitiveText,
  saveCodeSnippet,
  searchOmniCapabilities,
  setActivePersona,
  setActiveUserContext,
  toggleChecklistItem,
  toggleGoalMilestone,
  toggleIncidentPlaybookStep,
  toggleStudyModule,
  transformTextTone,
  upsertFactVault,
} from '../power/batch8SingularityEngine';
import { updateState } from '../state/store';

export function createUniversalV8Router(
  broadcastEvent: (type: string, payload?: unknown) => void
): express.Router {
  const router = express.Router();

  const handleErr = (res: express.Response, err: unknown) => {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  };

  // 1. Capabilities Catalog (200 features: Ú361–Ú560)
  router.get('/capabilities', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const category = typeof req.query.category === 'string' ? req.query.category : '';
    res.json({ ok: true, ...searchOmniCapabilities(q, category) });
  });

  // 2. Personas, Context Profiles, Writing Style, Fact Vault, Tone & Prose
  router.post('/persona/activate', (req, res) => {
    try {
      const { personaIdOrName } = req.body as { personaIdOrName: string };
      const persona = setActivePersona(personaIdOrName || '');
      broadcastEvent('state:updated');
      res.json({ ok: true, persona });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/persona', (req, res) => {
    try {
      const persona = createAgentPersona(req.body || {});
      broadcastEvent('state:updated');
      res.json({ ok: true, persona });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/context/activate', (req, res) => {
    try {
      const { contextIdOrName } = req.body as { contextIdOrName: string };
      const context = setActiveUserContext(contextIdOrName || '');
      broadcastEvent('state:updated');
      res.json({ ok: true, context });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/style/analyze', (req, res) => {
    try {
      const { label, sampleText } = req.body as { label?: string; sampleText: string };
      const sample = analyzeWritingStyle(label || 'Saját Stílus', sampleText || '');
      broadcastEvent('state:updated');
      res.json({ ok: true, sample });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.get('/facts', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json({ ok: true, facts: queryFactVault(q) });
  });

  router.post('/facts', (req, res) => {
    try {
      const fact = upsertFactVault(req.body || {});
      broadcastEvent('state:updated');
      res.json({ ok: true, fact });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.delete('/facts/:id', (req, res) => {
    updateState((s) => {
      s.factVault = (s.factVault || []).filter((f) => f.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.post('/tone/transform', (req, res) => {
    try {
      const { text, targetTone } = req.body as {
        text: string;
        targetTone: 'formal' | 'casual' | 'assertive' | 'empathetic' | 'bullet_executive';
      };
      res.json({ ok: true, ...transformTextTone(text || '', targetTone || 'formal') });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/prose/analyze', (req, res) => {
    try {
      const { text } = req.body as { text: string };
      res.json({ ok: true, ...analyzeProseQuality(text || '') });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/framework/generate', (req, res) => {
    try {
      const { kind, topic } = req.body as {
        kind: 'adr' | 'rfc' | 'swot' | '5whys' | 'star' | 'postmortem' | 'eisenhower' | 'bluf';
        topic: string;
      };
      res.json({ ok: true, ...generateStructuredFramework(kind || 'adr', topic || '') });
    } catch (err) {
      handleErr(res, err);
    }
  });

  // 3. Cognitive Planner: Goal Trees, Handoffs, Decision Matrix, Scenarios, Red Team & Estimations
  router.post('/goals', (req, res) => {
    try {
      const { title, horizon, milestones } = req.body as {
        title: string;
        horizon?: HierarchicalGoalNode['horizon'];
        milestones?: string[];
      };
      const goal = createGoalTree({ title: title || '', horizon, milestones });
      broadcastEvent('state:updated');
      res.json({ ok: true, goal });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/goals/:goalId/milestones/:msId/toggle', (req, res) => {
    try {
      const goal = toggleGoalMilestone(req.params.goalId, req.params.msId);
      broadcastEvent('state:updated');
      res.json({ ok: true, goal });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/handoffs', (req, res) => {
    try {
      const { title, initialNote } = req.body as { title: string; initialNote?: string };
      const handoff = createAgentHandoff(title || '', initialNote);
      broadcastEvent('state:updated');
      res.json({ ok: true, handoff });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/handoffs/:id/advance', (req, res) => {
    try {
      const { summary } = req.body as { summary?: string };
      const handoff = advanceAgentHandoff(req.params.id, summary);
      broadcastEvent('state:updated');
      res.json({ ok: true, handoff });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/cognitive/decision-matrix', (req, res) => {
    try {
      const run = evaluateDecisionMatrix(req.body || {});
      broadcastEvent('state:updated');
      res.json({ ok: true, run });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/cognitive/scenario', (req, res) => {
    try {
      const { topic } = req.body as { topic: string };
      const simulation = runScenarioSimulation(topic || '');
      broadcastEvent('state:updated');
      res.json({ ok: true, simulation });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/cognitive/redteam', (req, res) => {
    try {
      const { proposal } = req.body as { proposal: string };
      const critique = runRedTeamCritique(proposal || '');
      broadcastEvent('state:updated');
      res.json({ ok: true, critique });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/cognitive/estimate', (req, res) => {
    try {
      res.json({ ok: true, ...calculateProjectEstimations(req.body || {}) });
    } catch (err) {
      handleErr(res, err);
    }
  });

  // 4. Meeting, Study, Digest, Glossary & Knowledge Graph
  router.post('/studio/meeting', (req, res) => {
    try {
      const { title, rawNotes } = req.body as { title?: string; rawNotes: string };
      const meeting = processMeetingNotes(title || 'Megbeszélés', rawNotes || '');
      broadcastEvent('state:updated');
      res.json({ ok: true, meeting });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/studio/meeting/:id/import-kanban', (req, res) => {
    try {
      const out = importMeetingActionsToKanban(req.params.id);
      broadcastEvent('state:updated');
      res.json({ ok: true, ...out });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/studio/digest', (req, res) => {
    try {
      const { title, rawText } = req.body as { title?: string; rawText: string };
      const digest = buildMultiLevelDigest(title || 'Kivonat', rawText || '');
      broadcastEvent('state:updated');
      res.json({ ok: true, digest });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/studio/study', (req, res) => {
    try {
      const { topic, level } = req.body as { topic: string; level?: StudyPlanItem['level'] };
      const plan = createStudyPlan(topic || '', level);
      broadcastEvent('state:updated');
      res.json({ ok: true, plan });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/studio/study/:planId/modules/:modId/toggle', (req, res) => {
    try {
      const plan = toggleStudyModule(req.params.planId, req.params.modId);
      broadcastEvent('state:updated');
      res.json({ ok: true, plan });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/studio/glossary', (req, res) => {
    try {
      const term = addGlossaryTerm(req.body || {});
      broadcastEvent('state:updated');
      res.json({ ok: true, term });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.get('/studio/concept-graph', (_req, res) => {
    res.json({ ok: true, ...buildKnowledgeConceptGraph() });
  });

  router.get('/studio/executive-report', (_req, res) => {
    res.json({ ok: true, ...exportOmniExecutiveReportMarkdown() });
  });

  // 5. Dev Copilot: Snippets, Architecture Blueprint, Playbooks, SQL/Infra Audit, Converters
  router.post('/dev/snippets', (req, res) => {
    try {
      const snippet = saveCodeSnippet(req.body || {});
      broadcastEvent('state:updated');
      res.json({ ok: true, snippet });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/dev/snippets/:id/render', (req, res) => {
    try {
      const rendered = renderSnippetWithVars(req.params.id, (req.body?.vars || {}) as Record<string, string>);
      broadcastEvent('state:updated');
      res.json({ ok: true, rendered });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/dev/blueprint', (req, res) => {
    try {
      const { name, pattern } = req.body as { name?: string; pattern?: ArchitectureBlueprint['pattern'] };
      const blueprint = generateArchitectureBlueprint(name || 'Rendszerterv', pattern || 'monolith_sqlite');
      broadcastEvent('state:updated');
      res.json({ ok: true, blueprint });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/dev/playbooks/:pbId/steps/:stepId/toggle', (req, res) => {
    try {
      const playbook = toggleIncidentPlaybookStep(req.params.pbId, req.params.stepId);
      broadcastEvent('state:updated');
      res.json({ ok: true, playbook });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/dev/sql-audit', (req, res) => {
    try {
      const { sql } = req.body as { sql: string };
      res.json({ ok: true, ...auditSqlQuery(sql || '') });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/dev/infra-lint', (req, res) => {
    try {
      const { manifest } = req.body as { manifest: string };
      res.json({ ok: true, ...lintInfraManifest(manifest || '') });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/dev/convert', (req, res) => {
    try {
      const { mode, payload } = req.body as {
        mode: 'json_to_ts' | 'csv_to_markdown' | 'jwt_decode' | 'env_mask';
        payload: string;
      };
      res.json({ ok: true, ...runDevConverters(mode || 'json_to_ts', payload || '') });
    } catch (err) {
      handleErr(res, err);
    }
  });

  // 6. Math, Statistics, Financial Engineering, Unit/Timezone & Privacy
  router.post('/analytics/stats', (req, res) => {
    try {
      const { numbers } = req.body as { numbers: string };
      res.json({ ok: true, ...analyzeNumericSeries(numbers || '') });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/analytics/finance', (req, res) => {
    try {
      res.json({ ok: true, ...calculateFinancialModel(req.body || {}) });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/analytics/units', (req, res) => {
    try {
      const { value, fromUnit, toUnit } = req.body as { value: number; fromUnit: string; toUnit: string };
      res.json({ ok: true, ...convertUnitsAndTimezones(Number(value), fromUnit || '', toUnit || '') });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/privacy/sanitize', (req, res) => {
    const { text } = req.body as { text: string };
    res.json({ ok: true, ...sanitizeSensitiveText(text || '') });
  });

  // 7. Time-Blocking, Checklists, Wellness & Communication Drafts
  router.post('/life/timeblocks', (req, res) => {
    try {
      const body = req.body as {
        date?: string;
        startHour: string;
        endHour: string;
        title: string;
        kind?: TimeBlockSlot['kind'];
      };
      const out = addTimeBlock(body);
      broadcastEvent('state:updated');
      res.json({ ok: true, ...out });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.delete('/life/timeblocks/:id', (req, res) => {
    updateState((s) => {
      s.timeBlocks = (s.timeBlocks || []).filter((t) => t.id !== req.params.id);
    });
    broadcastEvent('state:updated');
    res.json({ ok: true });
  });

  router.post('/life/checklists/:clId/items/:itemId/toggle', (req, res) => {
    try {
      const checklist = toggleChecklistItem(req.params.clId, req.params.itemId);
      broadcastEvent('state:updated');
      res.json({ ok: true, checklist });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/life/wellness', (req, res) => {
    try {
      const entry = logWellnessCheckin(req.body || {});
      broadcastEvent('state:updated');
      res.json({ ok: true, entry });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post('/life/drafts', (req, res) => {
    try {
      const body = req.body as {
        purpose: string;
        tone?: CommunicationDraft['tone'];
        keyPoints?: string;
      };
      const draft = generateCommunicationDraft(body);
      broadcastEvent('state:updated');
      res.json({ ok: true, draft });
    } catch (err) {
      handleErr(res, err);
    }
  });

  return router;
}
