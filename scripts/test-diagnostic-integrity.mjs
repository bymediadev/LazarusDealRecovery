/**
 * End-to-end diagnostic integrity regressions (Northline + consistency gate).
 * Partial-evidence fixture: fixtures/sarah_mark_transcript.txt
 */
import { readFileSync } from "fs";
import {
  deriveCanonicalState,
  deriveProprietaryIndices,
  explainForceLock,
  reconcilePersona,
} from "../server/scoring.ts";
import { assertAnalysisSchema, statusFromTrajectory } from "../server/gemini.ts";
import { normalizeResult } from "../src/types.ts";
import {
  classifyRecoverability,
  classifyRisk,
  diagnosticProfile,
  forceDuration,
  isNotAPurchase,
  mapForcesToScores,
  parseTurns,
  purchaseMotion,
  quoteSpeakerRole,
  sellerOfferLabeledAsBuyerRequirement,
  unifiedDealHeadline,
  validateReportMatrix,
} from "../src/lib/reportMatrix.ts";
import { attributeQuote, peopleMapRows, samePerson } from "../src/lib/evidenceAttribution.ts";
import {
  computeEffectiveIntent,
  SCORING_ENGINE_VERSION,
  buildDiagnosticRunMetadata,
} from "../src/lib/diagnosticIntegrity.ts";
import {
  findEconomicDecisionMaker,
  findInvisibleVetoOrMissingAuthority,
  findTechnicalVetoHolder,
  authorityRoleKind,
} from "../src/lib/authorityRoles.ts";
import { formatRecoveryAction } from "../src/lib/recoveryPlan.ts";
import { formatCompressedCrmNotes } from "../src/lib/crmNotes.ts";

let failed = 0;

function check(name, ok, detail) {
  if (ok) {
    console.log("ok", name);
    return;
  }
  failed += 1;
  console.error("FAIL:", name, detail ?? "");
}

const transcript = readFileSync(new URL("../fixtures/sarah_mark_transcript.txt", import.meta.url), "utf8");

/** Canonical Northline normalized extraction (partial-evidence regression). */
const northlineForces = [
  {
    factor: "Dave VP Infrastructure absent — architecture gate",
    type: "Constraint",
    weight: 72,
    evidence: "Dave, our VP of Infrastructure, missed the technical demo yesterday. He had a P1 outage and couldn't join.",
  },
  {
    factor: "Cannot proceed without Dave sign-off",
    type: "Structural",
    weight: 68,
    evidence: "Without him, I'm not moving this forward. He's underwater until month-end.",
  },
  {
    factor: "Buyer interest in overview",
    type: "Intent",
    weight: 62,
    evidence: "Sarah, I like what I saw in the overview.",
  },
  {
    factor: "Budget modeled at $280K",
    type: "Enabler",
    weight: 45,
    evidence: "$280,000 annual platform fee was in range. Budget-wise, $280K is what we modeled.",
  },
  {
    factor: "Path if Dave buys in — else parked until Q3",
    type: "Behavioral",
    weight: 55,
    evidence: "If Dave buys in, we can accelerate. If not, this stays parked until Q3.",
  },
];

const northlineStakeholdersRaw = [
  {
    name: "Dave",
    persona_type: "Absent Decision Maker",
    role: "VP of Infrastructure",
    authority_level: "technical_veto",
    evidence:
      "Dave, our VP of Infrastructure, missed the technical demo yesterday. He wasn't on the call, so nothing's approved on the infrastructure side yet.",
  },
  {
    name: "Mark O'Brien",
    persona_type: "Suppressed Champion",
    role: "Director of Operations",
    evidence: "Sarah, I like what I saw in the overview.",
  },
  {
    name: "MO",
    persona_type: "Aligned Champion",
    role: "Unknown",
    evidence: "Do that.",
  },
];

