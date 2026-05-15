import { v4 as uuidv4 } from 'uuid';
import { ScoringEvent, SwarmHealthReport } from '../scoring/health-scorer';
import { EmergentBehaviorReport } from '../emergence/types';
import {
  OrganizationalStructure, Department, SpecializationCluster,
  SyntheticInstitution, InstitutionKind, StructuralEvolutionResult,
  InstitutionFormationResult, FederationTreaty,
} from './types';
import { GovernanceDoctrine } from './types';

// ── Agent analysis ─────────────────────────────────────────────────────────────

interface AgentProfile {
  agent_id: string;
  task_count: number;
  retry_count: number;
  anomaly_count: number;
  completion_count: number;
  avg_priority: number;
  dominant_function: string;
  efficiency: number;
  load: number;
}

function buildAgentProfiles(events: ScoringEvent[]): AgentProfile[] {
  const map = new Map<string, AgentProfile>();

  for (const ev of events) {
    if (!map.has(ev.agent_id)) {
      map.set(ev.agent_id, {
        agent_id:         ev.agent_id,
        task_count:       0,
        retry_count:      0,
        anomaly_count:    0,
        completion_count: 0,
        avg_priority:     0,
        dominant_function: 'general',
        efficiency:       0,
        load:             0,
      });
    }
    const p = map.get(ev.agent_id)!;
    p.task_count++;
    p.avg_priority += ev.priority;
    if (ev.event_type === 'TASK_RETRY')       p.retry_count++;
    if (ev.event_type === 'AGENT_ANOMALY')    p.anomaly_count++;
    if (ev.event_type === 'TASK_COMPLETED')   p.completion_count++;
  }

  const agents = Array.from(map.values());
  for (const p of agents) {
    if (p.task_count > 0) p.avg_priority /= p.task_count;
    p.efficiency = p.task_count > 0
      ? p.completion_count / Math.max(p.task_count, 1)
      : 0;
    p.load = Math.min(p.task_count / Math.max(events.length * 0.15, 1), 1);

    // Infer function from agent_id naming convention
    const aid = p.agent_id.toLowerCase();
    if (aid.includes('ingest') || aid.includes('intake') || aid.includes('source')) {
      p.dominant_function = 'ingest';
    } else if (aid.includes('transform') || aid.includes('process') || aid.includes('convert')) {
      p.dominant_function = 'transform';
    } else if (aid.includes('valid') || aid.includes('check') || aid.includes('audit')) {
      p.dominant_function = 'validate';
    } else if (aid.includes('output') || aid.includes('export') || aid.includes('sink')) {
      p.dominant_function = 'output';
    } else if (aid.includes('coord') || aid.includes('meta') || aid.includes('orchestr')) {
      p.dominant_function = 'coordination';
    } else if (p.avg_priority > 3) {
      p.dominant_function = 'priority_processing';
    } else if (p.retry_count > p.task_count * 0.3) {
      p.dominant_function = 'resilience_buffer';
    }
  }

  return agents;
}

// ── Department formation ──────────────────────────────────────────────────────

function formDepartments(agents: AgentProfile[]): Department[] {
  const byFunction = new Map<string, AgentProfile[]>();
  for (const a of agents) {
    if (!byFunction.has(a.dominant_function)) byFunction.set(a.dominant_function, []);
    byFunction.get(a.dominant_function)!.push(a);
  }

  const depts: Department[] = [];
  for (const [fn, members] of byFunction) {
    const totalLoad  = members.reduce((s, m) => s + m.load, 0) / members.length;
    const totalHealth = members.reduce((s, m) => s + m.efficiency, 0) / members.length;
    depts.push({
      dept_id:        uuidv4(),
      name:           `${fn.charAt(0).toUpperCase() + fn.slice(1)} Division`,
      specialization: fn,
      agent_ids:      members.map(m => m.agent_id),
      load:           totalLoad,
      health:         totalHealth,
    });
  }
  return depts;
}

