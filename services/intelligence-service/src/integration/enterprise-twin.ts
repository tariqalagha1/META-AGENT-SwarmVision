import { v4 as uuidv4 } from 'uuid';
import { SwarmHealthReport } from '../scoring/health-scorer';
import { ScoringEvent } from '../scoring/health-scorer';
import { EmergentBehaviorReport, SwarmCoherenceReport } from '../emergence/types';
import { CivilizationalMemoryState } from '../civilization/types';
import {
  EnterpriseTeam, InfrastructureNode, RiskPropagationPath,
  EnterpriseTwinState, MixedOrganization, OrgMember, MemberKind,
} from './types';

// ── Infrastructure modeling ────────────────────────────────────────────────────

function buildInfrastructure(
  swarmIds: string[],
  health: SwarmHealthReport,
): InfrastructureNode[] {
  const h = health.overall_health;
  const a = health.anomaly_rate ?? 0;

  return [
    {
      node_id:      uuidv4(),
      kind:         'kubernetes_cluster',
      name:         'primary-k8s-cluster',
      health:       h * 0.85 + 0.10,
      load:         Math.min((health.total_events ?? 0) * 0.001, 1),
      criticality:  'critical',
      dependencies: [],
    },
    {
      node_id:      uuidv4(),
      kind:         'ci_pipeline',
      name:         'swarm-deployment-pipeline',
      health:       h > 0.60 ? 0.88 : 0.65,
      load:         0.45,
      criticality:  'high',
      dependencies: ['primary-k8s-cluster'],
    },
    {
      node_id:      uuidv4(),
      kind:         'observability_stack',
      name:         'swarm-metrics-prometheus',
      health:       0.92,
      load:         0.30,
      criticality:  'high',
      dependencies: [],
    },
    {
      node_id:      uuidv4(),
      kind:         'security_monitor',
      name:         'swarm-security-scanner',
      health:       a > 0.20 ? 0.75 : 0.90,
      load:         a > 0.20 ? 0.65 : 0.35,
      criticality:  'critical',
      dependencies: ['primary-k8s-cluster'],
    },
    ...swarmIds.map(sid => ({
      node_id:     uuidv4(),
      kind:        'ai_workload' as InfrastructureNode['kind'],
      name:        `${sid}-ai-workload`,
      health:      h * 0.90 + 0.05,
      load:        0.55,
      criticality: 'high' as InfrastructureNode['criticality'],
      dependencies: ['primary-k8s-cluster', 'swarm-security-scanner'],
    })),
  ];
}

function computeRiskPropagation(
  infra: InfrastructureNode[],
  health: SwarmHealthReport,
): RiskPropagationPath[] {
  const paths: RiskPropagationPath[] = [];
  const a = health.anomaly_rate ?? 0;

  const criticalNodes = infra.filter(n => n.criticality === 'critical' && n.health < 0.70);

  for (const origin of criticalNodes) {
    const affectedIds = infra
      .filter(n => n.dependencies.includes(origin.name) || n.node_id !== origin.node_id)
      .map(n => n.node_id)
      .slice(0, 4);

    paths.push({
      origin_node:             origin.node_id,
      affected_nodes:          affectedIds,
      propagation_probability: a * 0.60 + (1 - origin.health) * 0.40,
      estimated_impact:        (1 - origin.health) * 0.80,
      blast_radius_ms:         origin.kind === 'kubernetes_cluster' ? 5_000 : 15_000,
    });
  }

  return paths;
}

// ── Team modeling ─────────────────────────────────────────────────────────────

function buildTeams(
  health: SwarmHealthReport,
  swarmIds: string[],
): EnterpriseTeam[] {
  const h = health.overall_health;

  return [
    {
      team_id:          uuidv4(),
      name:             'Platform Engineering',
      kind:             'engineering',
      member_count:     8,
      workload:         0.70,
      health:           h > 0.60 ? 0.82 : 0.65,
      ai_augmentation:  0.45,
    },
    {
      team_id:          uuidv4(),
      name:             'AI Systems Operations',
      kind:             'ai_systems',
      member_count:     5,
      workload:         0.65,
      health:           h,
      ai_augmentation:  0.85,
    },
    {
      team_id:          uuidv4(),
      name:             'Strategic Operations',
      kind:             'strategy',
      member_count:     4,
      workload:         0.50,
      health:           0.78,
      ai_augmentation:  0.60,
    },
    {
      team_id:          uuidv4(),
      name:             'AI Governance & Compliance',
      kind:             'compliance',
      member_count:     3,
      workload:         0.45,
      health:           0.85,
      ai_augmentation:  0.40,
    },
  ];
}

// ── Mixed organizations ────────────────────────────────────────────────────────

