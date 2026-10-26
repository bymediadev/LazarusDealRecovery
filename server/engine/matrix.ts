/**
 * Turbo 1 — Gate 0 + non-linear Deal Risk Index matrix.
 * Calibration: docs/architecture/benchmarks.md + FRAMEWORK_CONTRACT.md
 */

import {
  AuthorityWeights,
  GlobalParameters,
  SentimentBaseWeights,
  resolveStageBenchmark,
  type ProspectSentiment,
  type StakeholderRole,
} from "./config.js";

export type DealType =
  | "PEER_NETWORKING"
  | "ENTERPRISE_RENEWAL"
  | "NEW_LOGO"
  | "EXPANSION"
  | "UNKNOWN"
  | string;

export interface StakeholderProfile {
  id?: string;
  name?: string;
  role: StakeholderRole;
  engagementScore?: number;
  lastObservedSignal?: string;
  status?: "ACTIVE" | "SILENT" | "DETRACTOR" | string;
  weight?: number;
}

export interface GateZeroInput {
  dealType?: DealType | null;
  commercialIntentScore?: number | null;
  daysStalled?: number;
  unansweredEmails?: number;
}

export interface GateZeroResult {
  omega: 0 | 1;
  targetStage: "NOT_A_DEAL" | "PASSED";
  dri: number;
  action: "SUPPRESS_OUTREACH" | "CONTINUE";
  reason?: string;
}

export type EngineTargetStage =
  | "STALLED"
  | "RE_ENGAGED"
  | "ESCALATED"
  | "REQUIRES_MANUAL_REVIEW"
  | "NOT_A_DEAL";

export type EngineActionTrigger =
  | "SEND_REENGAGEMENT_EMAIL"
  | "SEND_EXECUTIVE_BUMP"
  | "PAUSE_WORKFLOW"
  | "SUPPRESS_OUTREACH"
  | "QUEUE_PATTERN_INTERRUPT";

export interface RefinedDealInputPayload {
  dealId?: string;
  stage?: string | null;
  tStalled?: number;
  daysStalled?: number;
  muStage?: number;
  sigmaStage?: number;
  unansweredCount?: number;
  unansweredEmails?: number;
  lastProspectSentiment?: ProspectSentiment;
  sentiment?: ProspectSentiment;
  daysSinceSentimentSignal?: number;
  deltaT?: number;
  contractValue?: number;
  stakeholders?: StakeholderProfile[];
  dealType?: DealType | null;
  commercialIntentScore?: number | null;
}

export interface DriBreakdown {
  deltaVelocity: number;
  phiEntropy: number;
  psiSentiment: number;
  gammaStakeholder: number;
  zStall: number;
}

export interface EngineMatrixDecision {
  targetStage: EngineTargetStage;
  riskIndex: number;
  dri: number;
  rawDri: number;
  actionTrigger: EngineActionTrigger;
  templateId: string;
  reprofiledStakeholders: StakeholderProfile[];
  breakdown: DriBreakdown;
  omega: 0 | 1;
}

export function evaluateGateZero(input: GateZeroInput): GateZeroResult {
  const dealType = String(input.dealType ?? "").toUpperCase();
  const score =
    input.commercialIntentScore === null || input.commercialIntentScore === undefined
      ? null
      : Number(input.commercialIntentScore);

  if (
    dealType === "PEER_NETWORKING" ||
    (score !== null && !Number.isNaN(score) && score < GlobalParameters.commercialIntentFloor)
  ) {
    return {
      omega: 0,
      targetStage: "NOT_A_DEAL",
      dri: 0,
      action: "SUPPRESS_OUTREACH",
      reason: "Gate 0 Reality Filter: Non-commercial interaction or low opportunity score.",
    };
  }

  return {
    omega: 1,
    targetStage: "PASSED",
    dri: 0,
    action: "CONTINUE",
  };
}

function reprofileStakeholders(
  stakeholders: StakeholderProfile[],
  unanswered: number
): StakeholderProfile[] {
  return stakeholders.map((s) => {
    if (
      s.role === "CHAMPION" &&
      unanswered >= GlobalParameters.championSilenceEmails
    ) {
      return {
        ...s,
        role: "DETRACTOR" as const,
        status: "DETRACTOR",
        lastObservedSignal:
          s.lastObservedSignal ||
          `Champion un-engaged across ${unanswered}+ touchpoints`,
      };
    }
    if (s.status === "DETRACTOR" && s.role === "CHAMPION") {
      return { ...s, role: "DETRACTOR" as const };
    }
    return { ...s };
  });
}

function roleWeight(s: StakeholderProfile): number {
  if (typeof s.weight === "number" && !Number.isNaN(s.weight)) return s.weight;
  return AuthorityWeights[s.role] ?? AuthorityWeights.USER;
}

function isRiskRole(role: StakeholderRole): boolean {
  return role === "BLOCKER" || role === "DETRACTOR";
}

/**
 * Non-linear DRI. Prefer calculateDRI for report + calibration suite.
 */
