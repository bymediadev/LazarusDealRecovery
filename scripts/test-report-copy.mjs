/**
 * Northline report copy. Raw transcript: fixtures/sarah_mark_transcript.txt
 * Speakers: Mark O'Brien, Sarah Chen. Copy layer only — scores come from the scorer.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { deriveCanonicalState, deriveProprietaryIndices } from "../server/scoring.ts";
import { diagnosticProfile } from "../src/lib/reportMatrix.ts";
import {
  findEconomicDecisionMaker,
  findTechnicalVetoHolder,
} from "../src/lib/authorityRoles.ts";
import { formatCompressedCrmNotes } from "../src/lib/crmNotes.ts";
import { decisiveSentence, verbatimQuote } from "../src/lib/reportCopy.ts";

let passed = 0;
let failed = 0;

function check(name, ok, detail) {
  if (ok) {
    passed += 1;
    console.log("ok", name);
    return;
  }
  failed += 1;
  console.error("FAIL:", name, detail ?? "");
}

const transcript = readFileSync(new URL("../fixtures/sarah_mark_transcript.txt", import.meta.url), "utf8");

const northlineForces = [
  {
    factor: "Dave VP Infrastructure absent — architecture gate",
    type: "Constraint",
    weight: 72,
    evidence: "Dave, our VP of Infrastructure, missed the technical demo yesterday",
  },
  {
    factor: "Cannot proceed without Dave sign-off",
    type: "Structural",
    weight: 68,
    evidence: "Without him, I'm not moving this forward",
  },
  {
    factor: "Interest in platform",
    type: "Intent",
    weight: 62,
    evidence: "I like what I saw in the overview",
  },
  {
    factor: "Budget in range",
    type: "Enabler",
    weight: 45,
    evidence: "$280,000 annual platform fee was in range",
  },
];

const stakeholders = [
  { name: "Dave", persona_type: "Absent Decision Maker", role: "VP of Infrastructure", stance: "Absent Decision Maker" },
  { name: "Mark", persona_type: "Suppressed Champion", role: "Director of Operations", stance: "Suppressed Champion" },
];

const { causal, frozen } = deriveCanonicalState(northlineForces, "MIXED");
const pi = deriveProprietaryIndices(frozen, stakeholders, transcript);
const profile = diagnosticProfile(transcript);
const onePager = "Send a one-pager for Dave this week";

const output = formatCompressedCrmNotes({
  deal_classification: { status: "STALLED — HIGH RISK" },
  deal_trajectory: { trajectory_type: frozen.trajectory_type },
  recoverability: frozen.recoverability,
  viability_state: {
    state: frozen.viability_state,
    viability_score: frozen.viability_score,
    equilibrium_derivation: frozen.derivation_formula,
    derivation_components: {
      intent_strength: frozen.intent_strength,
      constraint_pressure: frozen.constraint_pressure,
      structural_lock_in_impact: frozen.structural_lock_in,
      timing_accessibility: frozen.timing_factor,
    },
  },
  proprietary_indices: pi,
  stakeholders,
  buyer_state: {
    intent_strength: frozen.intent_strength,
    effective_intent: frozen.effective_intent,
    constraint_pressure: frozen.constraint_pressure,
  },
  force_initialization: { blocker_classification: "TEMPORARY BLOCKERS", summary: "Dave architecture gate" },
  equilibrium_analysis: {
    equilibrium_breaker: "Dave technical approval pending",
    explanation: `Waiting on Dave. ${frozen.derivation_formula}`,
  },
  causal_forces: causal.forces,
  live_deal_triage: {
    root_issue: "Dave will not move this forward until he signs off",
    core_blocker: "Dave technical approval pending",
    department_friction_index: 0,
  },
  immediate_remediation: [onePager],
  rescue_triage_plan: {
    immediate_0_30_days: [onePager, "Propose three technical meeting slots after month-end"],
    near_term_30_90_days: [onePager],
    long_term_90_plus_days: [],
  },
  crm_intelligence: { recommended_next_action: onePager },
  friction_deltas: {
    administrative_gatekeeping: {
      detected: true,
      evidence: "Dave said the architecture is frozen forever and nobody can proceed",
    },
    stakeholder_dispersion: { detected: false, evidence: "", unmapped_names: [] },
    budget_scoping_gap: { detected: false, evidence: "" },
  },
  diagnostic_profile: profile,
  client_name: "Northline Manufacturing",
  source_transcript: transcript,
});

const vetoLine = output.match(/\*\*Invisible veto \/ missing authority:\*\*[^\n]*/)?.[0] ?? "";
const daveBlock = output.split("**Technical approval dependency:**")[1]?.split(/\n\*\*/)[0] ?? "";
const urgencyLine = output.match(/\*\*Urgency and timeline:\*\*[^\n]*/)?.[0] ?? "";
const rootLine = output.match(/\*\*Root issue:\*\*[^\n]*/)?.[0] ?? "";
const quotes = [...output.matchAll(/"([^"]*)"/g)].map((match) => match[1]);

