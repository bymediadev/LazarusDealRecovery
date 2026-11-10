import { readFileSync } from "fs";
import {
  auditTranscriptGrounding,
  classifyEvidenceSource,
  composeFinalGroundingAudit,
  detectInventedTerms,
  detectMissingCriticalStakeholders,
  ensureGroundedStakeholders,
  evidenceMatchesTranscript,
  selectGroundedForces,
} from "../server/grounding.ts";
import { formatCompressedCrmNotes } from "../src/lib/crmNotes.ts";
import {
  findInvisibleVetoOrMissingAuthority,
  findTechnicalVetoHolder,
} from "../src/lib/authorityRoles.ts";

const sarahMark = readFileSync("fixtures/sarah_mark_transcript.txt", "utf8");

// Simulated CyberCore template hallucination on Sarah/Mark call
const hallucinated = {
  causal_forces: [
    {
      factor: "Board capex freeze over $500K",
      evidence: "board mandated a hard freeze on all new IT expenditures over $500,000",
    },
    {
      factor: "AS/400 legacy migration",
      evidence: "heavily modified IBM AS/400 backend for our core inventory routing",
    },
  ],
  executive_summary:
    "CyberCore deferred due to acquisition bandwidth and board capex freeze on AS/400 migration.",
  stakeholders: [{
    name: "Mark O'Brien",
    role: "Director",
    stance: "Neutral",
    authority_level: "influencer",
    persona_type: "Neutral",
    evidence: "Mark, thanks for making time.",
  }],
};

const invented = detectInventedTerms(
  hallucinated.causal_forces,
  sarahMark,
  hallucinated.executive_summary
);
const missingDave = detectMissingCriticalStakeholders(sarahMark, hallucinated.stakeholders);
const audit = auditTranscriptGrounding({
  transcript: sarahMark,
  dealValue: 280000,
  ...hallucinated,
});

console.log("=== Sarah/Mark regression (hallucinated CyberCore output) ===");
console.log("Invented terms detected:", invented);
console.log("Missing stakeholders:", missingDave);
console.log("Audit pass (should be false):", audit.pass);
console.log("Audit warnings:", audit.warnings);

if (audit.pass || invented.length === 0 || !missingDave.includes("Dave")) {
  console.error("REGRESSION FAILED");
  process.exit(1);
}

// After filter, Dave must be reinjected from transcript — not silently dropped.
const repaired = ensureGroundedStakeholders(hallucinated.stakeholders, sarahMark);
const stillMissing = detectMissingCriticalStakeholders(sarahMark, repaired);
if (!repaired.some((p) => /dave/i.test(p.name)) || stillMissing.includes("Dave")) {
  console.error("REGRESSION FAILED: ensureGroundedStakeholders did not reinject Dave", repaired, stillMissing);
  process.exit(1);
}
const dave = repaired.find((p) => /dave/i.test(p.name));
if (!dave || !evidenceMatchesTranscript(dave.evidence, sarahMark)) {
  console.error("REGRESSION FAILED: reinjected Dave evidence is not grounded", dave);
  process.exit(1);
}
if (findTechnicalVetoHolder(repaired)?.name !== "Dave") {
  console.error("REGRESSION FAILED: reinjected Dave is not technical veto", repaired);
  process.exit(1);
}
if (findInvisibleVetoOrMissingAuthority(repaired) != null) {
  console.error("REGRESSION FAILED: technical veto must not count as invisible/missing authority");
  process.exit(1);
}

const crm = formatCompressedCrmNotes({
  deal_classification: { status: "STALLED — CRITICAL RISK" },
  deal_trajectory: { trajectory_type: "DEFERRED (recoverable)" },
  recoverability: { status: "RECOVERABLE", confidence: 70, blocking_conditions: [], evidence_gaps: [], explanation: "path" },
  viability_state: { state: "CONDITIONAL", viability_score: 58 },
  proprietary_indices: {
    deal_risk_index: 100,
    risk_tier: "CRITICAL",
    multi_department_friction: 28,
    stakeholder_dispersion_index: 12,
    dialogue_stall_score: 89,
    authority_gap_flag: true,
  },
  stakeholders: repaired,
  force_initialization: {
    blocker_classification: "TEMPORARY BLOCKERS",
    summary: "Access to Technical Veto Holder",
    classification_rationale: "Dave, VP of Infrastructure",
  },
  equilibrium_analysis: {
    equilibrium_breaker: "Dave, VP of Infrastructure",
    explanation: "Waiting on Dave",
  },
  causal_forces: [
    {
      factor: "Dave architecture gate",
      type: "Constraint",
      weight: 90,
      evidence: "Dave, our VP of Infrastructure, missed the technical demo yesterday",
    },
  ],
  immediate_remediation: ["Send one-pager for Dave and propose three slots after month-end"],
  rescue_triage_plan: {
    immediate_0_30_days: ["Send one-pager for Dave and propose three slots after month-end"],
    near_term_30_90_days: [],
    long_term_90_plus_days: [],
  },
  client_name: "Northline Manufacturing",
  source_transcript: sarahMark,
  live_deal_triage: { root_issue: "Access to Technical Veto Holder", core_blocker: "Dave, VP of Infrastructure" },
});
if (!/Technical approval dependency/i.test(crm)) {
  console.error("REGRESSION FAILED: CRM people map missing technical approval dependency", crm);
  process.exit(1);
}
if (!/Dave \(VP of Infrastructure\), technical approval dependency/i.test(crm)) {
  console.error("REGRESSION FAILED: CRM dropped the identified technical veto", crm.match(/Invisible veto[^\n]*/)?.[0]);
  process.exit(1);
}
if (/\*\*Invisible veto \/ missing authority:\*\* Not identified\b/i.test(crm)) {
  console.error("REGRESSION FAILED: identified technical veto was reported as unidentified", crm.match(/Invisible veto[^\n]*/)?.[0]);
  process.exit(1);
}

