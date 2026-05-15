import express, { Request, Response } from 'express';
import cors from 'cors';
import compression from 'compression';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { SwarmHealthScorer, ScoringWindow, ScoringEvent } from './scoring/health-scorer';
import { ExecutiveSummaryGenerator } from './analysis/executive-summary';
import { KnowledgeGraphBuilder } from './analysis/knowledge-graph';
import { NarrativeEngine } from './narrative/narrative-engine';
import { OperationalMemory } from './memory/operational-memory';
import { InterventionHandler } from './command/intervention-handler';
import { GovernanceEngine } from './governance/governance-engine';
import { DigitalTwin } from './simulation/digital-twin';
import { TemperamentModeler } from './simulation/temperament-modeler';
import { SelfOptimizer } from './governance/self-optimizer';
import { StrategicAdvisor } from './governance/strategic-advisor';
import { ExecutiveCopilot } from './copilot/executive-copilot';
import { SimulationMutation } from './governance/types';
// ── Phase 7 imports ───────────────────────────────────────────────────────────
import { analyzeEmergentBehavior } from './emergence/emergent-behavior-engine';
import { computeCoherence } from './emergence/coherence-modeler';
import { computeConsciousnessSignal } from './emergence/consciousness-signal';
import { CollectiveMemoryStore } from './memory/collective-memory-graph';
import { evolveOrchestration } from './evolution/orchestration-evolver';
import { runEvolutionaryTwin } from './evolution/evolutionary-twin';
import { buildEvolutionPlan } from './evolution/long-horizon-advisor';
import { decideEcosystem } from './ecosystem/ecosystem-governor';
import { SwarmEcosystemState } from './emergence/types';
// ── Phase 8 imports ───────────────────────────────────────────────────────────
import { evolveGovernancePhilosophy, buildGovernanceDoctrine } from './civilization/governance-philosophy-engine';
import { CivilizationalMemoryStore } from './civilization/civilizational-memory';
import { evolveOrganizationalStructure, computeInstitutionFormation, formFederationTreaty } from './civilization/self-structuring-engine';
import { buildMetaStrategicReport } from './civilization/meta-strategic-engine';
import { runCivilizationTwin } from './civilization/civilization-twin';
import { runAutonomousDiscovery } from './civilization/autonomous-discovery-engine';
import { computeCivilizationalConsciousness } from './civilization/civilizational-consciousness';
import { GovernancePhilosophy, OrganizationalStructure } from './civilization/types';
// ── Phase 9 imports ───────────────────────────────────────────────────────────
import { HumanGovernanceLayer } from './integration/human-governance-layer';
import { SafetyConstraintEngine } from './integration/safety-constraint-engine';
import { ExplainabilityEngine } from './integration/explainability-engine';
import { TrustEngine } from './integration/trust-engine';
import { ConstitutionalMemoryStore as ConstitutionalStore } from './integration/constitutional-memory';
import { buildEnterpriseTwin, buildMixedOrganizations } from './integration/enterprise-twin';
// ── Phase 10 imports ──────────────────────────────────────────────────────────
import { computeInteroperability, buildProtocolMessage, scoreCompatibility } from './planetary/intercivilizational-protocol';
import { proposeTreaty, ratifyTreaty, formPlanetaryCouncils, proposeResolution, computeFederatedGovernanceState } from './planetary/federated-governance';
import { buildPlanetaryTwin } from './planetary/planetary-twin';
import { buildResourcePools, orchestrateResources } from './planetary/resource-orchestration';
import { assessPlanetaryRisk } from './planetary/planetary-risk-engine';
import { recommendTreatyKind, conductNegotiation, mediateDispute, computeInterCivTrust } from './planetary/diplomacy-system';
import { computePlanetaryConsciousness } from './planetary/planetary-consciousness';
import { runGlobalStrategicSimulation } from './planetary/global-strategic-simulation';
import { CivilizationProfile, PlanetaryTreaty, PlanetaryCouncil, CouncilResolution } from './planetary/types';

const PORT     = parseInt(process.env.PORT    ?? '3004', 10);
const AUTH_OFF = process.env.AUTH_DISABLED === 'true';

// ── Phase 10 in-memory civilization registry ──────────────────────────────────
const civilizationRegistry = new Map<string, CivilizationProfile>();
const planetaryTreatyStore: PlanetaryTreaty[]      = [];
const planetaryCouncilStore: PlanetaryCouncil[]     = [];
const planetaryResolutionStore: CouncilResolution[] = [];

// ─── Service singletons ───────────────────────────────────────────────────────

const scorer       = new SwarmHealthScorer();
const summarizer   = new ExecutiveSummaryGenerator();
const graphBuilder = new KnowledgeGraphBuilder();
const narrative    = new NarrativeEngine();
const memory       = new OperationalMemory();
const intervention = new InterventionHandler(
  process.env.RELAY_WS_URL ?? 'ws://localhost:3001'
);
const governance   = new GovernanceEngine();
const twin         = new DigitalTwin();
const temperament  = new TemperamentModeler();
const optimizer    = new SelfOptimizer();
const advisor      = new StrategicAdvisor();
const copilot      = new ExecutiveCopilot();
// Phase 7 singletons
const collectiveMemory = new CollectiveMemoryStore(
  process.env.MEMORY_DB_PATH ?? '/data/memory.db',
);
// Phase 8 singletons
const civilizationalMemory = new CivilizationalMemoryStore(
  process.env.CIVILIZATION_DB_PATH ?? '/data/civilization.db',
);
let currentPhilosophy: GovernancePhilosophy | null = null;
let currentStructure: OrganizationalStructure | null = null;
let philosophyGeneration = 0;
// Phase 9 singletons
const humanGovernance   = new HumanGovernanceLayer(
  process.env.HUMAN_GOV_DB_PATH ?? '/data/human-governance.db',
);
const safetyEngine      = new SafetyConstraintEngine(
  process.env.SAFETY_DB_PATH ?? '/data/safety.db',
);
const explainability    = new ExplainabilityEngine(
  process.env.EXPLAIN_DB_PATH ?? '/data/explainability.db',
);
const trustEngine       = new TrustEngine(
  process.env.TRUST_DB_PATH ?? '/data/trust.db',
);
const constitutionalMemory = new ConstitutionalStore(
  process.env.CONSTITUTIONAL_DB_PATH ?? '/data/constitutional.db',
);

// ─── Request schemas ──────────────────────────────────────────────────────────

const AnalyzeSchema = z.object({
  swarm_id:       z.string().min(1),
  started_at_ms:  z.number().int(),
  window_start_ms: z.number().int().optional(),
  window_end_ms:   z.number().int().optional(),
  quality_score:  z.number().optional(),
  is_complete:    z.boolean().optional().default(false),
  events: z.array(z.object({
    id:          z.string(),
    event_type:  z.string(),
    agent_id:    z.string(),
    zone_id:     z.string().default('unknown'),
    offset_ms:   z.number().int(),
    priority:    z.number().int().min(0).max(4).default(2),
    data:        z.record(z.unknown()).default({}),
  })),
});

const InterventionSchema = z.object({
  kind:      z.enum(['pause_swarm','isolate_agent','reroute_task','reset_agent','drain_zone','emergency_stop']),
  target_id: z.string().min(1),
  issued_by: z.string().min(1),
  reason:    z.string().min(1),
  payload:   z.record(z.unknown()).optional().default({}),
});

// ─── App ──────────────────────────────────────────────────────────────────────