check(
  "deal risk 56",
  pi.deal_risk_index === 56 && /\*\*Deal Risk Score:\*\* 56\/100 \(HIGH\)/.test(output),
  { scored: pi.deal_risk_index, line: output.match(/Deal Risk Score:[^\n]*/)?.[0] }
);
check("deal risk band HIGH", pi.risk_tier === "HIGH", pi.risk_tier);
check(
  "viability 56",
  frozen.viability_score === 56 && /\*\*Viability score:\*\* 56\/100/.test(output),
  frozen.viability_score
);
check(
  "Dave is the technical approval dependency, not the economic buyer",
  findTechnicalVetoHolder(stakeholders)?.name === "Dave" &&
    findEconomicDecisionMaker(stakeholders)?.name !== "Dave",
  {
    technical: findTechnicalVetoHolder(stakeholders)?.name ?? null,
    economic: findEconomicDecisionMaker(stakeholders)?.name ?? null,
  }
);
const forbiddenAuthority = ["is the", "identified"].join(" ");
check(
  "invisible veto line names the technical approval dependency",
  vetoLine.includes("technical approval dependency") && !vetoLine.includes(forbiddenAuthority),
  vetoLine
);
check(
  "Dave evidence quotes the decisive sentence and does not say not stated",
  daveBlock.includes("Without him, I'm not moving this forward.") && !/not stated/i.test(daveBlock),
  daveBlock
);
const comparedIntent = ["Effective intent", "low from intent moderate"].join(" ");
check(
  "output does not compare intent bands",
  !output.includes(comparedIntent) && /but capped by /.test(output),
  output.match(/Intent:\*\*[^\n]*/)?.[0]
);
check(
  "Structural 0 is absent wherever Deal Risk is above 70",
  !(pi.deal_risk_index > 70 && /Structural 0/.test(output)),
  { risk: pi.deal_risk_index, structural: frozen.structural_lock_in }
);

