/**
 * Map Force Interaction analysis state → non-linear DRI telemetry.
 * Force map remains evidence input; matrix owns the published Deal Risk Index.
 */

import { calculateDRI, type EngineMatrixDecision, type StakeholderProfile } from "./matrix.js";
import type { ProspectSentiment, StakeholderRole } from "./config.js";

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
  const raw = `${s.persona_type ?? ""} ${s.stance ?? ""} ${s.role ?? ""}`.toLowerCase();
  if (/detractor|blocker|oppos/.test(raw)) return "DETRACTOR";
  if (/economic|buyer|cfo|vp finance|decision maker|budget/.test(raw)) return "ECONOMIC_BUYER";
  if (/champion|sponsor|coach/.test(raw)) return "CHAMPION";
  if (/user|evaluator|end.?user/.test(raw)) return "USER";
  if (/absent/.test(raw)) return "ECONOMIC_BUYER";
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
): EngineMatrixDecision {
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

  return calculateDRI({
    stage,
    daysStalled,
    unansweredEmails: unanswered,
    sentiment,
    deltaT,
    contractValue: opts?.contractValue ?? 0,
    stakeholders: mapped,
    dealType: opts?.dealType ?? "NEW_LOGO",
    commercialIntentScore: opts?.commercialIntentScore ?? 80,
  });
}

export function formatDriFormula(decision: EngineMatrixDecision): string {
  const b = decision.breakdown;
  return `DRI ${decision.dri} = Δ${b.deltaVelocity} + Φ${b.phiEntropy} + Ψ${b.psiSentiment} + Γ${b.gammaStakeholder} (Z=${b.zStall})`;
}