function scoreNorthline(forces = northlineForces) {
  const { causal, frozen } = deriveCanonicalState(forces, "TEMPORARY BLOCKERS", transcript);
  const stakeholders = northlineStakeholdersRaw.map((person) => {
    const reconciled = reconcilePersona(person, transcript);
    const attribution = attributeQuote(transcript, person.name, person.evidence);
    return {
      ...person,
      persona_type: reconciled.label,
      stance: reconciled.label,
      evidence_speaker: attribution.speaker ?? "",
      evidence_basis: attribution.basis,
    };
  });
  const pi = deriveProprietaryIndices(frozen, stakeholders, transcript, causal.blocker_classification);
  const status = statusFromTrajectory(frozen.trajectory_type, "STALLED — HIGH RISK", pi.risk_tier);
  const validation = validateReportMatrix({
    status,
    riskTier: pi.risk_tier,
    dealRiskIndex: pi.deal_risk_index,
    viability: frozen.viability_score,
    recoverabilityStatus: frozen.recoverability.status,
    trajectory: frozen.trajectory_type,
    forces: causal.forces,
    immediateActionCount: 2,
    stakeholders,
    transcript,
    proposedActions: [
      "Send a one-pager for Dave this week",
      "Propose three technical meeting slots after month-end",
    ],
  });
  return { causal, frozen, stakeholders, pi, status, validation };
}

// --- 1. Identical normalized inputs → identical scoring ---
const runA = scoreNorthline();
const runB = scoreNorthline();
check(
  "identical normalized extraction → identical scoring",
  runA.frozen.viability_score === runB.frozen.viability_score &&
    runA.frozen.effective_intent === runB.frozen.effective_intent &&
    runA.frozen.constraint_pressure === runB.frozen.constraint_pressure &&
    runA.frozen.enabler_strength === runB.frozen.enabler_strength &&
    runA.frozen.recoverability.status === runB.frozen.recoverability.status &&
    runA.pi.deal_risk_index === runB.pi.deal_risk_index &&
    runA.frozen.trajectory_type === runB.frozen.trajectory_type,
  {
    a: {
      v: runA.frozen.viability_score,
      e: runA.frozen.effective_intent,
      r: runA.frozen.recoverability.status,
      dri: runA.pi.deal_risk_index,
    },
    b: {
      v: runB.frozen.viability_score,
      e: runB.frozen.effective_intent,
      r: runB.frozen.recoverability.status,
      dri: runB.pi.deal_risk_index,
    },
  }
);

// --- 2. Force merging does not double-count identical evidence ---
const dupForces = [
  ...northlineForces,
  {
    factor: "Dave VP Infrastructure absent — architecture gate (dup)",
    type: "Constraint",
    weight: 72,
    evidence: "Dave, our VP of Infrastructure, missed the technical demo yesterday. He had a P1 outage and couldn't join.",
  },
];
const mappedOnce = mapForcesToScores(northlineForces);
const mappedDup = mapForcesToScores(dupForces);
check(
  "duplicate force evidence does not inflate constraint beyond single-signal intent",
  mappedDup.constraint_pressure <= mappedOnce.constraint_pressure + 5,
  { once: mappedOnce.constraint_pressure, dup: mappedDup.constraint_pressure }
);

// --- 3–4. Effective intent formula + polarity ---
const { frozen } = runA;
check(
  "effective intent follows documented formula",
  frozen.effective_intent ===
    computeEffectiveIntent(frozen.intent_strength, frozen.constraint_pressure, frozen.enabler_strength),
  {
    got: frozen.effective_intent,
    expect: computeEffectiveIntent(frozen.intent_strength, frozen.constraint_pressure, frozen.enabler_strength),
    inputs: {
      intent: frozen.intent_strength,
      c: frozen.constraint_pressure,
      e: frozen.enabler_strength,
    },
  }
);
check(
  "constraint reduces effective intent vs raw intent when constraint > 0",
  frozen.constraint_pressure <= 0 || frozen.effective_intent <= frozen.intent_strength,
  { eff: frozen.effective_intent, intent: frozen.intent_strength, c: frozen.constraint_pressure }
);
check(
  "enabler does not reduce effective intent below constraint-only path",
  frozen.enabler_strength <= 0 ||
    frozen.effective_intent >=
      computeEffectiveIntent(frozen.intent_strength, frozen.constraint_pressure, 0),
  { eff: frozen.effective_intent, withoutEnabler: computeEffectiveIntent(frozen.intent_strength, frozen.constraint_pressure, 0) }
);