const highRisk = formatCompressedCrmNotes({
  deal_classification: { status: "STALLED — CRITICAL RISK" },
  deal_trajectory: { trajectory_type: "DEFERRED (recoverable)" },
  viability_state: { state: "DEFERRED VIABILITY", viability_score: 40 },
  proprietary_indices: {
    deal_risk_index: 81,
    risk_tier: "CRITICAL",
    multi_department_friction: 0,
    stakeholder_dispersion_index: 0,
    dialogue_stall_score: 0,
  },
  equilibrium_analysis: { explanation: "Structural 0. Dominant factor: constraint (90)." },
  stakeholders,
  client_name: "Northline Manufacturing",
  source_transcript: transcript,
});
check(
  "a Deal Risk above 70 does not render Structural 0",
  !/Structural 0/.test(highRisk),
  highRisk.match(/Structural[^\n]*/g)
);
check(
  "a zero metric does not render next to a CRITICAL risk score",
  !/Dispersion:\*\* 0/.test(highRisk) && !/Stall signals:\*\* 0/.test(highRisk) && !/Department Friction \(DFI\):\*\* 0/.test(highRisk),
  highRisk.match(/Snapshot metrics[\s\S]*?(?=\n###|\n---|\n\*)/)?.[0]
);

const onePagerHits = output.split(onePager).length - 1;
check("the Dave one-pager action string appears exactly once", onePagerHits === 1, { hits: onePagerHits });
check(
  "a repeated action is cross-referenced by number",
  /See 1\./.test(output),
  output.match(/What to do[\s\S]{0,700}/)?.[0]
);

check(
  "every quoted string is a verbatim substring of the transcript",
  quotes.every((quote) => transcript.includes(quote)),
  quotes.filter((quote) => !transcript.includes(quote))
);

const urgencySentence = urgencyLine.match(/"([^"]+)"/)?.[1] ?? "";
const citesDate =
  Boolean(urgencySentence) &&
  transcript.includes(urgencySentence) &&
  !/parked until|stays parked/i.test(urgencySentence) &&
  /\b(q[1-4]|20\d{2}|\d{1,2}\/\d{1,2}|month-end|monday|tuesday|wednesday|thursday|friday|deadline|next week|next month)\b/i.test(
    urgencySentence
  );
check(
  "urgency cites a dated sentence from the transcript or reads No urgency stated",
  urgencyLine.includes("No urgency stated.") || citesDate,
  urgencyLine
);

check(
  "root issue is a short noun phrase and does not name a person",
  rootLine.length > 0 &&
    !/\b(Dave|Mark|Sarah|O'Brien|Chen)\b/.test(rootLine) &&
    rootLine.replace(/\*\*Root issue:\*\*\s*/, "").trim().split(/\s+/).length <= 6,
  rootLine
);

function walk(dir, files) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const path = join(dir, name);
    const info = statSync(path);
    if (info.isDirectory()) walk(path, files);
    else if (/\.(ts|tsx|mjs|js|cjs)$/.test(name)) files.push(path);
  }
  return files;
}

const roots = ["src", "server", "scripts", "shared"].map((dir) => join(process.cwd(), dir));
const sources = roots.flatMap((dir) => walk(dir, []));
const identifiedNeedle = ["is the", "identified"].join(" ");
const identifiedHits = [];
for (const file of sources) {
  const text = readFileSync(file, "utf8");
  if (text.includes(identifiedNeedle)) identifiedHits.push(file);
}
check("lint rejects the banned authority phrase", identifiedHits.length === 0, identifiedHits);