// ── Specialization clustering ──────────────────────────────────────────────────

function formSpecializationClusters(agents: AgentProfile[]): SpecializationCluster[] {
  const HIGH_EFF = 0.65;
  const high = agents.filter(a => a.efficiency >= HIGH_EFF);
  const low  = agents.filter(a => a.efficiency < HIGH_EFF);

  const clusters: SpecializationCluster[] = [];

  if (high.length > 0) {
    const avgEff = high.reduce((s, a) => s + a.efficiency, 0) / high.length;
    clusters.push({
      cluster_id:        uuidv4(),
      dominant_function: 'high_performance',
      agent_ids:         high.map(a => a.agent_id),
      cohesion:          0.75 + (avgEff - HIGH_EFF) * 0.5,
      efficiency:        avgEff,
    });
  }

  if (low.length > 0) {
    const avgEff = low.reduce((s, a) => s + a.efficiency, 0) / low.length;
    clusters.push({
      cluster_id:        uuidv4(),
      dominant_function: 'resilience_buffer',
      agent_ids:         low.map(a => a.agent_id),
      cohesion:          0.40 + avgEff * 0.3,
      efficiency:        avgEff,
    });
  }

  // High-retry cluster (potential specialization for resilience roles)
  const highRetry = agents.filter(a => a.retry_count > a.task_count * 0.25);
  if (highRetry.length >= 2) {
    clusters.push({
      cluster_id:        uuidv4(),
      dominant_function: 'fault_tolerant_processing',
      agent_ids:         highRetry.map(a => a.agent_id),
      cohesion:          0.55,
      efficiency:        highRetry.reduce((s, a) => s + a.efficiency, 0) / highRetry.length,
    });
  }

  return clusters;
}

// ── Institution formation ──────────────────────────────────────────────────────