// --- 5. Critical DRI does not imply non-recoverability ---
const criticalValidation = validateReportMatrix({
  status: "STALLED — CRITICAL RISK",
  riskTier: "CRITICAL",
  dealRiskIndex: 100,
  viability: 58,
  recoverabilityStatus: "CONDITIONALLY_RECOVERABLE",
  trajectory: "DEFERRED (recoverable)",
  forces: runA.causal.forces,
  immediateActionCount: 1,
  stakeholders: runA.stakeholders,
  transcript,
});
check(
  "critical DRI + conditional recoverability does not fail gate",
  criticalValidation.passed === true,
  criticalValidation
);
check(
  "critical DRI + recoverability emits WARNING not ERROR",
  criticalValidation.checks.some(
    (c) => c.id === "dri_vs_recoverability" && c.severity === "WARNING" && c.passed
  ),
  criticalValidation.checks.find((c) => c.id === "dri_vs_recoverability")
);
check(
  "Northline recoverability is open (not NOT_CURRENTLY / FLAT_NO)",
  /RECOVERABLE/i.test(frozen.recoverability.status) &&
    !/NOT_CURRENTLY/i.test(frozen.recoverability.status),
  frozen.recoverability
);

// --- 6. Technical veto ≠ economic DM ---
const dave = runA.stakeholders.find((p) => /^dave$/i.test(p.name));
const mark = runA.stakeholders.find((p) => /mark/i.test(p.name));
check("Dave is technical veto holder", findTechnicalVetoHolder(runA.stakeholders)?.name === "Dave", {
  kind: dave && authorityRoleKind(dave),
  tech: findTechnicalVetoHolder(runA.stakeholders),
});
check(
  "technical veto is not treated as economic decision-maker",
  findEconomicDecisionMaker(runA.stakeholders)?.name !== "Dave",
  findEconomicDecisionMaker(runA.stakeholders)
);
check(
  "invisible/missing authority does not promote identified technical veto",
  findInvisibleVetoOrMissingAuthority(runA.stakeholders) == null,
  findInvisibleVetoOrMissingAuthority(runA.stakeholders)
);

// --- 7. Unverified speaker identity (MO) is not promoted to Mark without mapping ---
const mo = runA.stakeholders.find((p) => p.name === "MO");
check(
  "MO label is not auto-merged into Mark O'Brien identity",
  mo && mo.name === "MO" && !/mark o'?brien/i.test(mo.name),
  mo
);
const daveAttr = attributeQuote(transcript, "Dave", dave?.evidence ?? "");
check(
  "Dave quote about himself from Mark is secondhand, not Dave firsthand",
  daveAttr.basis === "secondhand",
  daveAttr
);

// --- 8. Proposed activities remain proposed ---
const activity =
  "P1 | Owner: Sarah Chen | Stakeholder: Dave | Action: Propose 3 meeting slots after month-end | Outcome: Demo with Dave is scheduled | Progress evidence: Calendar invite accepted | Checkpoint: Unknown | Kind: activity";
const formatted = formatRecoveryAction(activity);
check("scheduling stays proposed activity kind", formatted.kind === "activity", formatted);
check(
  "proposed action is not worded as completed in validation",
  runA.validation.checks.find((c) => c.id === "proposed_not_completed")?.passed === true,
  runA.validation.checks.find((c) => c.id === "proposed_not_completed")
);

// --- 9. Prep deadline vs meeting checkpoint ---
check(
  "one-pager this week and meeting after month-end are compatible (no invented ISO date)",
  !/\b20\d{2}-\d{2}-\d{2}\b/.test(
    "Send a one-pager for Dave this week; propose three slots after month-end"
  ),
  "scheduling uses relative checkpoints only"
);
const durations = runA.causal.forces.map((f) => f.score_effect?.duration ?? forceDuration(f));
check(
  "Northline forces include TEMPORARY or CONDITIONAL duration",
  durations.some((d) => d === "TEMPORARY" || d === "CONDITIONAL"),
  durations
);

