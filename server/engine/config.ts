/**
 * Calibrated engine parameters (architecture/benchmarks.md).
 */

export type StageId =
  | "DISCOVERY"
  | "QUALIFICATION"
  | "TECHNICAL_VALIDATION"
  | "DEMO"
  | "PROPOSAL_REVIEW"
  | "LEGAL_SECURITY"
  | "PROCUREMENT";

export type StageBenchmark = {
  id: StageId;
  mu: number;
  sigma: number;
  label: string;
};

/** Industry-standard stage latency norms for Z_stall. */
export const StageBenchmarks: Record<StageId, StageBenchmark> = {
  DISCOVERY: {
    id: "DISCOVERY",
    mu: 7,
    sigma: 2,
    label: "Discovery / Qualification",
  },
  QUALIFICATION: {
    id: "QUALIFICATION",
    mu: 7,
    sigma: 2,
    label: "Discovery / Qualification",
  },
  TECHNICAL_VALIDATION: {
    id: "TECHNICAL_VALIDATION",
    mu: 10,
    sigma: 3,
    label: "Technical Validation / Demo",
  },
  DEMO: {
    id: "DEMO",
    mu: 10,
    sigma: 3,
    label: "Technical Validation / Demo",
  },
  PROPOSAL_REVIEW: {
    id: "PROPOSAL_REVIEW",
    mu: 10,
    sigma: 3,
    label: "Proposal / Pricing Review",
  },
  LEGAL_SECURITY: {
    id: "LEGAL_SECURITY",
    mu: 21,
    sigma: 7,
    label: "Legal / Security / Procurement",
  },
  PROCUREMENT: {
    id: "PROCUREMENT",
    mu: 21,
    sigma: 7,
    label: "Legal / Security / Procurement",
  },
};

export const GlobalParameters = {
  /** Velocity decay rate λ */
  lambda: 0.85,
  /** Max entropy penalty β */
  beta: 35.0,
  /** Unanswered email scaling α */
  alpha: 0.5,
  /** Sentiment memory half-life τ (days) */
  tau: 14.0,
  /** Stakeholder risk coefficient before authority weights */
  gammaScale: 15,
  /** Gate 0 commercial intent floor */
  commercialIntentFloor: 20,
  /** Champion silence threshold → DETRACTOR */
  championSilenceEmails: 3,
  /** Manual review DRI threshold */
  manualReviewDri: 85,
  /** Unanswered count that forces manual review */
  manualReviewUnanswered: 4,
} as const;

export type StakeholderRole =
  | "CHAMPION"
  | "ECONOMIC_BUYER"
  | "BLOCKER"
  | "DETRACTOR"
  | "USER";

/** Authority matrix Wᵢ */
export const AuthorityWeights: Record<StakeholderRole, number> = {
  ECONOMIC_BUYER: 0.45,
  CHAMPION: 0.3,
  BLOCKER: 0.15,
  DETRACTOR: 0.15,
  USER: 0.1,
};

export type ProspectSentiment = "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "GHOSTING";

export const SentimentBaseWeights: Record<ProspectSentiment, number> = {
  POSITIVE: 0,
  NEUTRAL: 12,
  GHOSTING: 25,
  NEGATIVE: 40,
};

const STAGE_ALIASES: Record<string, StageId> = {
  DISCOVERY: "DISCOVERY",
  QUALIFICATION: "QUALIFICATION",
  TECHNICAL_VALIDATION: "TECHNICAL_VALIDATION",
  TECH_VALIDATION: "TECHNICAL_VALIDATION",
  DEMO: "DEMO",
  PROPOSAL: "PROPOSAL_REVIEW",
  PROPOSAL_REVIEW: "PROPOSAL_REVIEW",
  PRICING: "PROPOSAL_REVIEW",
  PRICING_REVIEW: "PROPOSAL_REVIEW",
  LEGAL: "LEGAL_SECURITY",
  SECURITY: "LEGAL_SECURITY",
  LEGAL_SECURITY: "LEGAL_SECURITY",
  PROCUREMENT: "PROCUREMENT",
};

export function resolveStageBenchmark(
  stage?: string | null,
  fallbackMu = 14,
  fallbackSigma = 5
): { mu: number; sigma: number; stageId: StageId | null } {
  if (!stage) return { mu: fallbackMu, sigma: fallbackSigma, stageId: null };
  const key = stage.trim().toUpperCase().replace(/[\s\-]+/g, "_");
  const id = STAGE_ALIASES[key];
  if (!id) return { mu: fallbackMu, sigma: fallbackSigma, stageId: null };
  const b = StageBenchmarks[id];
  return { mu: b.mu, sigma: b.sigma, stageId: id };
}