export function deriveInstitutions(
  swarmId: string,
  health: SwarmHealthReport,
  emergent: EmergentBehaviorReport,
  existing: SyntheticInstitution[],
): SyntheticInstitution[] {
  const formed: SyntheticInstitution[] = [];
  const existingKinds = new Set(existing.filter(i => i.active).map(i => i.kind));
  const now = Date.now();

  const anomalyRate = health.anomaly_rate ?? 0;
  const retryRate   = (health.total_retries ?? 0) / Math.max(health.total_events ?? 1, 1);

  // Oversight council — forms when anomaly rate is significant
  if (!existingKinds.has('oversight_council') && anomalyRate > 0.15) {
    formed.push({
      institution_id:    uuidv4(),
      kind:              'oversight_council',
      name:              'Swarm Oversight Council',
      member_swarms:     [swarmId],
      charter:           [
        'Monitor all AGENT_ANOMALY events in real-time',
        'Issue containment directives when blast_radius > 0.40',
        'Publish anomaly reports after every crisis era',
      ],
      authority_domains: ['anomaly_containment', 'health_monitoring', 'incident_response'],
      formed_at_ms:      now,
      health_score:      health.overall_health,
      active:            true,
    });
  }

  // Strategic assembly — forms when system reaches expansion phase
  if (!existingKinds.has('strategic_assembly') && health.overall_health > 0.60) {
    formed.push({
      institution_id:    uuidv4(),
      kind:              'strategic_assembly',
      name:              'Long-Horizon Planning Assembly',
      member_swarms:     [swarmId],
      charter:           [
        'Conduct strategic reviews every 5 evolutionary generations',
        'Evaluate topology redesign proposals',
        'Approve governance philosophy shifts',
      ],
      authority_domains: ['topology_design', 'governance_evolution', 'specialization_strategy'],
      formed_at_ms:      now,
      health_score:      health.overall_health,
      active:            true,
    });
  }

  // Evolutionary board — forms when retry/failure patterns stabilize (learning possible)
  if (!existingKinds.has('evolutionary_board') && retryRate < 0.25 && health.overall_health > 0.55) {
    formed.push({
      institution_id:    uuidv4(),
      kind:              'evolutionary_board',
      name:              'Orchestration Evolution Board',
      member_swarms:     [swarmId],
      charter:           [
        'Oversee all genome mutations and fitness evaluations',
        'Retire underperforming orchestration patterns after 3 generations',
        'Publish dominant mutation reports each generation',
      ],
      authority_domains: ['mutation_governance', 'fitness_evaluation', 'genome_retirement'],
      formed_at_ms:      now,
      health_score:      health.overall_health,
      active:            true,
    });
  }

  // Research guild — forms when emergent behavior is complex enough
  if (!existingKinds.has('research_guild') && emergent.coordination_entropy > 0.35) {
    formed.push({
      institution_id:    uuidv4(),
      kind:              'research_guild',
      name:              'Autonomous Discovery Guild',
      member_swarms:     [swarmId],
      charter:           [
        'Continuously explore novel coordination patterns',
        'Document new orchestration doctrines as they emerge',
        'Run autonomous experiments on isolated event sub-streams',
      ],
      authority_domains: ['pattern_discovery', 'doctrine_invention', 'experimental_orchestration'],
      formed_at_ms:      now,
      health_score:      health.overall_health,
      active:            true,
    });
  }

  // Crisis tribunal — forms only during crisis
  if (!existingKinds.has('crisis_tribunal') && health.overall_health < 0.35) {
    formed.push({
      institution_id:    uuidv4(),
      kind:              'crisis_tribunal',
      name:              'Emergency Crisis Tribunal',
      member_swarms:     [swarmId],
      charter:           [
        'Assume emergency authority when health < 0.30',
        'Issue immediate isolation directives without quorum',
        'Auto-dissolve when health returns above 0.50',
      ],
      authority_domains: ['emergency_intervention', 'agent_isolation', 'triage_routing'],
      formed_at_ms:      now,
      health_score:      health.overall_health,
      active:            true,
    });
  }

  return formed;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function evolveOrganizationalStructure(
  swarmId: string,
  events: ScoringEvent[],
  health: SwarmHealthReport,
  emergent: EmergentBehaviorReport,
  doctrine: GovernanceDoctrine | null,
  previous: OrganizationalStructure | null,
): StructuralEvolutionResult {
  const now = Date.now();
  const agents   = buildAgentProfiles(events);
  const depts    = formDepartments(agents);
  const clusters = formSpecializationClusters(agents);
  const existing = previous?.active_institutions ?? [];
  const newInsts = deriveInstitutions(swarmId, health, emergent, existing);
  const allInsts = [...existing, ...newInsts];

  const structureStability =
    health.overall_health * 0.40 +
    (1 - (health.anomaly_rate ?? 0)) * 0.30 +
    Math.min(allInsts.length * 0.08, 0.30);

  const newStructure: OrganizationalStructure = {
    structure_id:        uuidv4(),
    swarm_id:            swarmId,
    departments:         depts,
    specialization_clusters: clusters,
    active_institutions: allInsts,
    hierarchy_depth:     doctrine?.philosophy.ideology === 'hierarchical_mandate' ? 4 : 2,
    federation_count:    allInsts.filter(i => i.kind === 'operational_federation').length,
    structure_stability: structureStability,
    formed_at_ms:        now,
  };

  const changes: string[] = [];
  if (!previous) {
    changes.push(`Initial organizational structure formed: ${depts.length} departments, ${clusters.length} clusters`);
  } else {
    const prevDeptCount = previous.departments.length;
    if (depts.length > prevDeptCount) changes.push(`+${depts.length - prevDeptCount} new departments formed through specialization`);
    if (depts.length < prevDeptCount) changes.push(`${prevDeptCount - depts.length} departments merged — consolidation`);
    if (clusters.length !== previous.specialization_clusters.length) {
      changes.push(`Specialization clusters reorganized: ${previous.specialization_clusters.length} → ${clusters.length}`);
    }
  }
  if (newInsts.length > 0) {
    changes.push(`${newInsts.length} new institution(s) formed: ${newInsts.map(i => i.name).join(', ')}`);
  }

  const expectedGain = previous
    ? Math.max(0, structureStability - previous.structure_stability)
    : structureStability * 0.5;

  const rationale = health.overall_health < 0.40
    ? 'Structural reformation triggered by health crisis — emergency reorganization'
    : health.overall_health > 0.75
      ? 'Expansion-phase restructuring — capitalizing on healthy state for optimization'
      : 'Adaptive restructuring responding to operational drift';

  return {
    swarm_id:                  swarmId,
    evolved_at_ms:             now,
    previous_structure:        previous,
    new_structure:             newStructure,
    changes_applied:           changes,
    institutions_formed:       newInsts,
    expected_efficiency_gain:  expectedGain,
    restructure_rationale:     rationale,
  };
}

export function formFederationTreaty(
  swarmIds: string[],
  treatyKind: FederationTreaty['treaty_kind'],
  healthMap: Map<string, number>,
): FederationTreaty {
  const termsByKind: Record<FederationTreaty['treaty_kind'], string[]> = {
    resource_sharing:    [
      'Member swarms share excess capacity when load > 0.70',
      'Load rebalancing requests honored within 3 operational cycles',
      'No swarm may retain > 40% of total federation capacity',
    ],
    mutual_defense:      [
      'Any member swarm facing health < 0.35 triggers federation emergency protocol',
      'All members contribute isolation agents during anomaly containment',
      'Cross-swarm knowledge transfer is mandatory during crisis eras',
    ],
    knowledge_exchange:  [
      'Pattern discoveries shared with all member swarms automatically',
      'Collective memory graphs synchronized every 5 generations',
      'Research guild discoveries published to federation registry',
    ],
    joint_governance:    [
      'Governance philosophy shifts require >50% member swarm consensus',
      'No member may unilaterally dissolve a federation institution',
      'Constitutional amendments require unanimous federation agreement',
    ],
  };

  const avgHealth = swarmIds.reduce((s, id) => s + (healthMap.get(id) ?? 0.5), 0) / swarmIds.length;

  return {
    treaty_id:    uuidv4(),
    member_swarms: swarmIds,
    treaty_kind:   treatyKind,
    terms:         termsByKind[treatyKind],
    formed_at_ms:  Date.now(),
    stability:     avgHealth * 0.70 + 0.30,
  };
}

export function computeInstitutionFormation(
  swarmId: string,
  health: SwarmHealthReport,
  emergent: EmergentBehaviorReport,
  existingInstitutions: SyntheticInstitution[],
): InstitutionFormationResult {
  const now = Date.now();
  const newInsts = deriveInstitutions(swarmId, health, emergent, existingInstitutions);

  // Dissolve crisis tribunal if health recovered
  const dissolve: string[] = [];
  for (const inst of existingInstitutions) {
    if (inst.kind === 'crisis_tribunal' && health.overall_health > 0.55) {
      dissolve.push(inst.institution_id);
    }
  }

  const allActive = [...existingInstitutions.filter(i => !dissolve.includes(i.institution_id)), ...newInsts];
  const GOVERNANCE_DOMAINS = 6;
  const coveredDomains = new Set(allActive.flatMap(i => i.authority_domains)).size;
  const coverage = Math.min(coveredDomains / GOVERNANCE_DOMAINS, 1);

  const rationale: string[] = [];
  for (const inst of newInsts) rationale.push(`${inst.name} formed — authority: ${inst.authority_domains.join(', ')}`);
  for (const id of dissolve) {
    const inst = existingInstitutions.find(i => i.institution_id === id);
    if (inst) rationale.push(`${inst.name} dissolved — conditions no longer warrant existence`);
  }

  return {
    formed_at_ms:         now,
    new_institutions:     newInsts,
    dissolved_institutions: dissolve,
    governance_coverage:  coverage,
    formation_rationale:  rationale,
  };
}
