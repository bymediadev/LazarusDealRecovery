/**
 * Run metadata for diagnostic reproducibility.
 * Does not store transcript text — only versions and normalized scoring inputs.
 */

export const SCORING_ENGINE_VERSION = "2026.11.06-integrity";
export const EXTRACTION_SCHEMA_VERSION = "enterprise-analysis-v2";
export const FORMULA_CONFIG_VERSION = "viability-v1+dri-cap42";

export interface DiagnosticRunMetadata {
  scoring_engine_version: string;
  extraction_schema_version: string;
  formula_config_version: string;
  model_provider?: string;
  model_version?: string;
  scored_at: string;
}

export function buildDiagnosticRunMetadata(opts?: {
  modelProvider?: string;
  modelVersion?: string;
}): DiagnosticRunMetadata {
  return {
    scoring_engine_version: SCORING_ENGINE_VERSION,
    extraction_schema_version: EXTRACTION_SCHEMA_VERSION,
    formula_config_version: FORMULA_CONFIG_VERSION,
    model_provider: opts?.modelProvider,
    model_version: opts?.modelVersion,
    scored_at: new Date().toISOString(),
  };
}

/** Effective intent: intent × (100−constraint)/100 × (1 + enabler/200), clamped 0–100 (matches server/scoring.ts). */
export function computeEffectiveIntent(intent: number, constraint: number, enabler: number): number {
  const constraintFactor = constraint <= 0 ? 1 : (100 - constraint) / 100;
  const enablerMultiplier = enabler <= 0 ? 1 : 1 + enabler / 200;
  const raw = intent * constraintFactor * enablerMultiplier;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

export { findTechnicalVetoHolder, findEconomicDecisionMaker, findInvisibleVetoOrMissingAuthority } from "./authorityRoles";