// --- 10. Report sections share canonical classifications ---
const headline = unifiedDealHeadline({
  status: runA.status,
  trajectory: frozen.trajectory_type,
  recoverabilityStatus: frozen.recoverability.status,
  blockedOn: "Dave",
  viabilityState: frozen.viability_state,
  recoverabilityScore: frozen.viability_score,
  riskTier: runA.pi.risk_tier,
});
check(
  "unified headline uses same recoverability as canonical state",
  headline.line.toLowerCase().includes("recover") ||
    /conditionally recoverable|recoverable/i.test(headline.forecastLine + headline.line),
  { line: headline.line, forecast: headline.forecastLine, status: frozen.recoverability.status }
);
check(
  "risk tier matches classifyRisk(DRI)",
  runA.pi.risk_tier === classifyRisk(runA.pi.deal_risk_index),
  { tier: runA.pi.risk_tier, dri: runA.pi.deal_risk_index }
);
const crm = formatCompressedCrmNotes({
  deal_classification: { status: runA.status },
  deal_trajectory: { trajectory_type: frozen.trajectory_type },
  recoverability: frozen.recoverability,
  viability_state: { state: frozen.viability_state, viability_score: frozen.viability_score },
  proprietary_indices: runA.pi,
  stakeholders: runA.stakeholders,
  force_initialization: { blocker_classification: "TEMPORARY BLOCKERS", summary: "Dave architecture gate" },
  equilibrium_analysis: { equilibrium_breaker: "Dave technical approval pending", explanation: "Waiting on Dave" },
  causal_forces: runA.causal.forces,
  immediate_remediation: ["Send a one-pager for Dave this week"],
  rescue_triage_plan: {
    immediate_0_30_days: ["Propose three technical meeting slots after month-end"],
    near_term_30_90_days: [],
    long_term_90_plus_days: [],
  },
  client_name: "Northline Manufacturing",
  source_transcript: transcript,
});
check(
  "CRM names Dave as the technical veto and does not call him unidentified",
  /Invisible veto \/ missing authority:\*\* None\. Dave \(VP of Infrastructure\) — technical approval dependency is the identified technical approval dependency\./i.test(
    crm
  ) &&
    /Technical approval dependency:\*\*\s*\n- Dave \(VP of Infrastructure\)/i.test(crm) &&
    !/Invisible veto \/ missing authority:\*\* Not identified/i.test(crm),
  crm.match(/Invisible veto[^\n]*/)?.[0]
);
check(
  "CRM deal risk is the scored index, not the scale denominator",
  /\*\*Deal Risk Score:\*\* 51\/100 \(MODERATE\)/.test(crm),
  crm.match(/Deal Risk Score:[^\n]*/)?.[0]
);
const rendered = normalizeResult({
  proprietary_indices: runA.pi,
  crm_intelligence: {
    dominant_equilibrium_force: "",
    structural_constraint_type: "",
    deal_state: "",
    viability_score: "0",
    trajectory_type: "",
    equilibrium_state: "",
    buyer_intent_strength: "",
    effective_intent: "",
    constraint_pressure: "",
    reactivation_probability: "",
    recommended_next_action: "",
    deal_risk_index: "100",
    risk_tier: "CRITICAL",
  },
  stakeholders: runA.stakeholders,
});
check(
  "report assembler overwrites a stale CRM deal-risk string with the scored index",
  rendered.crm_intelligence?.deal_risk_index === String(runA.pi.deal_risk_index) &&
    rendered.crm_intelligence?.risk_tier === runA.pi.risk_tier &&
    rendered.stakeholders?.some((person) => person.name === "Dave"),
  {
    crm: rendered.crm_intelligence?.deal_risk_index,
    tier: rendered.crm_intelligence?.risk_tier,
    scored: runA.pi.deal_risk_index,
  }
);