export function buildMixedOrganizations(
  swarmIds: string[],
  operatorIds: string[],
  health: SwarmHealthReport,
  coherence: SwarmCoherenceReport,
): MixedOrganization[] {
  const orgs: MixedOrganization[] = [];
  const now = Date.now();

  // Executive council — mixed human + AI strategic authority
  const execMembers: OrgMember[] = [
    ...operatorIds.map((id, i) => ({
      member_id:       id,
      name:            i === 0 ? 'Chief AI Officer' : `Platform Operator ${i}`,
      kind:            'human' as MemberKind,
      role:            i === 0 ? 'executive' : 'operator',
      authority_weight: i === 0 ? 0.40 : 0.25,
      active:          true,
    })),
    ...swarmIds.slice(0, 2).map(sid => ({
      member_id:       sid,
      name:            `${sid} Intelligence`,
      kind:            'swarm_agent' as MemberKind,
      role:            'strategic_advisor',
      authority_weight: 0.175,
      active:          true,
    })),
  ];

  orgs.push({
    org_id:          uuidv4(),
    name:            'Human-AI Executive Council',
    kind:            'executive_council',
    members:         execMembers,
    human_fraction:  operatorIds.length / execMembers.length,
    decision_model:  'human_veto',
    charter:         [
      'Humans retain veto power over all strategic decisions',
      'AI systems provide advisory input and scenario analysis',
      'Consensus required for governance philosophy shifts',
      'Emergency actions may be escalated to human-only session',
    ],
    formed_at_ms:    now,
    decisions_made:  0,
    health_score:    health.overall_health,
  });

  // Crisis committee — human-led, AI-informed
  if (health.overall_health < 0.50 || (health.anomaly_rate ?? 0) > 0.25) {
    orgs.push({
      org_id:          uuidv4(),
      name:            'Crisis Response Committee',
      kind:            'crisis_committee',
      members:         [
        ...operatorIds.map(id => ({
          member_id: id, name: 'Crisis Officer', kind: 'human' as MemberKind,
          role: 'emergency_officer', authority_weight: 0.50, active: true,
        })),
        {
          member_id: swarmIds[0], name: 'Ecosystem Governor AI', kind: 'swarm_agent' as MemberKind,
          role: 'crisis_advisor', authority_weight: 0.25, active: true,
        },
      ],
      human_fraction:  operatorIds.length / (operatorIds.length + 1),
      decision_model:  'human_veto',
      charter:         [
        'Committee activates automatically when health < 0.50',
        'Decisions executable within 30 seconds — no waiting for consensus',
        'AI provides real-time ecosystem state for all decisions',
      ],
      formed_at_ms:    now,
      decisions_made:  0,
      health_score:    health.overall_health,
    });
  }

  // Governance board — weighted vote
  orgs.push({
    org_id:          uuidv4(),
    name:            'AI Governance Board',
    kind:            'governance_board',
    members:         [
      ...operatorIds.map(id => ({
        member_id: id, name: 'Governance Officer', kind: 'human' as MemberKind,
        role: 'governance_lead', authority_weight: 0.35, active: true,
      })),
      ...swarmIds.map(sid => ({
        member_id: sid, name: `${sid} Governance Signal`, kind: 'hybrid_system' as MemberKind,
        role: 'policy_advisor', authority_weight: 0.15, active: true,
      })),
    ],
    human_fraction:  operatorIds.length / (operatorIds.length + swarmIds.length),
    decision_model:  'weighted_vote',
    charter:         [
      'Oversees policy enforcement and constitutional amendments',
      'Weighted vote: human votes count 2.3× AI advisory votes',
      'Publishes governance transparency reports monthly',
    ],
    formed_at_ms:    now,
    decisions_made:  0,
    health_score:    coherence.harmony,
  });

  return orgs;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function buildEnterpriseTwin(
  orgName: string,
  swarmIds: string[],
  health: SwarmHealthReport,
  emergent: EmergentBehaviorReport,
  coherence: SwarmCoherenceReport,
  civMemory: CivilizationalMemoryState,
): EnterpriseTwinState {
  const infra    = buildInfrastructure(swarmIds, health);
  const teams    = buildTeams(health, swarmIds);
  const riskPaths = computeRiskPropagation(infra, health);

  const overallResilience = Math.min(
    health.overall_health * 0.30 +
    coherence.systemic_resilience * 0.30 +
    (1 - (health.anomaly_rate ?? 0)) * 0.20 +
    civMemory.civilizational_wisdom * 0.20,
    1,
  );

  const aiGovCoverage = Math.min(
    swarmIds.length * 0.15 + civMemory.total_eras * 0.05 + 0.30,
    1,
  );

  const initiatives = [
    'Autonomous governance maturity program — Phase 9 integration',
    'Human-AI co-governance pilot — executive council operational',
    `Enterprise resilience target: ${(overallResilience * 100 + 10).toFixed(0)}% by next epoch`,
  ];
  if (civMemory.successful_patterns.length > 0) {
    initiatives.push(`Pattern replication initiative: applying ${civMemory.successful_patterns[0].description}`);
  }

  return {
    twin_id:                    uuidv4(),
    org_name:                   orgName,
    simulated_at_ms:            Date.now(),
    teams,
    infrastructure:             infra,
    risk_propagation_paths:     riskPaths,
    overall_resilience:         parseFloat(overallResilience.toFixed(3)),
    strategic_initiatives:      initiatives,
    ai_governance_coverage:     parseFloat(aiGovCoverage.toFixed(3)),
  };
}