export function calculateDRI(telemetry: RefinedDealInputPayload): EngineMatrixDecision {
  const gate = evaluateGateZero({
    dealType: telemetry.dealType,
    commercialIntentScore: telemetry.commercialIntentScore,
    daysStalled: telemetry.daysStalled ?? telemetry.tStalled,
    unansweredEmails: telemetry.unansweredEmails ?? telemetry.unansweredCount,
  });
  if (gate.omega === 0) {
    return {
      targetStage: "NOT_A_DEAL",
      riskIndex: 0,
      dri: 0,
      rawDri: 0,
      actionTrigger: "SUPPRESS_OUTREACH",
      templateId: "SUPPRESS_V1",
      reprofiledStakeholders: telemetry.stakeholders ?? [],
      breakdown: {
        deltaVelocity: 0,
        phiEntropy: 0,
        psiSentiment: 0,
        gammaStakeholder: 0,
        zStall: 0,
      },
      omega: 0,
    };
  }

  const tStalled = telemetry.tStalled ?? telemetry.daysStalled ?? 0;
  const unanswered =
    telemetry.unansweredCount ?? telemetry.unansweredEmails ?? 0;
  const sentiment: ProspectSentiment =
    telemetry.lastProspectSentiment ?? telemetry.sentiment ?? "NEUTRAL";
  const deltaT =
    telemetry.daysSinceSentimentSignal ?? telemetry.deltaT ?? 0;
  const contractValue = telemetry.contractValue ?? 0;

  const resolved = resolveStageBenchmark(telemetry.stage);
  const muStage = telemetry.muStage ?? resolved.mu;
  const sigmaStage = Math.max(1e-9, telemetry.sigmaStage ?? resolved.sigma);

  const stakeholders = reprofileStakeholders(
    telemetry.stakeholders ?? [],
    unanswered
  );

  // 1. Stage volatility Z-score & Δ velocity
  const zStall = Math.max(0, (tStalled - muStage) / sigmaStage);
  const deltaVelocity =
    100 * (1 - Math.exp(-GlobalParameters.lambda * zStall));

  // 2. Touchpoint entropy Φ
  const phiEntropy =
    GlobalParameters.beta *
    (1 - Math.exp(-GlobalParameters.alpha * unanswered));

  // 3. Sentiment memory decay Ψ
  const psiBase = SentimentBaseWeights[sentiment] ?? SentimentBaseWeights.GHOSTING;
  const psiSentiment =
    psiBase * Math.exp(-(Math.LN2 / GlobalParameters.tau) * deltaT);

  // 4. Stakeholder authority Γ = 15 * (Σ W_risk / Σ W_all)
  const riskWeightSum = stakeholders
    .filter((s) => isRiskRole(s.role))
    .reduce((acc, s) => acc + roleWeight(s), 0);
  const allWeightSum = stakeholders.reduce((acc, s) => acc + roleWeight(s), 0);
  const gammaStakeholder =
    allWeightSum > 0
      ? GlobalParameters.gammaScale * (riskWeightSum / allWeightSum)
      : 0;

  const rawDri = deltaVelocity + phiEntropy + psiSentiment + gammaStakeholder;
  const riskIndex = Math.min(100, Math.max(0, Math.round(rawDri)));

  const breakdown: DriBreakdown = {
    deltaVelocity: Math.round(deltaVelocity * 100) / 100,
    phiEntropy: Math.round(phiEntropy * 100) / 100,
    psiSentiment: Math.round(psiSentiment * 100) / 100,
    gammaStakeholder: Math.round(gammaStakeholder * 100) / 100,
    zStall: Math.round(zStall * 100) / 100,
  };

  if (
    riskIndex >= GlobalParameters.manualReviewDri ||
    unanswered >= GlobalParameters.manualReviewUnanswered
  ) {
    return {
      targetStage: "REQUIRES_MANUAL_REVIEW",
      riskIndex,
      dri: riskIndex,
      rawDri,
      actionTrigger: "PAUSE_WORKFLOW",
      templateId: "MANUAL_ESCALATION_V1",
      reprofiledStakeholders: stakeholders,
      breakdown,
      omega: 1,
    };
  }

  if (tStalled >= 14 && contractValue >= 25000) {
    return {
      targetStage: "ESCALATED",
      riskIndex,
      dri: riskIndex,
      rawDri,
      actionTrigger: "SEND_EXECUTIVE_BUMP",
      templateId: "EXEC_BREAKTHROUGH_V2",
      reprofiledStakeholders: stakeholders,
      breakdown,
      omega: 1,
    };
  }

  if (riskIndex >= GlobalParameters.manualReviewDri - 10 || unanswered >= 3) {
    return {
      targetStage: riskIndex >= 70 ? "STALLED" : "RE_ENGAGED",
      riskIndex,
      dri: riskIndex,
      rawDri,
      actionTrigger: "QUEUE_PATTERN_INTERRUPT",
      templateId: "SOFT_REENGAGE_V1",
      reprofiledStakeholders: stakeholders,
      breakdown,
      omega: 1,
    };
  }

  return {
    targetStage: "RE_ENGAGED",
    riskIndex,
    dri: riskIndex,
    rawDri,
    actionTrigger: "SEND_REENGAGEMENT_EMAIL",
    templateId: "SOFT_REENGAGE_V1",
    reprofiledStakeholders: stakeholders,
    breakdown,
    omega: 1,
  };
}

/** Alias matching Hardened spec class name. */
export class AdvancedDeterministicEngineMatrix {
  public static evaluate(payload: RefinedDealInputPayload): EngineMatrixDecision {
    return calculateDRI(payload);
  }
}

export class DeterministicEngineMatrix {
  public static evaluate(payload: RefinedDealInputPayload): EngineMatrixDecision {
    return calculateDRI(payload);
  }
}