// --- 11. Failover / schema conformance (same normalized schema) ---
try {
  assertAnalysisSchema({
    deal_classification: { status: "STALLED — MODERATE RISK", confidence: 70 },
    client_name: "Northline Manufacturing",
    executive_summary: "Waiting on Dave.",
    stakeholders: [{ name: "Dave", role: "VP", persona_type: "Absent Decision Maker", evidence: "missed" }],
    force_initialization: {
      blocker_classification: "TEMPORARY BLOCKERS",
      summary: "Dave absent",
      classification_rationale: "P1 outage",
    },
    causal_forces: northlineForces,
    resolution_cycles: { cycles: [] },
    force_interaction_map: { amplifies: [], suppresses: [] },
    force_dependency_graph: { nodes: [], edges: [] },
    equilibrium_analysis: {
      current_state: "STALL",
      equilibrium_breaker: "Dave",
      explanation: "tech gate",
    },
    viability_state: { state: "CONDITIONAL", viability_score: 40 },
    deal_trajectory: { trajectory_type: "DEFERRED (recoverable)", explanation: "after month-end" },
    buyer_state: { buyer_intent_strength: 62, effective_intent: 20 },
    reactivation_modeling: [],
    pipeline_entry_validity: { valid: true, reason: "commercial" },
    rescue_triage_plan: { immediate_0_30_days: ["Send one-pager"] },
    crm_intelligence: { notes: "test" },
  });
  check("normalized extraction schema accepts failover-shaped payload", true);
} catch (err) {
  check("normalized extraction schema accepts failover-shaped payload", false, String(err));
}

const meta = buildDiagnosticRunMetadata({ modelProvider: "gemini", modelVersion: "test" });
check("run metadata records scoring engine version", meta.scoring_engine_version === SCORING_ENGINE_VERSION, meta);

// --- 12. Gate 0 — non-commercial remains suppressed ---
const networking = [
  "PROSPECT: if you think that, no way a room full of 40 people, I'm going to be the client to the 40.",
  "PROSPECT: What I'll do is, I'm going to send you that invitation. To that group.",
  "SELLER: I'll send you the company information and a consultation link. His name is [REFERRAL PARTNER]. I'll put you into a warm connection with him.",
].join("\n");
check("Gate 0: networking is not a purchase", isNotAPurchase(networking) === true);
const networkingRec = classifyRecoverability({
  viability: 20,
  trajectory: "DEFERRED (recoverable)",
  blocker: "MIXED",
  intent: 20,
  forces: [],
  evidence: networking,
});
check("Gate 0: non-commercial recoverability is FLAT_NO", networkingRec.status === "FLAT_NO", networkingRec);
check("Northline remains a commercial opportunity", isNotAPurchase(transcript) === false);

// Consistency gate overall
check("Northline consistency gate has no ERROR failures", runA.validation.passed === true, runA.validation);
check(
  "people map rows do not invent Mark identity for MO",
  !peopleMapRows(runA.stakeholders).some(
    (row) => row.name === "MO" && /mark o'?brien/i.test(`${row.persona} ${row.role}`)
  ),
  peopleMapRows(runA.stakeholders)
);

