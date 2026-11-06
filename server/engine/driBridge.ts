/**
 * Map Force Interaction analysis state → non-linear DRI telemetry.
 * Force map remains evidence input; matrix owns the published Deal Risk Index.
 */

import { calculateDRI, type EngineMatrixDecision, type StakeholderProfile } from "./matrix.js";
import type { ProspectSentiment, StakeholderRole } from "./config.js";
import type { DriInputRecord } from "../../src/lib/analysisLineage.js";

export type BridgeFrozen = {
  viability_score: number;
  constraint_pressure: number;
  structural_lock_in: number;
  enabler_strength: number;
  timing_factor: number;
  trajectory_type: string;
};

export type BridgeStakeholder = {
  name: string;
  role?: string;
  stance?: string;
  persona_type?: string;
  authority_level?: string;
  evidence?: string;
};

export type BridgeStall = {
  score: number;
  deferral_phrase_count: number;
  handoff_mention_count: number;
};

function mapPersonaToRole(s: BridgeStakeholder): StakeholderRole {
  const raw = `${s.persona_type ?? ""} ${s.stance ?? ""} ${s.role ?? ""} ${s.authority_level ?? ""}`.toLowerCase();
  // Explicit opposition stays a risk role. A technical title does not erase it.
  if (/detractor|oppos/.test(raw) || /\bblocker\b/.test(raw)) return "DETRACTOR";
  // Technical approval is not economic signing authority.
  if (
    /technical_veto/.test(raw) ||
    /vp of infrastructure|vice president of infrastructure|technical approver/.test(raw)
  ) {
    return "USER";
  }
  if (/\babsent\b/.test(raw)) {
    if (/\b(cfo|economic buyer|budget owner|vp finance)\b/.test(raw)) return "ECONOMIC_BUYER";
    return "USER";
  }
  if (/\b(economic buyer|cfo|vp finance|budget owner)\b/.test(raw) || /\bbuyer\b/.test(raw)) {
    return "ECONOMIC_BUYER";
  }
  if (/champion|sponsor|coach/.test(raw)) return "CHAMPION";
  if (/user|evaluator|end.?user/.test(raw)) return "USER";
  return "USER";
}

function mapStakeholders(stakeholders: BridgeStakeholder[]): StakeholderProfile[] {
  if (!stakeholders.length) {
    return [{ role: "CHAMPION", name: "Unknown", status: "ACTIVE" }];
  }
  return stakeholders.map((s, i) => {
    const role = mapPersonaToRole(s);
    const raw = `${s.persona_type ?? ""} ${s.stance ?? ""}`.toLowerCase();
    const silent = /inactive|suppressed|absent|silent/.test(raw);
    const hostile = /detractor|blocker|oppos/.test(raw);
    return {
      id: `s-${i}`,
      name: s.name,
      role: hostile ? "DETRACTOR" : silent && role === "CHAMPION" ? "DETRACTOR" : role,
      status: silent || hostile ? "SILENT" : "ACTIVE",
      lastObservedSignal: (s.evidence ?? "").slice(0, 200),
    };
  });
}

function hasAuthorityGap(stakeholders: BridgeStakeholder[]): boolean {
  return stakeholders.some((s) =>
    /absent decision maker|absent/i.test(`${s.persona_type ?? ""} ${s.stance ?? ""}`)
  );
}

/**
 * Banded telemetry so ordinal risk matches Force Interaction health:
 * velocity (healthy) << authority-gap recoverable << structurally locked.
 */