console.log("Dave reinjected:", dave.name, dave.role, dave.authority_level);

const supplementalOnly = "The CRM note says the board mandated a separate capex freeze after the call.";
const source = classifyEvidenceSource(supplementalOnly, sarahMark, supplementalOnly);
if (source !== "supplemental") {
  console.error("REGRESSION FAILED: supplemental evidence was not labeled supplemental", source);
  process.exit(1);
}
if (evidenceMatchesTranscript(supplementalOnly, sarahMark)) {
  console.error("REGRESSION FAILED: supplemental evidence matched the transcript");
  process.exit(1);
}
const partitioned = selectGroundedForces(
  [
    { factor: "CRM capex note", type: "Constraint", weight: 40, evidence: supplementalOnly },
    {
      factor: "Dave missed the demo",
      type: "Constraint",
      weight: 70,
      evidence: "Dave, our VP of Infrastructure, missed the technical demo yesterday.",
    },
    { factor: "Invented board", type: "Structural", weight: 90, evidence: "board mandated a hard freeze on all new IT expenditures over $500,000" },
  ],
  sarahMark,
  supplementalOnly
);
if (partitioned.kept.some((force) => force.factor === "Invented board")) {
  console.error("REGRESSION FAILED: ungrounded force entered the kept set", partitioned.kept);
  process.exit(1);
}
const crmForce = partitioned.kept.find((force) => force.factor === "CRM capex note");
const daveForce = partitioned.kept.find((force) => force.factor === "Dave missed the demo");
if (!crmForce || crmForce.evidence_source !== "supplemental") {
  console.error("REGRESSION FAILED: CRM force was not kept as supplemental", partitioned.kept);
  process.exit(1);
}
if (!daveForce || daveForce.evidence_source !== "transcript") {
  console.error("REGRESSION FAILED: transcript force lost its source", daveForce);
  process.exit(1);
}

const finalAudit = composeFinalGroundingAudit(audit, {
  ...audit,
  pass: true,
  grounding_status: "fully_grounded",
  ungrounded_forces: [],
  invented_terms: [],
  invented_amounts: [],
  missing_critical_stakeholders: [],
  ungrounded_stakeholders: [],
  rejected_evidence: [],
  warnings: [],
  supplemental_forces: [],
  grounded_force_count: 1,
});
if (finalAudit.pass || finalAudit.grounding_status !== "partially_grounded") {
  console.error("REGRESSION FAILED: filtered failure was reported as fully grounded", finalAudit.grounding_status, finalAudit.pass);
  process.exit(1);
}
if (!finalAudit.rejected_evidence.some((item) => item.kind === "force")) {
  console.error("REGRESSION FAILED: final audit dropped the rejected forces", finalAudit.rejected_evidence);
  process.exit(1);
}

// Silent / absent people use "not stated". That is not an ungrounded claim on Northline.
const silentDaveAudit = auditTranscriptGrounding({
  transcript: sarahMark,
  dealValue: 280000,
  causal_forces: [
    {
      factor: "Dave missed the technical demo",
      type: "Constraint",
      weight: 90,
      evidence: "Dave, our VP of Infrastructure, missed the technical demo yesterday. He had a P1 outage and couldn't join.",
    },
  ],
  executive_summary: "Deal waits on Dave.",
  stakeholders: [
    {
      name: "Mark O'Brien",
      role: "Director of Operations",
      stance: "Suppressed Champion",
      authority_level: "influencer",
      persona_type: "Suppressed Champion",
      evidence: "Sarah, I like what I saw in the overview.",
    },
    {
      name: "Dave",
      role: "VP of Infrastructure",
      stance: "Absent Decision Maker",
      authority_level: "technical_veto",
      persona_type: "Absent Decision Maker",
      evidence: "not stated",
    },
  ],
});
if (!silentDaveAudit.pass || silentDaveAudit.ungrounded_stakeholders.length > 0) {
  console.error(
    "REGRESSION FAILED: named silent Dave with 'not stated' failed grounding",
    silentDaveAudit.ungrounded_stakeholders,
    silentDaveAudit.pass
  );
  process.exit(1);
}

const repairedSilent = ensureGroundedStakeholders(
  silentDaveAudit.stakeholders,
  sarahMark
);
const daveAfterRepair = repairedSilent.find((person) => /dave/i.test(person.name));
if (!daveAfterRepair || !evidenceMatchesTranscript(daveAfterRepair.evidence, sarahMark)) {
  console.error("REGRESSION FAILED: silent Dave was not upgraded to a transcript quote", daveAfterRepair);
  process.exit(1);
}

const silentFinal = composeFinalGroundingAudit(silentDaveAudit, {
  ...silentDaveAudit,
  stakeholders: repairedSilent.map((person) => ({
    ...person,
    evidence_source: "transcript",
  })),
  ungrounded_stakeholders: [],
  rejected_evidence: [],
  grounded_force_count: 1,
  pass: true,
  grounding_status: "fully_grounded",
});
if (!silentFinal.pass || silentFinal.grounding_status !== "fully_grounded") {
  console.error(
    "REGRESSION FAILED: repaired silent Dave stayed partially grounded",
    silentFinal.grounding_status,
    silentFinal.pass,
    silentFinal.warnings
  );
  process.exit(1);
}
if (silentFinal.warnings.some((warning) => /Grounding was partial/i.test(warning))) {
  console.error("REGRESSION FAILED: silent Dave still shows the partial-grounding banner", silentFinal.warnings);
  process.exit(1);
}

console.log("REGRESSION OK");