export function createServer() {
  const app = express();
  app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*' }));
  app.use(compression());
  app.use(express.json({ limit: '20mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'intelligence-service', ts: Date.now() });
  });

  // ── POST /analyze — full health + incident + bottleneck + summary ─────────

  app.post('/analyze', (req: Request, res: Response): void => {
    const parsed = AnalyzeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const p = parsed.data;
    const now = Date.now();
    const window: ScoringWindow = {
      swarm_id:        p.swarm_id,
      started_at_ms:   p.started_at_ms,
      window_start_ms: p.window_start_ms ?? p.started_at_ms,
      window_end_ms:   p.window_end_ms ?? now,
      events:          p.events as ScoringEvent[],
    };

    const health   = scorer.score(window);
    const summary  = summarizer.generate(window, health, p.quality_score ?? null, p.is_complete ?? false);
    const graph    = graphBuilder.build(window);
    const elapsedMs = now - p.started_at_ms;
    const narrativeState = narrative.compute(window, health, elapsedMs);

    if (p.is_complete) {
      memory.record(health, p.quality_score ?? null);
    }

    res.json({ health, summary, graph, narrative: narrativeState });
  });

  // ── POST /analyze/health-only — lightweight scoring ───────────────────────

  app.post('/analyze/health', (req: Request, res: Response): void => {
    const parsed = AnalyzeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }
    const p = parsed.data;
    const window: ScoringWindow = {
      swarm_id:        p.swarm_id,
      started_at_ms:   p.started_at_ms,
      window_start_ms: p.window_start_ms ?? p.started_at_ms,
      window_end_ms:   p.window_end_ms   ?? Date.now(),
      events:          p.events as ScoringEvent[],
    };
    res.json(scorer.score(window));
  });

  // ── POST /analyze/narrative — narrative state for CinematicDirector ───────

  app.post('/analyze/narrative', (req: Request, res: Response): void => {
    const parsed = AnalyzeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }
    const p = parsed.data;
    const window: ScoringWindow = {
      swarm_id:        p.swarm_id,
      started_at_ms:   p.started_at_ms,
      window_start_ms: p.window_start_ms ?? p.started_at_ms,
      window_end_ms:   p.window_end_ms   ?? Date.now(),
      events:          p.events as ScoringEvent[],
    };
    const health = scorer.score(window);
    const elapsedMs = Date.now() - p.started_at_ms;
    res.json(narrative.compute(window, health, elapsedMs));
  });

  // ── GET /memory/history — historical swarm performance ────────────────────

  app.get('/memory/history', (req: Request, res: Response): void => {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    res.json({ history: memory.getHistory(limit) });
  });

  // ── GET /memory/trends — operational trend analysis ───────────────────────

  app.get('/memory/trends', (req: Request, res: Response): void => {
    const windowSize = Math.min(Number(req.query.window ?? 10), 50);
    res.json({ trends: memory.computeTrends(windowSize) });
  });

  // ── GET /memory/patterns — recurring anomaly patterns ────────────────────

  app.get('/memory/patterns', (_req: Request, res: Response): void => {
    res.json({ patterns: memory.findRecurringPatterns() });
  });

  // ── POST /command/intervene — AI operations command ───────────────────────

  app.post('/command/intervene', async (req: Request, res: Response): Promise<void> => {
    const parsed = InterventionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid command', details: parsed.error.issues });
      return;
    }
    const p = parsed.data;
    const result = await intervention.issue(
      p.kind, p.target_id, p.issued_by, p.reason, p.payload
    );
    res.status(result.accepted ? 200 : 502).json(result);
  });

  app.get('/command/pending', (_req: Request, res: Response): void => {
    res.json({ pending: intervention.getPending() });
  });

  // ── POST /governance/decide — autonomous governance decision ─────────────

  app.post('/governance/decide', (req: Request, res: Response): void => {
    const parsed = AnalyzeSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const p = parsed.data;
    const window: ScoringWindow = {
      swarm_id:        p.swarm_id,
      started_at_ms:   p.started_at_ms,
      window_start_ms: p.window_start_ms ?? p.started_at_ms,
      window_end_ms:   p.window_end_ms ?? Date.now(),
      events:          p.events as ScoringEvent[],
    };
    const health   = scorer.score(window);
    const decision = governance.decide(health);
    res.json(decision);
  });

  // ── GET /governance/policies — active retry + throttle policies ───────────

  app.get('/governance/policies', (_req: Request, res: Response): void => {
    res.json({
      retry:    governance.getActiveRetryPolicies(),
      throttle: governance.getActiveThrottlePolicies(),
    });
  });

  // ── POST /simulate/branch — digital twin branch creation ─────────────────

  const BranchSchema = z.object({
    baseline:  AnalyzeSchema,
    mutations: z.array(z.object({
      kind:                    z.string(),
      target_id:               z.string(),
      parameters:              z.record(z.unknown()).default({}),
      applied_at_offset_ms:    z.number().int().default(0),
    })),
    label: z.string().default('unnamed branch'),
  });

  app.post('/simulate/branch', (req: Request, res: Response): void => {
    const parsed = BranchSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.issues }); return; }
    const { baseline: b, mutations, label } = parsed.data;
    const window: ScoringWindow = {
      swarm_id:        b.swarm_id,
      started_at_ms:   b.started_at_ms,
      window_start_ms: b.window_start_ms ?? b.started_at_ms,
      window_end_ms:   b.window_end_ms ?? Date.now(),
      events:          b.events as ScoringEvent[],
    };
    const branch = twin.createBranch(window, mutations as SimulationMutation[], label);
    const result = twin.simulate(window, branch);
    res.json({ branch, result });
  });

  // ── GET /simulate/temperament/:swarm_prefix — swarm temperament model ─────

  app.get('/simulate/temperament/:swarm_prefix', (req: Request, res: Response): void => {
    const history = memory.getHistory(100);
    const model   = temperament.compute(req.params.swarm_prefix, history);
    res.json(model);
  });

  // ── GET /optimize/learnings — self-optimization suggestions ──────────────

  app.get('/optimize/learnings', (_req: Request, res: Response): void => {
    const history = memory.getHistory(50);
    const trends  = memory.computeTrends(10);
    const policies = governance.getActiveRetryPolicies();
    const learnings = optimizer.computeLearnings(history, trends, policies);
    res.json({ learnings });
  });

  // ── GET /strategy/recommend — strategic advisor ───────────────────────────

  app.post('/strategy/recommend', (req: Request, res: Response): void => {
    const parsed = AnalyzeSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const p = parsed.data;
    const window: ScoringWindow = {
      swarm_id:        p.swarm_id,
      started_at_ms:   p.started_at_ms,
      window_start_ms: p.window_start_ms ?? p.started_at_ms,
      window_end_ms:   p.window_end_ms ?? Date.now(),
      events:          p.events as ScoringEvent[],
    };
    const health = scorer.score(window);
    const history = memory.getHistory(50);
    const trends  = memory.computeTrends(10);
    const temp    = temperament.compute(p.swarm_id, history);
    const recs    = advisor.advise(health, history, trends, temp);
    res.json({ recommendations: recs, temperament: temp });
  });

  // ── POST /copilot/query — executive copilot ───────────────────────────────

  const CopilotSchema = z.object({
    query_id:  z.string().default(() => uuidv4()),
    text:      z.string().min(1),
    intent:    z.string().optional(),
    swarm_id:  z.string().nullable().default(null),
    context:   z.record(z.unknown()).default({}),
    // Optionally pass current health snapshot inline
    events:    z.array(z.any()).optional(),
    started_at_ms: z.number().optional(),
  });

  app.post('/copilot/query', (req: Request, res: Response): void => {
    const parsed = CopilotSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }

    const q = parsed.data;
    const history = memory.getHistory(50);
    const trends  = memory.computeTrends(10);

    let health = null;
    let summaryObj = null;

    if (q.events && q.events.length > 0 && q.started_at_ms) {
      const window: ScoringWindow = {
        swarm_id:        q.swarm_id ?? 'unknown',
        started_at_ms:   q.started_at_ms,
        window_start_ms: q.started_at_ms,
        window_end_ms:   Date.now(),
        events:          q.events as ScoringEvent[],
      };
      health = scorer.score(window);
      summaryObj = summarizer.generate(window, health, null, false);
    }

    const temp = q.swarm_id ? temperament.compute(q.swarm_id, history) : null;
    const recs  = health ? advisor.advise(health, history, trends, temp) : [];

    const response = copilot.answer(
      {
        query_id: q.query_id,
        text:     q.text,
        intent:   q.intent as any,
        swarm_id: q.swarm_id,
        context:  q.context,
      },
      health,
      history,
      trends,
      summaryObj,
      temp,
      recs
    );

    res.json(response);
  });

  // ── POST /emergence/analyze — emergent behavior engine ───────────────────

  app.post('/emergence/analyze', (req: Request, res: Response): void => {
    const parsed = AnalyzeSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const p = parsed.data;
    const windowMs = (p.window_end_ms ?? Date.now()) - (p.window_start_ms ?? p.started_at_ms);
    const emergent = analyzeEmergentBehavior(
      p.swarm_id, p.events as ScoringEvent[], windowMs,
    );
    res.json(emergent);
  });

  // ── POST /emergence/coherence — swarm coherence model ────────────────────

  app.post('/emergence/coherence', (req: Request, res: Response): void => {
    const parsed = AnalyzeSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const p = parsed.data;
    const window: ScoringWindow = {
      swarm_id:        p.swarm_id,
      started_at_ms:   p.started_at_ms,
      window_start_ms: p.window_start_ms ?? p.started_at_ms,
      window_end_ms:   p.window_end_ms ?? Date.now(),
      events:          p.events as ScoringEvent[],
    };
    const health  = scorer.score(window);
    const hist    = memory.getHistory(20).map(r => r.overall_health);
    const coherenceReport = computeCoherence(p.swarm_id, p.events as ScoringEvent[], health, hist);
    res.json(coherenceReport);
  });

  // ── POST /emergence/consciousness — collective consciousness signal ────────

  app.post('/emergence/consciousness', (req: Request, res: Response): void => {
    const parsed = AnalyzeSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const p = parsed.data;
    const window: ScoringWindow = {
      swarm_id:        p.swarm_id,
      started_at_ms:   p.started_at_ms,
      window_start_ms: p.window_start_ms ?? p.started_at_ms,
      window_end_ms:   p.window_end_ms ?? Date.now(),
      events:          p.events as ScoringEvent[],
    };
    const health   = scorer.score(window);
    const hist     = memory.getHistory(20).map(r => r.overall_health);
    const windowMs = window.window_end_ms - window.window_start_ms;
    const emergent = analyzeEmergentBehavior(p.swarm_id, p.events as ScoringEvent[], windowMs);
    const coh      = computeCoherence(p.swarm_id, p.events as ScoringEvent[], health, hist);
    const gen      = Number(req.query.evolution_generation ?? 0);
    res.json(computeConsciousnessSignal(p.swarm_id, health, emergent, coh, gen));
  });

  // ── POST /evolution/evolve — orchestration darwinism ─────────────────────

  app.post('/evolution/evolve', (req: Request, res: Response): void => {
    const parsed = AnalyzeSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const p = parsed.data;
    const windowMs = (p.window_end_ms ?? Date.now()) - (p.window_start_ms ?? p.started_at_ms);
    const result = evolveOrchestration(p.swarm_id, p.events as ScoringEvent[], windowMs);
    res.json(result);
  });

  // ── POST /evolution/twin — evolutionary digital twin ─────────────────────

  app.post('/evolution/twin', (req: Request, res: Response): void => {
    const schema = AnalyzeSchema.extend({
      horizon_ms: z.number().int().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const p = parsed.data;
    const result = runEvolutionaryTwin(
      p.swarm_id, p.events as ScoringEvent[], p.horizon_ms ?? 120_000,
    );
    res.json(result);
  });

  // ── POST /evolution/plan — long-horizon strategic evolution plan ──────────

  app.post('/evolution/plan', (req: Request, res: Response): void => {
    const parsed = AnalyzeSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const p = parsed.data;
    const window: ScoringWindow = {
      swarm_id:        p.swarm_id,
      started_at_ms:   p.started_at_ms,
      window_start_ms: p.window_start_ms ?? p.started_at_ms,
      window_end_ms:   p.window_end_ms ?? Date.now(),
      events:          p.events as ScoringEvent[],
    };
    const health   = scorer.score(window);
    const hist     = memory.getHistory(20).map(r => r.overall_health);
    const windowMs = window.window_end_ms - window.window_start_ms;
    const emergent = analyzeEmergentBehavior(p.swarm_id, p.events as ScoringEvent[], windowMs);
    const coh      = computeCoherence(p.swarm_id, p.events as ScoringEvent[], health, hist);
    const plan     = buildEvolutionPlan(p.swarm_id, health, emergent, coh, memory, p.events as ScoringEvent[]);
    res.json(plan);
  });

  // ── POST /ecosystem/decide — multi-swarm ecosystem governance ────────────

  const EcosystemSchema = z.object({
    swarms: z.array(z.object({
      swarm_id:      z.string(),
      health:        z.number(),
      load:          z.number().default(0.5),
      anomaly_rate:  z.number().default(0),
      specialization: z.string().default('generalist'),
      is_overloaded: z.boolean().default(false),
      is_degraded:   z.boolean().default(false),
    })),
  });

  app.post('/ecosystem/decide', (req: Request, res: Response): void => {
    const parsed = EcosystemSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const decision = decideEcosystem(parsed.data.swarms as SwarmEcosystemState[]);
    res.json(decision);
  });

  // ── POST /collective/ingest — record session into collective memory ────────

  app.post('/collective/ingest', (req: Request, res: Response): void => {
    const schema = AnalyzeSchema.extend({ session_id: z.string().default(() => uuidv4()) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const p = parsed.data;
    const window: ScoringWindow = {
      swarm_id:        p.swarm_id,
      started_at_ms:   p.started_at_ms,
      window_start_ms: p.window_start_ms ?? p.started_at_ms,
      window_end_ms:   p.window_end_ms ?? Date.now(),
      events:          p.events as ScoringEvent[],
    };
    const health = scorer.score(window);
    collectiveMemory.ingestSession(p.swarm_id, p.session_id, p.events as ScoringEvent[], health);
    res.json({ status: 'ingested', swarm_id: p.swarm_id, session_id: p.session_id });
  });

  // ── GET /collective/graph — collective memory graph ───────────────────────

  app.get('/collective/graph', (req: Request, res: Response): void => {
    const swarmId = req.query.swarm_id as string | undefined;
    res.json(collectiveMemory.getGraph(swarmId));
  });

  // ── POST /collective/transfer — cross-swarm knowledge transfer ───────────

  app.post('/collective/transfer', (req: Request, res: Response): void => {
    const schema = z.object({
      from_swarm: z.string().min(1),
      to_swarm:   z.string().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const transfers = collectiveMemory.transferTo(parsed.data.from_swarm, parsed.data.to_swarm);
    res.json({ transfers });
  });

  // ── POST /civilization/philosophy — evolve governance philosophy ──────────

  app.post('/civilization/philosophy', (req: Request, res: Response): void => {
    const parsed = AnalyzeSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const p = parsed.data;
    const window: ScoringWindow = {
      swarm_id: p.swarm_id, started_at_ms: p.started_at_ms,
      window_start_ms: p.window_start_ms ?? p.started_at_ms,
      window_end_ms: p.window_end_ms ?? Date.now(), events: p.events as ScoringEvent[],
    };
    const health   = scorer.score(window);
    const hist     = memory.getHistory(20).map(r => r.overall_health);
    const windowMs = window.window_end_ms - window.window_start_ms;
    const emergent = analyzeEmergentBehavior(p.swarm_id, p.events as ScoringEvent[], windowMs);
    const coh      = computeCoherence(p.swarm_id, p.events as ScoringEvent[], health, hist);
    philosophyGeneration++;
    const result = evolveGovernancePhilosophy(
      p.swarm_id, health, emergent, coh, currentPhilosophy, philosophyGeneration,
    );
    currentPhilosophy = result.dominant_philosophy;
    res.json(result);
  });

  // ── GET /civilization/doctrine — get current governance doctrine ───────────

  app.get('/civilization/doctrine', (req: Request, res: Response): void => {
    const swarmId = (req.query.swarm_id as string) ?? 'default';
    if (!currentPhilosophy) {
      res.status(404).json({ error: 'No philosophy evolved yet — call /civilization/philosophy first' });
      return;
    }
    const doctrine = buildGovernanceDoctrine(swarmId, currentPhilosophy, {
      swarm_id: swarmId, computed_at_ms: Date.now(),
      harmony: 0.60, collective_stress: 0.30, coordination_entropy: 0.35,
      synchronization_quality: 0.65, operational_cohesion: 0.60, systemic_resilience: 0.55,
      coherence_label: 'stressed', dominant_stressor: null, recommendations: [],
    }, Date.now() - 60_000);
    res.json(doctrine);
  });

  // ── POST /civilization/memory/record — record health snapshot to civilizational memory ──

  app.post('/civilization/memory/record', (req: Request, res: Response): void => {
    const schema = AnalyzeSchema.extend({
      key_event: z.string().optional(),
      ideology:  z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const p = parsed.data;
    const window: ScoringWindow = {
      swarm_id: p.swarm_id, started_at_ms: p.started_at_ms,
      window_start_ms: p.window_start_ms ?? p.started_at_ms,
      window_end_ms: p.window_end_ms ?? Date.now(), events: p.events as ScoringEvent[],
    };
    const health    = scorer.score(window);
    const ideology  = (p.ideology as GovernancePhilosophy['ideology']) ??
                      currentPhilosophy?.ideology ?? 'federated_republic';
    civilizationalMemory.recordHealthSnapshot(p.swarm_id, health, ideology, p.key_event ?? null);
    res.json({ status: 'recorded', swarm_id: p.swarm_id });
  });

  // ── GET /civilization/memory — get civilizational memory state ────────────

  app.get('/civilization/memory', (req: Request, res: Response): void => {
    const swarmId = (req.query.swarm_id as string) ?? 'default';
    res.json(civilizationalMemory.getMemoryState(swarmId));
  });

  // ── POST /civilization/structure — evolve organizational structure ─────────

  app.post('/civilization/structure', (req: Request, res: Response): void => {
    const parsed = AnalyzeSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const p = parsed.data;
    const window: ScoringWindow = {
      swarm_id: p.swarm_id, started_at_ms: p.started_at_ms,
      window_start_ms: p.window_start_ms ?? p.started_at_ms,
      window_end_ms: p.window_end_ms ?? Date.now(), events: p.events as ScoringEvent[],
    };
    const health   = scorer.score(window);
    const hist     = memory.getHistory(20).map(r => r.overall_health);
    const windowMs = window.window_end_ms - window.window_start_ms;
    const emergent = analyzeEmergentBehavior(p.swarm_id, p.events as ScoringEvent[], windowMs);
    const coh      = computeCoherence(p.swarm_id, p.events as ScoringEvent[], health, hist);
    const doctrine = currentPhilosophy
      ? buildGovernanceDoctrine(p.swarm_id, currentPhilosophy, coh, Date.now() - 60_000)
      : null;
    const result = evolveOrganizationalStructure(
      p.swarm_id, p.events as ScoringEvent[], health, emergent, doctrine, currentStructure,
    );
    currentStructure = result.new_structure;
    res.json(result);
  });

  // ── POST /civilization/institutions — compute institution formation ─────────

  app.post('/civilization/institutions', (req: Request, res: Response): void => {
    const parsed = AnalyzeSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const p = parsed.data;
    const window: ScoringWindow = {
      swarm_id: p.swarm_id, started_at_ms: p.started_at_ms,
      window_start_ms: p.window_start_ms ?? p.started_at_ms,
      window_end_ms: p.window_end_ms ?? Date.now(), events: p.events as ScoringEvent[],
    };
    const health   = scorer.score(window);
    const hist     = memory.getHistory(20).map(r => r.overall_health);
    const windowMs = window.window_end_ms - window.window_start_ms;
    const emergent = analyzeEmergentBehavior(p.swarm_id, p.events as ScoringEvent[], windowMs);
    const existing = currentStructure?.active_institutions ?? [];
    const result   = computeInstitutionFormation(p.swarm_id, health, emergent, existing);
    if (currentStructure) {
      currentStructure = {
        ...currentStructure,
        active_institutions: [
          ...existing.filter(i => !result.dissolved_institutions.includes(i.institution_id)),
          ...result.new_institutions,
        ],
      };
    }
    res.json(result);
  });

  // ── POST /civilization/federation — form federation treaty ────────────────

  app.post('/civilization/federation', (req: Request, res: Response): void => {
    const FederationSchema = z.object({
      swarm_ids:   z.array(z.string().min(1)).min(2),
      treaty_kind: z.enum(['resource_sharing','mutual_defense','knowledge_exchange','joint_governance']),
      health_map:  z.record(z.number()).optional(),
    });
    const parsed = FederationSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const p = parsed.data;
    const hMap = new Map<string, number>(Object.entries(p.health_map ?? {}));
    const treaty = formFederationTreaty(p.swarm_ids, p.treaty_kind, hMap);
    res.json(treaty);
  });

  // ── POST /civilization/meta — meta-strategic report ──────────────────────

  app.post('/civilization/meta', (req: Request, res: Response): void => {
    const schema = AnalyzeSchema.extend({ include_evolution: z.boolean().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const p = parsed.data;
    const window: ScoringWindow = {
      swarm_id: p.swarm_id, started_at_ms: p.started_at_ms,
      window_start_ms: p.window_start_ms ?? p.started_at_ms,
      window_end_ms: p.window_end_ms ?? Date.now(), events: p.events as ScoringEvent[],
    };
    const health   = scorer.score(window);
    const hist     = memory.getHistory(20).map(r => r.overall_health);
    const windowMs = window.window_end_ms - window.window_start_ms;
    const emergent = analyzeEmergentBehavior(p.swarm_id, p.events as ScoringEvent[], windowMs);
    const coh      = computeCoherence(p.swarm_id, p.events as ScoringEvent[], health, hist);
    const civMem   = civilizationalMemory.getMemoryState(p.swarm_id);
    const evo      = p.include_evolution
      ? evolveOrchestration(p.swarm_id, p.events as ScoringEvent[], windowMs)
      : null;
    const report   = buildMetaStrategicReport(p.swarm_id, health, emergent, coh, civMem, evo, currentPhilosophy);
    res.json(report);
  });

  // ── POST /civilization/twin — civilization-scale digital twin ─────────────

  app.post('/civilization/twin', (req: Request, res: Response): void => {
    const schema = AnalyzeSchema.extend({
      horizon: z.enum(['decade','generation','epoch']).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const p = parsed.data;
    const window: ScoringWindow = {
      swarm_id: p.swarm_id, started_at_ms: p.started_at_ms,
      window_start_ms: p.window_start_ms ?? p.started_at_ms,
      window_end_ms: p.window_end_ms ?? Date.now(), events: p.events as ScoringEvent[],
    };
    const health   = scorer.score(window);
    const hist     = memory.getHistory(20).map(r => r.overall_health);
    const windowMs = window.window_end_ms - window.window_start_ms;
    const emergent = analyzeEmergentBehavior(p.swarm_id, p.events as ScoringEvent[], windowMs);
    const coh      = computeCoherence(p.swarm_id, p.events as ScoringEvent[], health, hist);
    const civMem   = civilizationalMemory.getMemoryState(p.swarm_id);
    const result   = runCivilizationTwin(
      p.swarm_id, health, emergent, coh, civMem, currentPhilosophy,
      p.horizon ?? 'generation',
    );
    res.json(result);
  });

  // ── POST /civilization/discover — autonomous discovery engine ─────────────

  app.post('/civilization/discover', (req: Request, res: Response): void => {
    const parsed = AnalyzeSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const p = parsed.data;
    const window: ScoringWindow = {
      swarm_id: p.swarm_id, started_at_ms: p.started_at_ms,
      window_start_ms: p.window_start_ms ?? p.started_at_ms,
      window_end_ms: p.window_end_ms ?? Date.now(), events: p.events as ScoringEvent[],
    };
    const health   = scorer.score(window);
    const hist     = memory.getHistory(20).map(r => r.overall_health);
    const windowMs = window.window_end_ms - window.window_start_ms;
    const emergent = analyzeEmergentBehavior(p.swarm_id, p.events as ScoringEvent[], windowMs);
    const coh      = computeCoherence(p.swarm_id, p.events as ScoringEvent[], health, hist);
    const civMem   = civilizationalMemory.getMemoryState(p.swarm_id);
    const evo      = evolveOrchestration(p.swarm_id, p.events as ScoringEvent[], windowMs);
    const report   = runAutonomousDiscovery(
      p.swarm_id, p.events as ScoringEvent[], health, emergent, coh, evo, civMem,
    );
    res.json(report);
  });

  // ── POST /civilization/consciousness — civilizational consciousness signal ─

  app.post('/civilization/consciousness', (req: Request, res: Response): void => {
    const parsed = AnalyzeSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const p = parsed.data;
    const window: ScoringWindow = {
      swarm_id: p.swarm_id, started_at_ms: p.started_at_ms,
      window_start_ms: p.window_start_ms ?? p.started_at_ms,
      window_end_ms: p.window_end_ms ?? Date.now(), events: p.events as ScoringEvent[],
    };
    const health   = scorer.score(window);
    const hist     = memory.getHistory(20).map(r => r.overall_health);
    const windowMs = window.window_end_ms - window.window_start_ms;
    const emergent = analyzeEmergentBehavior(p.swarm_id, p.events as ScoringEvent[], windowMs);
    const coh      = computeCoherence(p.swarm_id, p.events as ScoringEvent[], health, hist);
    const gen      = Number(req.query.evolution_generation ?? 0);
    const p7Signal = computeConsciousnessSignal(p.swarm_id, health, emergent, coh, gen);
    const civMem   = civilizationalMemory.getMemoryState(p.swarm_id);
    const evo      = evolveOrchestration(p.swarm_id, p.events as ScoringEvent[], windowMs);
    const metaRep  = buildMetaStrategicReport(p.swarm_id, health, emergent, coh, civMem, evo, currentPhilosophy);
    const signal   = computeCivilizationalConsciousness(
      p.swarm_id, health, emergent, coh, evo, metaRep, civMem, currentPhilosophy, p7Signal,
    );
    res.json(signal);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 9 — Reality Integration + Human–Civilization Coevolution
  // ═══════════════════════════════════════════════════════════════════════════

  // ── POST /governance/request — request human approval for an action ────────

  app.post('/governance/request', (req: Request, res: Response): void => {
    const schema = z.object({
      swarm_id:     z.string().min(1),
      action_kind:  z.string().min(1),
      rationale:    z.string().min(1),
      proposed_by:  z.string().default('system'),
      ttl_ms:       z.number().int().optional(),
    }).merge(AnalyzeSchema.pick({ started_at_ms: true, events: true }));
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const p = parsed.data;
    const window: ScoringWindow = {
      swarm_id: p.swarm_id, started_at_ms: p.started_at_ms,
      window_start_ms: p.started_at_ms, window_end_ms: Date.now(),
      events: p.events as ScoringEvent[],
    };
    const health = scorer.score(window);
    const request = humanGovernance.requestApproval(
      p.swarm_id, p.action_kind, p.rationale, p.proposed_by, health, p.ttl_ms,
    );
    // Auto-explain if requires_human
    if (request.requires_human) {
      const hist = memory.getHistory(20).map(r => r.overall_health);
      const coh  = computeCoherence(p.swarm_id, p.events as ScoringEvent[], health, hist);
      explainability.explainIntervention(p.swarm_id, p.action_kind, health, coh, p.proposed_by);
    }
    res.json(request);
  });

  // ── POST /governance/review — operator approves or vetoes a request ────────

  app.post('/governance/review', (req: Request, res: Response): void => {
    const schema = z.object({
      request_id:  z.string().min(1),
      operator_id: z.string().min(1),
      decision:    z.enum(['approved', 'vetoed']),
      note:        z.string().default(''),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const p = parsed.data;
    const result = humanGovernance.reviewApproval(p.request_id, p.operator_id, p.decision, p.note);
    if (!result) { res.status(404).json({ error: 'Request not found' }); return; }
    const consensus = humanGovernance.computeConsensus(p.request_id);
    res.json({ approval: result, consensus });
  });

  // ── GET /governance/pending — list pending approvals ──────────────────────

  app.get('/governance/pending', (req: Request, res: Response): void => {
    const swarmId = req.query.swarm_id as string | undefined;
    res.json({ pending: humanGovernance.getPendingApprovals(swarmId) });
  });

  // ── POST /governance/intervene — record a human intervention ──────────────

  app.post('/governance/intervene', (req: Request, res: Response): void => {
    const schema = z.object({
      operator_id:   z.string().min(1),
      swarm_id:      z.string().min(1),
      kind:          z.enum(['override','veto','approval','escalation','emergency_halt']),
      target_action: z.string().min(1),
      reason:        z.string().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const p = parsed.data;
    const rec = humanGovernance.recordIntervention(
      p.operator_id, p.swarm_id, p.kind, p.target_action, p.reason,
    );
    constitutionalMemory.enactPolicy(
      p.swarm_id,
      `Human ${p.kind}: ${p.target_action}`,
      p.reason,
      'override',
      p.operator_id,
    );
    res.json(rec);
  });

  // ── GET /governance/operators — list human operators ─────────────────────

  app.get('/governance/operators', (_req: Request, res: Response): void => {
    res.json({ operators: humanGovernance.getOperators() });
  });

  // ── POST /governance/operators — upsert a human operator ─────────────────

  app.post('/governance/operators', (req: Request, res: Response): void => {
    const schema = z.object({
      operator_id:   z.string().min(1),
      name:          z.string().min(1),
      role:          z.enum(['executive','operator','auditor','strategic_advisor','emergency_officer']),
      trust_score:   z.number().min(0).max(1).default(0.70),
      active_since_ms: z.number().int().optional(),
      approval_rate: z.number().min(0).max(1).default(0.80),
      veto_rate:     z.number().min(0).max(1).default(0.05),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const p = parsed.data;
    humanGovernance.upsertOperator({ ...p, active_since_ms: p.active_since_ms ?? Date.now() });
    res.json({ status: 'ok', operator_id: p.operator_id });
  });

  // ── POST /safety/evaluate — evaluate an action against safety constraints ──

  app.post('/safety/evaluate', (req: Request, res: Response): void => {
    const schema = z.object({
      swarm_id:        z.string().min(1),
      proposed_action: z.string().min(1),
      context:         z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
    }).merge(AnalyzeSchema.pick({ started_at_ms: true, events: true }));
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const p = parsed.data;
    const window: ScoringWindow = {
      swarm_id: p.swarm_id, started_at_ms: p.started_at_ms,
      window_start_ms: p.started_at_ms, window_end_ms: Date.now(),
      events: p.events as ScoringEvent[],
    };
    const health = scorer.score(window);
    const result = safetyEngine.evaluate(p.swarm_id, p.proposed_action, health, p.context ?? {});
    res.json(result);
  });

  // ── GET /safety/constraints — list active safety constraints ──────────────

  app.get('/safety/constraints', (_req: Request, res: Response): void => {
    res.json({ constraints: safetyEngine.getActiveConstraints() });
  });

  // ── POST /safety/constraints — add a new safety constraint ────────────────

  app.post('/safety/constraints', (req: Request, res: Response): void => {
    const schema = z.object({
      kind:        z.enum(['hard_limit','soft_guardrail','escalation_trigger','irreversibility_gate','ethical_boundary']),
      name:        z.string().min(1),
      description: z.string().min(1),
      applies_to:  z.array(z.string()).min(1),
      threshold:   z.number().optional(),
      enforced_by: z.enum(['system','operator_id']).default('system'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const constraint = safetyEngine.addConstraint({ ...parsed.data, active: true, threshold: parsed.data.threshold ?? null });
    res.json(constraint);
  });

  // ── GET /safety/violations — list safety violations ───────────────────────

  app.get('/safety/violations', (req: Request, res: Response): void => {
    const swarmId = req.query.swarm_id as string | undefined;
    res.json({ violations: safetyEngine.getViolations(swarmId) });
  });

  // ── POST /explain/intervention — explain a governance intervention ─────────

  app.post('/explain/intervention', (req: Request, res: Response): void => {
    const schema = AnalyzeSchema.extend({
      action_kind:    z.string().min(1),
      decision_maker: z.string().default('system'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const p = parsed.data;
    const window: ScoringWindow = {
      swarm_id: p.swarm_id, started_at_ms: p.started_at_ms,
      window_start_ms: p.window_start_ms ?? p.started_at_ms,
      window_end_ms: p.window_end_ms ?? Date.now(), events: p.events as ScoringEvent[],
    };
    const health = scorer.score(window);
    const hist   = memory.getHistory(20).map(r => r.overall_health);
    const coh    = computeCoherence(p.swarm_id, p.events as ScoringEvent[], health, hist);
    const entry  = explainability.explainIntervention(p.swarm_id, p.action_kind, health, coh, p.decision_maker);
    res.json(entry);
  });

  // ── GET /explain/lineage — governance lineage for a swarm ─────────────────

  app.get('/explain/lineage', (req: Request, res: Response): void => {
    const swarmId = req.query.swarm_id as string ?? 'default';
    res.json(explainability.getTimeline(swarmId));
  });

  // ── GET /explain/report — full explainability report ─────────────────────

  app.get('/explain/report', (req: Request, res: Response): void => {
    const swarmId = req.query.swarm_id as string ?? 'default';
    res.json(explainability.generateReport(swarmId));
  });

  // ── GET /trust/report — operator trust report ─────────────────────────────

  app.get('/trust/report', (req: Request, res: Response): void => {
    const swarmId = req.query.swarm_id as string ?? 'default';
    res.json(trustEngine.generateReport(swarmId, humanGovernance));
  });

  // ── GET /trust/operator — single operator trust profile ───────────────────

  app.get('/trust/operator', (req: Request, res: Response): void => {
    const operatorId = req.query.operator_id as string;
    const swarmId    = req.query.swarm_id as string ?? 'default';
    if (!operatorId) { res.status(400).json({ error: 'operator_id required' }); return; }
    res.json(trustEngine.computeProfile(operatorId, swarmId, humanGovernance));
  });

  // ── GET /constitutional/state — constitutional memory state ───────────────

  app.get('/constitutional/state', (req: Request, res: Response): void => {
    const swarmId = req.query.swarm_id as string ?? 'default';
    res.json(constitutionalMemory.getState(swarmId));
  });

  // ── POST /constitutional/policy — enact a policy ─────────────────────────

  app.post('/constitutional/policy', (req: Request, res: Response): void => {
    const schema = z.object({
      swarm_id:      z.string().min(1),
      title:         z.string().min(1),
      body:          z.string().min(1),
      kind:          z.enum(['rule','amendment','precedent','override','veto_record']),
      enacted_by:    z.string().default('system'),
      supersedes_id: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const p = parsed.data;
    const policy = constitutionalMemory.enactPolicy(
      p.swarm_id, p.title, p.body, p.kind, p.enacted_by, p.supersedes_id ?? null,
    );
    res.json(policy);
  });

  // ── POST /constitutional/amend — propose a constitutional amendment ────────

  app.post('/constitutional/amend', (req: Request, res: Response): void => {
    const schema = z.object({
      swarm_id:    z.string().min(1),
      proposed_by: z.string().min(1),
      rationale:   z.string().min(1),
      old_rule:    z.string().min(1),
      new_rule:    z.string().min(1),
      approved_by: z.array(z.string()).default([]),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const p = parsed.data;
    const amendment = constitutionalMemory.proposeAmendment(
      p.swarm_id, p.proposed_by, p.rationale, p.old_rule, p.new_rule, p.approved_by,
    );
    // Record explanation
    explainability.explainInstitutionFormation(
      p.swarm_id,
      [`Constitutional Amendment: ${p.old_rule.slice(0, 40)}→${p.new_rule.slice(0, 40)}`],
      [p.rationale],
      p.proposed_by,
    );
    res.json(amendment);
  });

  // ── POST /integration/enterprise-twin — enterprise digital twin ───────────

  app.post('/integration/enterprise-twin', (req: Request, res: Response): void => {
    const schema = AnalyzeSchema.extend({
      org_name:   z.string().default('SwarmVision Enterprise'),
      swarm_ids:  z.array(z.string()).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const p = parsed.data;
    const window: ScoringWindow = {
      swarm_id: p.swarm_id, started_at_ms: p.started_at_ms,
      window_start_ms: p.window_start_ms ?? p.started_at_ms,
      window_end_ms: p.window_end_ms ?? Date.now(), events: p.events as ScoringEvent[],
    };
    const health   = scorer.score(window);
    const hist     = memory.getHistory(20).map(r => r.overall_health);
    const windowMs = window.window_end_ms - window.window_start_ms;
    const emergent = analyzeEmergentBehavior(p.swarm_id, p.events as ScoringEvent[], windowMs);
    const coh      = computeCoherence(p.swarm_id, p.events as ScoringEvent[], health, hist);
    const civMem   = civilizationalMemory.getMemoryState(p.swarm_id);
    const swarmIds = p.swarm_ids ?? [p.swarm_id];
    const twin     = buildEnterpriseTwin(p.org_name, swarmIds, health, emergent, coh, civMem);
    res.json(twin);
  });

  // ── POST /integration/mixed-orgs — build mixed human/swarm organizations ──

  app.post('/integration/mixed-orgs', (req: Request, res: Response): void => {
    const schema = AnalyzeSchema.extend({
      swarm_ids:    z.array(z.string()).optional(),
      operator_ids: z.array(z.string()).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const p = parsed.data;
    const window: ScoringWindow = {
      swarm_id: p.swarm_id, started_at_ms: p.started_at_ms,
      window_start_ms: p.window_start_ms ?? p.started_at_ms,
      window_end_ms: p.window_end_ms ?? Date.now(), events: p.events as ScoringEvent[],
    };
    const health = scorer.score(window);
    const hist   = memory.getHistory(20).map(r => r.overall_health);
    const coh    = computeCoherence(p.swarm_id, p.events as ScoringEvent[], health, hist);
    const swarmIds    = p.swarm_ids ?? [p.swarm_id];
    const operatorIds = p.operator_ids ?? humanGovernance.getOperators().map(op => op.operator_id);
    const orgs = buildMixedOrganizations(swarmIds, operatorIds, health, coh);
    res.json({ organizations: orgs });
  });

  // ── GET /integration/command-center — strategic command center state ───────

  app.get('/integration/command-center', (req: Request, res: Response): void => {
    const swarmId = req.query.swarm_id as string ?? 'default';
    const pending  = humanGovernance.getPendingApprovals(swarmId);
    const lineage  = explainability.getLineage(swarmId, 5);
    const violations = safetyEngine.getViolations(swarmId, 10);
    const safetyStatus: 'green' | 'yellow' | 'red' | 'black' =
      violations.some(v => v.violation_severity === 'emergency_halt') ? 'black' :
      violations.some(v => v.violation_severity === 'blocked' && !v.resolved) ? 'red' :
      pending.some(p => p.risk_level === 'critical') ? 'yellow' : 'green';
    const operators = humanGovernance.getOperators();
    res.json({
      swarm_ids:               [swarmId],
      active_interventions:    [],
      pending_approvals:       pending,
      recent_decisions:        lineage,
      safety_status:           safetyStatus,
      human_oversight_coverage: Math.min(operators.length * 0.33, 1),
      escalation_queue:        pending.filter(p => p.risk_level === 'critical').map(p => p.request_id),
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 10 — Inter-Civilizational Networks + Planetary Operations
  // ═══════════════════════════════════════════════════════════════════════════

  const CivProfileSchema = z.object({
    civ_id:             z.string().min(1),
    name:               z.string().min(1),
    tier:               z.enum(['nascent','established','advanced','transcendent']),
    dominant_ideology:  z.string().min(1),
    health_index:       z.number().min(0).max(1),
    wisdom_score:       z.number().min(0).max(1),
    trust_score:        z.number().min(0).max(1),
    specialization:     z.array(z.string()).default([]),
    registered_at_ms:   z.number().int().optional(),
    last_seen_ms:       z.number().int().optional(),
  });

  // ── POST /planetary/civilizations — register or upsert a civilization ────

  app.post('/planetary/civilizations', (req: Request, res: Response): void => {
    const parsed = CivProfileSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.issues }); return; }
    const now = Date.now();
    const civ: CivilizationProfile = {
      ...parsed.data,
      registered_at_ms: parsed.data.registered_at_ms ?? now,
      last_seen_ms:      parsed.data.last_seen_ms      ?? now,
    };
    civilizationRegistry.set(civ.civ_id, civ);
    res.json({ status: 'registered', civ });
  });

  // ── GET /planetary/civilizations — list all registered civilizations ──────

  app.get('/planetary/civilizations', (_req: Request, res: Response): void => {
    res.json({ civilizations: [...civilizationRegistry.values()] });
  });

  // ── POST /planetary/interop — interoperability report ────────────────────

  app.post('/planetary/interop', (req: Request, res: Response): void => {
    const schema = z.object({ civ_ids: z.array(z.string()).optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const civs = parsed.data.civ_ids
      ? parsed.data.civ_ids.map((id: string) => civilizationRegistry.get(id)).filter((c: CivilizationProfile | undefined): c is CivilizationProfile => !!c)
      : [...civilizationRegistry.values()];
    if (civs.length < 2) { res.status(400).json({ error: 'At least 2 civilizations required' }); return; }
    res.json(computeInteroperability(civs));
  });

  // ── POST /planetary/protocol/translate — policy translation ──────────────

  app.post('/planetary/protocol/translate', (req: Request, res: Response): void => {
    const schema = z.object({
      from_civ_id:   z.string().min(1),
      to_civ_id:     z.string().min(1),
      policy_body:   z.string().min(1),
      protocol_kind: z.enum(['governance_handshake','policy_translation','treaty_negotiation',
                              'emergency_coordination','knowledge_federation','resource_allocation']).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const { from_civ_id, to_civ_id, policy_body, protocol_kind } = parsed.data;
    const fromCiv = civilizationRegistry.get(from_civ_id);
    const toCiv   = civilizationRegistry.get(to_civ_id);
    if (!fromCiv || !toCiv) { res.status(404).json({ error: 'Civilization not found' }); return; }
    const msg = buildProtocolMessage(fromCiv.civ_id, toCiv.civ_id, protocol_kind ?? 'policy_translation', { policy_body }, 60_000);
    const compat = scoreCompatibility(fromCiv, toCiv);
    res.json({ protocol_message: msg, compatibility: compat });
  });

  // ── POST /planetary/treaty/propose — propose a planetary treaty ───────────

  app.post('/planetary/treaty/propose', (req: Request, res: Response): void => {
    const schema = z.object({
      party_ids:      z.array(z.string().min(1)).min(2),
      kind:           z.enum(['non_aggression','mutual_aid','free_exchange','joint_governance',
                               'strategic_alliance','resource_compact','constitutional_union']),
      initiating_civ: z.string().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const { party_ids, kind, initiating_civ } = parsed.data;
    const treaty = proposeTreaty(party_ids, kind, initiating_civ);
    planetaryTreatyStore.push(treaty);
    res.json(treaty);
  });

  // ── POST /planetary/treaty/negotiate — full negotiation pipeline ──────────

  app.post('/planetary/treaty/negotiate', (req: Request, res: Response): void => {
    const schema = z.object({
      civ_a_id:       z.string().min(1),
      civ_b_id:       z.string().min(1),
      preferred_kind: z.enum(['non_aggression','mutual_aid','free_exchange','joint_governance',
                               'strategic_alliance','resource_compact','constitutional_union']).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const civA = civilizationRegistry.get(parsed.data.civ_a_id);
    const civB = civilizationRegistry.get(parsed.data.civ_b_id);
    if (!civA || !civB) { res.status(404).json({ error: 'Civilization not found' }); return; }
    const result = conductNegotiation(civA, civB, parsed.data.preferred_kind);
    if (result.final_outcome === 'ratified') {
      const existing = planetaryTreatyStore.findIndex(t => t.treaty_id === result.treaty.treaty_id);
      if (existing >= 0) planetaryTreatyStore[existing] = result.treaty;
      else planetaryTreatyStore.push(result.treaty);
    }
    res.json(result);
  });

  // ── POST /planetary/treaty/ratify — ratify a proposed treaty ─────────────

  app.post('/planetary/treaty/ratify', (req: Request, res: Response): void => {
    const schema = z.object({
      treaty_id:      z.string().min(1),
      ratifying_civs: z.array(z.string().min(1)).min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const idx = planetaryTreatyStore.findIndex(t => t.treaty_id === parsed.data.treaty_id);
    if (idx < 0) { res.status(404).json({ error: 'Treaty not found' }); return; }
    const ratified = ratifyTreaty(planetaryTreatyStore[idx], parsed.data.ratifying_civs);
    planetaryTreatyStore[idx] = ratified;
    res.json(ratified);
  });

  // ── POST /planetary/governance/councils — form planetary councils ─────────

  app.post('/planetary/governance/councils', (req: Request, res: Response): void => {
    const schema = z.object({ civ_ids: z.array(z.string()).optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const civs = parsed.data.civ_ids
      ? parsed.data.civ_ids.map((id: string) => civilizationRegistry.get(id)).filter((c: CivilizationProfile | undefined): c is CivilizationProfile => !!c)
      : [...civilizationRegistry.values()];
    if (civs.length === 0) { res.status(400).json({ error: 'No civilizations registered' }); return; }
    const newCouncils = formPlanetaryCouncils(civs, planetaryCouncilStore);
    for (const c of newCouncils) {
      const exists = planetaryCouncilStore.find(e => e.kind === c.kind);
      if (!exists) planetaryCouncilStore.push(c);
    }
    res.json({ councils: planetaryCouncilStore });
  });

  // ── POST /planetary/governance/resolve — propose a council resolution ─────

  app.post('/planetary/governance/resolve', (req: Request, res: Response): void => {
    const schema = z.object({
      council_id:  z.string().min(1),
      title:       z.string().min(1),
      body:        z.string().min(1),
      proposed_by: z.string().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const council = planetaryCouncilStore.find(c => c.council_id === parsed.data.council_id);
    if (!council) { res.status(404).json({ error: 'Council not found' }); return; }
    const civs = [...civilizationRegistry.values()];
    const resolution = proposeResolution(council, parsed.data.title, parsed.data.body, parsed.data.proposed_by, civs);
    planetaryResolutionStore.push(resolution);
    res.json(resolution);
  });

  // ── GET /planetary/governance/state — federated governance state ──────────

  app.get('/planetary/governance/state', (_req: Request, res: Response): void => {
    const civs = [...civilizationRegistry.values()];
    const state = computeFederatedGovernanceState(civs, planetaryCouncilStore, planetaryTreatyStore, planetaryResolutionStore);
    res.json(state);
  });

  // ── POST /planetary/twin — planetary digital twin ─────────────────────────

  app.post('/planetary/twin', (req: Request, res: Response): void => {
    const schema = z.object({ civ_ids: z.array(z.string()).optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const civs = parsed.data.civ_ids
      ? parsed.data.civ_ids.map((id: string) => civilizationRegistry.get(id)).filter((c: CivilizationProfile | undefined): c is CivilizationProfile => !!c)
      : [...civilizationRegistry.values()];
    if (civs.length === 0) { res.status(400).json({ error: 'No civilizations registered' }); return; }
    res.json(buildPlanetaryTwin(civs, planetaryTreatyStore));
  });

  // ── POST /planetary/resources — resource orchestration ───────────────────

  app.post('/planetary/resources', (req: Request, res: Response): void => {
    const schema = z.object({ civ_ids: z.array(z.string()).optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const civs = parsed.data.civ_ids
      ? parsed.data.civ_ids.map((id: string) => civilizationRegistry.get(id)).filter((c: CivilizationProfile | undefined): c is CivilizationProfile => !!c)
      : [...civilizationRegistry.values()];
    if (civs.length === 0) { res.status(400).json({ error: 'No civilizations registered' }); return; }
    const pools    = buildResourcePools(civs);
    const decision = orchestrateResources(civs, pools);
    res.json({ pools, decision });
  });

  // ── POST /planetary/risk — planetary risk assessment ─────────────────────

  app.post('/planetary/risk', (req: Request, res: Response): void => {
    const schema = z.object({ civ_ids: z.array(z.string()).optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const civs = parsed.data.civ_ids
      ? parsed.data.civ_ids.map((id: string) => civilizationRegistry.get(id)).filter((c: CivilizationProfile | undefined): c is CivilizationProfile => !!c)
      : [...civilizationRegistry.values()];
    if (civs.length === 0) { res.status(400).json({ error: 'No civilizations registered' }); return; }
    const { domains } = buildPlanetaryTwin(civs, planetaryTreatyStore);
    res.json(assessPlanetaryRisk(civs, domains, planetaryTreatyStore));
  });

  // ── POST /planetary/diplomacy/negotiate — diplomatic negotiation ──────────

  app.post('/planetary/diplomacy/negotiate', (req: Request, res: Response): void => {
    const schema = z.object({
      civ_a_id:       z.string().min(1),
      civ_b_id:       z.string().min(1),
      preferred_kind: z.enum(['non_aggression','mutual_aid','free_exchange','joint_governance',
                               'strategic_alliance','resource_compact','constitutional_union']).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const civA = civilizationRegistry.get(parsed.data.civ_a_id);
    const civB = civilizationRegistry.get(parsed.data.civ_b_id);
    if (!civA || !civB) { res.status(404).json({ error: 'Civilization not found' }); return; }
    const recommended = recommendTreatyKind(civA, civB);
    const result      = conductNegotiation(civA, civB, parsed.data.preferred_kind);
    const trust       = computeInterCivTrust(civA, civB, planetaryTreatyStore.filter(
      t => t.status === 'active' && t.parties.includes(civA.civ_id) && t.parties.includes(civB.civ_id)
    ));
    if (result.final_outcome === 'ratified') {
      const existing = planetaryTreatyStore.findIndex(t => t.treaty_id === result.treaty.treaty_id);
      if (existing >= 0) planetaryTreatyStore[existing] = result.treaty;
      else planetaryTreatyStore.push(result.treaty);
    }
    res.json({ ...result, recommended_kind: recommended, inter_civ_trust: trust });
  });

  // ── POST /planetary/diplomacy/mediate — dispute mediation ────────────────

  app.post('/planetary/diplomacy/mediate', (req: Request, res: Response): void => {
    const schema = z.object({
      party_ids:    z.array(z.string().min(1)).min(2),
      dispute_kind: z.enum(['resource_conflict','governance_clash','policy_violation','treaty_breach']),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const parties = parsed.data.party_ids
      .map((id: string) => civilizationRegistry.get(id))
      .filter((c: CivilizationProfile | undefined): c is CivilizationProfile => !!c);
    if (parties.length < 2) { res.status(404).json({ error: 'At least 2 civilizations must be registered' }); return; }
    const resolution = mediateDispute(parties, parsed.data.dispute_kind, planetaryTreatyStore);
    res.json(resolution);
  });

  // ── POST /planetary/consciousness — planetary consciousness signal ─────────

  app.post('/planetary/consciousness', (req: Request, res: Response): void => {
    const schema = z.object({ civ_ids: z.array(z.string()).optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const civs = parsed.data.civ_ids
      ? parsed.data.civ_ids.map((id: string) => civilizationRegistry.get(id)).filter((c: CivilizationProfile | undefined): c is CivilizationProfile => !!c)
      : [...civilizationRegistry.values()];
    if (civs.length === 0) { res.status(400).json({ error: 'No civilizations registered' }); return; }
    const { domains } = buildPlanetaryTwin(civs, planetaryTreatyStore);
    const riskReport  = assessPlanetaryRisk(civs, domains, planetaryTreatyStore);
    const govState    = computeFederatedGovernanceState(civs, planetaryCouncilStore, planetaryTreatyStore, planetaryResolutionStore);
    res.json(computePlanetaryConsciousness(civs, planetaryTreatyStore, govState, riskReport));
  });

  // ── POST /planetary/simulate — global strategic simulation ───────────────

  app.post('/planetary/simulate', (req: Request, res: Response): void => {
    const schema = z.object({
      civ_ids:       z.array(z.string()).optional(),
      horizon_epochs: z.number().int().min(3).max(20).default(10),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
    const civs = parsed.data.civ_ids
      ? parsed.data.civ_ids.map((id: string) => civilizationRegistry.get(id)).filter((c: CivilizationProfile | undefined): c is CivilizationProfile => !!c)
      : [...civilizationRegistry.values()];
    if (civs.length === 0) { res.status(400).json({ error: 'No civilizations registered' }); return; }
    const { domains } = buildPlanetaryTwin(civs, planetaryTreatyStore);
    const riskReport  = assessPlanetaryRisk(civs, domains, planetaryTreatyStore);
    const govState    = computeFederatedGovernanceState(civs, planetaryCouncilStore, planetaryTreatyStore, planetaryResolutionStore);
    const consciousness = computePlanetaryConsciousness(civs, planetaryTreatyStore, govState, riskReport);
    res.json(runGlobalStrategicSimulation(civs, planetaryTreatyStore, govState, riskReport, consciousness, parsed.data.horizon_epochs));
  });

  // ── GET /planetary/command — planetary command center state ──────────────

  app.get('/planetary/command', (_req: Request, res: Response): void => {
    const civs = [...civilizationRegistry.values()];
    if (civs.length === 0) {
      res.json({ status: 'no_civilizations', message: 'Register civilizations via POST /planetary/civilizations' });
      return;
    }
    const { domains }   = buildPlanetaryTwin(civs, planetaryTreatyStore);
    const riskReport    = assessPlanetaryRisk(civs, domains, planetaryTreatyStore);
    const govState      = computeFederatedGovernanceState(civs, planetaryCouncilStore, planetaryTreatyStore, planetaryResolutionStore);
    const consciousness = computePlanetaryConsciousness(civs, planetaryTreatyStore, govState, riskReport);
    const simulation    = runGlobalStrategicSimulation(civs, planetaryTreatyStore, govState, riskReport, consciousness);
    res.json({
      civilization_count:     civs.length,
      active_treaties:        planetaryTreatyStore.filter(t => t.status === 'active').length,
      council_count:          planetaryCouncilStore.length,
      threat_level:           riskReport.overall_threat_level,
      awareness_label:        consciousness.awareness_label,
      planetary_iq:           consciousness.planetary_iq,
      federation_cohesion:    govState.federation_cohesion,
      most_likely_scenario:   simulation.most_likely_scenario.kind,
      recommended_trajectory: simulation.recommended_trajectory,
      strategic_leverage_points: simulation.strategic_leverage_points,
      emergence_signals:      consciousness.emergence_signals,
      risk_report:            riskReport,
      governance_state:       govState,
      consciousness,
    });
  });

  // ── WS: /stream/:swarm_id — push narrative updates ───────────────────────

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/stream' });

  // Per-swarm streaming: clients subscribe and get pushed NarrativeState
  // every 2s as new analyze calls come in via the intelligence pipeline.
  const streams = new Map<string, Set<WebSocket>>();

  wss.on('connection', (ws, req) => {
    const swarm_id = new URL(req.url ?? '', 'http://localhost').searchParams.get('swarm_id');
    if (!swarm_id) { ws.close(4000, 'Missing swarm_id'); return; }

    let subs = streams.get(swarm_id);
    if (!subs) { subs = new Set(); streams.set(swarm_id, subs); }
    subs.add(ws);

    ws.on('close', () => {
      streams.get(swarm_id)?.delete(ws);
    });
  });

  // Expose broadcast function — called from analyze endpoint
  (app as unknown as express.Application & { broadcastNarrative: (id: string, payload: unknown) => void })
    .broadcastNarrative = (swarm_id: string, payload: unknown) => {
      const subs = streams.get(swarm_id);
      if (!subs) return;
      const msg = JSON.stringify(payload);
      for (const ws of subs) {
        if (ws.readyState === WebSocket.OPEN) ws.send(msg);
      }
    };

  return { app, httpServer };
}

export function startServer(): void {
  const { httpServer } = createServer();
  httpServer.listen(PORT, () => {
    console.log(`[intelligence-service] Listening on :${PORT}`);
  });
}