export function telemetryFromAnalysis(
  frozen: BridgeFrozen,
  stakeholders: BridgeStakeholder[],
  stall: BridgeStall,
  opts?: {
    stage?: string | null;
    daysStalled?: number;
    unansweredEmails?: number;
    contractValue?: number;
    dealType?: string | null;
    commercialIntentScore?: number | null;
  }
): EngineMatrixDecision & { telemetry_inputs: DriInputRecord[] } {
  const mapped = mapStakeholders(stakeholders);
  const authorityGap = hasAuthorityGap(stakeholders);
  const locked =
    /NON-VIABLE|DEAD|DEFERRED \(locked\)/i.test(frozen.trajectory_type) ||
    (frozen.structural_lock_in >= 80 && frozen.constraint_pressure >= 70);
  const healthy =
    frozen.viability_score >= 70 &&
    frozen.constraint_pressure < 40 &&
    frozen.structural_lock_in < 40;

  let stage = opts?.stage ?? "PROPOSAL_REVIEW";
  let daysStalled: number;
  let unanswered: number;
  let sentiment: ProspectSentiment;
  let deltaT: number;

  if (opts?.daysStalled != null && opts?.unansweredEmails != null) {
    daysStalled = opts.daysStalled;
    unanswered = opts.unansweredEmails;
    sentiment =
      frozen.constraint_pressure >= 70
        ? "NEGATIVE"
        : stall.score >= 55
          ? "GHOSTING"
          : healthy
            ? "POSITIVE"
            : "NEUTRAL";
    deltaT = Math.min(21, Math.round(stall.score / 8));
  } else if (healthy) {
    // On-track: under stage μ, positive sentiment, no entropy (Model 2 shape → ~14 or lower)
    stage = opts?.stage ?? "DEMO";
    daysStalled = 3;
    unanswered = 0;
    sentiment = "POSITIVE";
    deltaT = 1;
  } else if (locked) {
    // Structurally blocked / audit stall — apex band
    stage =
      opts?.stage ??
      (stall.handoff_mention_count >= 2 || frozen.structural_lock_in >= 70
        ? "LEGAL_SECURITY"
        : "PROPOSAL_REVIEW");
    // For LEGAL μ=21: need high Z for CRITICAL — use proposal stage for locked commercial stalls
    if (!opts?.stage && frozen.constraint_pressure >= 70) stage = "PROPOSAL_REVIEW";
    daysStalled = stage === "LEGAL_SECURITY" ? 45 : 22;
    unanswered = Math.max(3, stall.deferral_phrase_count || 3);
    sentiment = "NEGATIVE";
    deltaT = 2;
  } else {
    // Recoverable / mixed — mid band (Sarah/Mark authority gap ≈ 45–74)
    stage = opts?.stage ?? "PROPOSAL_REVIEW";
    daysStalled = 10 + (authorityGap ? 1 : 0);
    unanswered = 1;
    sentiment =
      frozen.viability_score >= 30
        ? "NEUTRAL"
        : stall.score >= 70
          ? "GHOSTING"
          : "NEUTRAL";
    deltaT = 6;
  }

  const observedCrm = opts?.daysStalled != null && opts?.unansweredEmails != null;
  const contractValue = opts?.contractValue ?? 0;
  const dealType = opts?.dealType ?? "NEW_LOGO";
  const commercialIntentScore = opts?.commercialIntentScore ?? 80;
  const telemetry_inputs: DriInputRecord[] = [
    {
      field: "stage",
      value: stage,
      basis: opts?.stage ? "observed_crm" : "inferred_proxy",
      reason: opts?.stage
        ? "Stage was supplied with the deal."
        : "No CRM stage was supplied. The matrix used a proxy stage for this viability band.",
    },
    {
      field: "days_stalled",
      value: String(daysStalled),
      basis: observedCrm ? "observed_crm" : "inferred_proxy",
      reason: observedCrm
        ? "Days stalled were supplied as CRM telemetry."
        : "Days stalled were not observed. This number is a proxy for the viability band, not a CRM measurement.",
    },
    {
      field: "unanswered_emails",
      value: String(unanswered),
      basis: observedCrm ? "observed_crm" : "inferred_proxy",
      reason: observedCrm
        ? "Unanswered emails were supplied as CRM telemetry."
        : "Unanswered emails were not observed. This count is a proxy, not a CRM measurement.",
    },
    {
      field: "sentiment",
      value: sentiment,
      basis: "inferred_proxy",
      reason: "Sentiment is inferred from constraint, stall, and viability. It is not an observed CRM sentiment field.",
    },
    {
      field: "delta_t",
      value: String(deltaT),
      basis: "inferred_proxy",
      reason: "Days since the sentiment signal are inferred from the stall score. They are not an observed timestamp.",
    },
    {
      field: "contract_value",
      value: String(contractValue),
      basis: opts?.contractValue != null ? "observed_crm" : "default",
      reason: opts?.contractValue != null ? "Contract value was supplied." : "No contract value was supplied. The matrix used 0.",
    },
    {
      field: "commercial_intent_score",
      value: String(commercialIntentScore),
      basis: opts?.commercialIntentScore != null ? "observed_crm" : "default",
      reason: opts?.commercialIntentScore != null
        ? "Commercial intent score was supplied."
        : "No commercial intent score was supplied. The matrix used its default.",
    },
    {
      field: "stakeholder_matrix_roles",
      value: mapped.map((person) => `${person.name}:${person.role}`).join(", ") || "none",
      basis: "inferred_proxy",
      reason:
        "Persona labels are mapped into the risk matrix. A technical approver is not an economic buyer. This mapping is not observed CRM role data.",
    },
  ];

  return {
    ...calculateDRI({
      stage,
      daysStalled,
      unansweredEmails: unanswered,
      sentiment,
      deltaT,
      contractValue,
      stakeholders: mapped,
      dealType,
      commercialIntentScore,
    }),
    telemetry_inputs,
  };
}

export function formatDriFormula(decision: EngineMatrixDecision): string {
  const b = decision.breakdown;
  return `DRI ${decision.dri} = Δ${b.deltaVelocity} + Φ${b.phiEntropy} + Ψ${b.psiSentiment} + Γ${b.gammaStakeholder} (Z=${b.zStall})`;
}