const daveSentence = decisiveSentence(transcript, "Dave");
check(
  "Dave's decisive sentence is the line Mark spoke",
  daveSentence?.text === "Without him, I'm not moving this forward." && daveSentence?.speaker === "Mark O'Brien",
  daveSentence
);
const markBlock = output.split("Suppressed champion")[1]?.split("###")[0] ?? "";
check(
  "Mark's evidence is his own sentence and is not labeled as someone else",
  markBlock.includes("Without him, I'm not moving this forward.") &&
    !/said by Mark/i.test(markBlock) &&
    !/thanks for making time/.test(markBlock),
  markBlock
);
check(
  "Dave's evidence names the speaker",
  /said by Mark O'Brien/.test(daveBlock),
  daveBlock
);
const said = output.match(/### What was said[\s\S]*?(?=\n### )/)?.[0] ?? "";
check("said lines do not carry a trailing timestamp", said.length > 0 && !/\[\d{2}:\d{2}:\d{2}\]/.test(said), said);
check(
  "unknown does not claim a timeline when none was stated",
  /Unknown: no timeline/.test(output),
  output.match(/### Unknown[\s\S]{0,200}/)?.[0]
);
check("a fabricated friction sentence is dropped", !/frozen forever/i.test(output));
check("an ellipsis is not published as a quote", verbatimQuote(transcript, "Without him, I'm not moving...") === "");
const stitched = verbatimQuote(
  transcript,
  "Without him, I'm not moving this forward. Budget-wise, $280K is what we modeled."
);
check(
  "two sentences are not stitched into one quote",
  !(stitched.includes("Without him") && stitched.includes("Budget-wise")),
  stitched
);

const shouted = formatCompressedCrmNotes({
  deal_classification: { status: "STALLED — HIGH RISK" },
  stakeholders,
  source_transcript: transcript,
  client_name: "Northline Manufacturing",
  immediate_remediation: ["Send a one-pager for Dave this week!"],
  rescue_triage_plan: {
    immediate_0_30_days: [onePager],
    near_term_30_90_days: [],
    long_term_90_plus_days: [],
  },
  crm_intelligence: { recommended_next_action: onePager },
});
check(
  "punctuation does not print the same action twice",
  (shouted.match(/one-pager for Dave this week/gi) ?? []).length === 1
);

const federal = readFileSync(new URL("../fixtures/transcript_3_federal_audit.txt", import.meta.url), "utf8");
const federalPeople = [
  { name: "Richard", persona_type: "Absent Decision Maker", role: "CFO", stance: "Absent Decision Maker" },
  { name: "Dave", persona_type: "Absent Decision Maker", role: "IT Security", stance: "Absent Decision Maker", authority_level: "technical_veto" },
  { name: "Teresa Wu", persona_type: "Suppressed Champion", role: "Director of Compliance", stance: "Suppressed Champion" },
];
const federalReport = formatCompressedCrmNotes({
  deal_classification: { status: "STALLED — HIGH RISK" },
  stakeholders: federalPeople,
  source_transcript: federal,
  client_name: "Federal Systems",
  diagnostic_profile: diagnosticProfile(federal),
  proprietary_indices: {
    deal_risk_index: 80,
    risk_tier: "CRITICAL",
    multi_department_friction: 10,
    stakeholder_dispersion_index: 0,
    dialogue_stall_score: 40,
  },
  viability_state: { state: "DEFERRED VIABILITY", viability_score: 20, equilibrium_derivation: "Structural 0. Constraint elevated." },
});
const federalVeto = federalReport.match(/\*\*Invisible veto \/ missing authority:\*\* ([^\n]+)/)?.[1] ?? "";
const federalUrgency = diagnosticProfile(federal).urgency;
check("a mapped authority is not described as never appearing", !/never appears/i.test(federalVeto), federalVeto);
check(
  "Dave's veto clause is his own sentence",
  /Dave from IT security also flagged/.test(federalVeto) && !/Richard is supportive/.test(federalVeto),
  federalVeto
);
check(
  "a spending freeze is not cited as urgency",
  federalUrgency === "No urgency stated." && !/frozen for the next 90 days|park this/i.test(federalUrgency),
  federalUrgency
);
check("a freeze report does not render Structural 0", !/\bStructural 0\b/.test(federalReport));
const federalQuotes = [...federalReport.matchAll(/"([^"]*)"/g)].map((match) => match[1]);
check(
  "every federal quote is a verbatim substring",
  federalQuotes.every((quote) => federal.includes(quote)),
  federalQuotes.filter((quote) => !federal.includes(quote))
);

const fixtureDir = new URL("../fixtures/", import.meta.url);
for (const name of readdirSync(fixtureDir).filter((entry) => entry.endsWith(".txt"))) {
  const text = readFileSync(new URL(name, fixtureDir), "utf8");
  const diag = diagnosticProfile(text);
  const blob = [diag.buyingSignals, diag.budget, diag.urgency, diag.restart, ...(diag.said ?? [])].join("\n");
  const bad = [...blob.matchAll(/"([^"]*)"/g)].map((match) => match[1]).filter((quote) => !text.includes(quote));
  check(`${name} diagnostic quotes are verbatim`, bad.length === 0, bad);
  const cited = diag.urgency.match(/"([^"]+)"/)?.[1] ?? "";
  check(
    `${name} urgency does not cite a deferral`,
    !cited || !/park|frozen|nurture/i.test(cited),
    diag.urgency
  );
}

console.log(`\npassed ${passed}`);
if (failed) {
  console.error(`failed ${failed}`);
  process.exit(1);
}