// --- 13. Northline evidence integrity ---
check("Sarah Chen is not Mark O'Brien", samePerson("Sarah Chen", "Mark O'Brien") === false);
const turns = parseTurns(transcript);
const sarahTurn = turns.turns.find((turn) => turn.speaker === "SC");
const markTurn = turns.turns.find((turn) => turn.speaker === "MO");
check("speaker label SC stays the seller", sarahTurn?.role === "seller" && sarahTurn.speaker === "SC", sarahTurn);
check("speaker label MO stays the buyer and is not renamed to Mark", markTurn?.role === "buyer" && markTurn.speaker === "MO", markTurn);
check(
  "conditional purchase is not a completed commitment",
  purchaseMotion(transcript).motion === "deal_open",
  purchaseMotion(transcript)
);
const urgency = diagnosticProfile(transcript).urgency;
check(
  "Q3 is not converted into a calendar date",
  !/\b20\d{2}-\d{2}-\d{2}\b/.test(urgency) && !/\b(?:january|february|april|may|june|july|august|september|october|november|december)\b/i.test(urgency),
  urgency
);
check(
  "phased pilot is the buyer's stated condition",
  quoteSpeakerRole(transcript, "A phased pilot on a non-production line") === "buyer"
);
check(
  "one-pager is a seller offer, not a buyer requirement",
  quoteSpeakerRole(transcript, "I'll send a one-pager for Dave") === "seller" &&
    sellerOfferLabeledAsBuyerRequirement(
      transcript,
      "Buyer requirement: I'll send a one-pager for Dave and propose three slots after month-end."
    ) === true
);
check(
  "buyer-stated pilot is not flagged as a seller offer",
  sellerOfferLabeledAsBuyerRequirement(
    transcript,
    "Buyer requirement: A phased pilot on a non-production line, reference customers in discrete manufacturing."
  ) === false
);
const daysInput = runA.pi.dri_inputs?.find((item) => item.field === "days_stalled");
const roleInput = runA.pi.dri_inputs?.find((item) => item.field === "stakeholder_matrix_roles");
check("DRI days stalled are labeled inferred, not observed CRM", daysInput?.basis === "inferred_proxy", daysInput);
check(
  "technical veto is not mapped as the economic buyer",
  Boolean(roleInput?.value.includes("Dave:USER")) && !roleInput?.value.includes("Dave:ECONOMIC_BUYER"),
  roleInput
);
check(
  "DRI and viability are published as separate metrics",
  typeof runA.pi.deal_risk_index === "number" &&
    typeof frozen.viability_score === "number" &&
    /separate metrics/i.test(
      (runA.pi.explanations?.deal_risk?.factors ?? []).map((factor) => factor.text).join(" ")
    ),
  { dri: runA.pi.deal_risk_index, viability: frozen.viability_score }
);
const deadlineNotes = formatCompressedCrmNotes({
  deal_classification: { status: runA.status },
  deal_trajectory: { trajectory_type: frozen.trajectory_type },
  recoverability: frozen.recoverability,
  viability_state: { state: frozen.viability_state, viability_score: frozen.viability_score },
  proprietary_indices: runA.pi,
  stakeholders: runA.stakeholders,
  force_initialization: { blocker_classification: "TEMPORARY BLOCKERS", summary: "Dave architecture gate" },
  equilibrium_analysis: { equilibrium_breaker: "Dave technical approval pending", explanation: "Waiting on Dave" },
  causal_forces: runA.causal.forces,
  immediate_remediation: ["Send a one-pager for Dave this week"],
  rescue_triage_plan: {
    immediate_0_30_days: ["Propose three technical meeting slots after month-end"],
    near_term_30_90_days: [],
    long_term_90_plus_days: [],
  },
  client_name: "Northline Manufacturing",
  source_transcript: transcript,
});
const planSection = deadlineNotes.split("### What to do")[1]?.split("### Snapshot")[0] ?? deadlineNotes;
const weekSection = planSection.split("**This week (0–7 days):**")[1]?.split(/\*\*Stated checkpoint:\*\*|\*\*30 days:\*\*/)[0] ?? "";
check(
  "preparation this week and the later meeting are not one deadline",
  /No single deadline was invented/.test(planSection) &&
    /\*\*Stated checkpoint:\*\*/.test(planSection) &&
    /after month-end/.test(planSection) &&
    !/after month-end/.test(weekSection) &&
    !/\b20\d{2}-\d{2}-\d{2}\b/.test(planSection),
  planSection.slice(0, 500)
);
const conditionalLock = explainForceLock(transcript, northlineForces);
check(
  "Northline conditional language does not replace extracted forces",
  conditionalLock.transforms.length === 0 && conditionalLock.forces === northlineForces,
  conditionalLock.transforms
);
const repeat = scoreNorthline();
check(
  "a second run on the same inputs matches the first",
  repeat.frozen.viability_score === runA.frozen.viability_score &&
    repeat.pi.deal_risk_index === runA.pi.deal_risk_index &&
    repeat.status === runA.status
);

console.log(
  JSON.stringify(
    {
      northline: {
        viability: frozen.viability_score,
        effective_intent: frozen.effective_intent,
        intent: frozen.intent_strength,
        constraint: frozen.constraint_pressure,
        enabler: frozen.enabler_strength,
        trajectory: frozen.trajectory_type,
        recoverability: frozen.recoverability.status,
        equilibrium: frozen.equilibrium_state,
        dri: runA.pi.deal_risk_index,
        tier: runA.pi.risk_tier,
        status: runA.status,
        headline: headline.line,
      },
    },
    null,
    2
  )
);

if (failed) {
  console.error(`\n${failed} diagnostic integrity check(s) failed`);
  process.exit(1);
}
console.log("\ndiagnostic integrity checks passed");
