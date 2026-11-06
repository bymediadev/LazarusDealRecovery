/**
 * Immutable record of one analysis run.
 * Quotes stay on the grounding audit. This record keeps names, rules, and scores
 * so a saved row can explain the diagnosis without storing transcript text.
 */

export type EvidenceSource = "transcript" | "supplemental";

export type GroundingStatus = "fully_grounded" | "partially_grounded" | "rejected";

export type DriInputBasis = "observed_crm" | "transcript" | "inferred_proxy" | "default";

export interface RejectedEvidence {
  kind: "force" | "stakeholder" | "term" | "amount" | "missing_stakeholder";
  label: string;
  detail: string;
  reason: string;
}

export interface ForceSnapshot {
  factor: string;
  type: string;
  weight: number;
  evidence_source: EvidenceSource | "unknown";
  counted: boolean | null;
}

export interface ForceTransform {
  rule_id: string;
  reason: string;
  evidence_source: EvidenceSource | "extraction";
  readonly before_factors: readonly string[];
  after_factor: string;
  after_type: string;
  after_weight: number;
}

export interface StakeholderRepair {
  name: string;
  rule_id: string;
  reason: string;
  evidence_source: EvidenceSource;
}

export interface DriInputRecord {
  field: string;
  value: string;
  basis: DriInputBasis;
  reason: string;
}

export interface AnalysisLineage {
  grounding_status: GroundingStatus;
  extraction_retried: boolean;
  original_extraction: {
    readonly forces: readonly ForceSnapshot[];
    readonly stakeholder_names: readonly string[];
  };
  grounded_extraction: {
    readonly forces: readonly ForceSnapshot[];
    readonly stakeholder_names: readonly string[];
  };
  readonly rejected_evidence: readonly RejectedEvidence[];
  readonly stakeholder_repairs: readonly StakeholderRepair[];
  readonly scoring_forces: readonly ForceSnapshot[];
  readonly force_transforms: readonly ForceTransform[];
  readonly scoring: {
    intent_strength: number;
    constraint_pressure: number;
    structural_lock_in: number;
    enabler_strength: number;
    timing_factor: number;
    effective_intent: number;
    viability_score: number;
    trajectory_type: string;
    recoverability: string;
    blocker_classification: string;
  };
  readonly dri_inputs: readonly DriInputRecord[];
  dri: number;
  readonly report: {
    status: string;
    viability_score: number;
    trajectory_type: string;
    recoverability: string;
    deal_risk_index: number;
  };
}

function freezeSnapshots(forces: readonly ForceSnapshot[]): readonly ForceSnapshot[] {
  return Object.freeze(forces.map((force) => Object.freeze({ ...force })));
}

/** Deep-freeze a lineage record. Callers must not mutate the input after this. */
export function freezeLineage(record: AnalysisLineage): AnalysisLineage {
  const frozen: AnalysisLineage = {
    ...record,
    original_extraction: Object.freeze({
      forces: freezeSnapshots(record.original_extraction.forces),
      stakeholder_names: Object.freeze([...record.original_extraction.stakeholder_names]),
    }),
    grounded_extraction: Object.freeze({
      forces: freezeSnapshots(record.grounded_extraction.forces),
      stakeholder_names: Object.freeze([...record.grounded_extraction.stakeholder_names]),
    }),
    rejected_evidence: Object.freeze(record.rejected_evidence.map((item) => Object.freeze({ ...item }))),
    stakeholder_repairs: Object.freeze(record.stakeholder_repairs.map((item) => Object.freeze({ ...item }))),
    scoring_forces: freezeSnapshots(record.scoring_forces),
    force_transforms: Object.freeze(record.force_transforms.map((item) => Object.freeze({
      ...item,
      before_factors: Object.freeze([...item.before_factors]),
    }))),
    scoring: Object.freeze({ ...record.scoring }),
    dri_inputs: Object.freeze(record.dri_inputs.map((item) => Object.freeze({ ...item }))),
    report: Object.freeze({ ...record.report }),
  };
  return Object.freeze(frozen);
}
