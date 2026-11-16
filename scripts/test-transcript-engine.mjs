/**
 * Meridian enterprise call: seller titles, untimestamped names, and a 10-day recovery path.
 */
import { readFileSync } from "fs";
import { deriveCanonicalState } from "../server/scoring.ts";
import { diagnosticProfile, parseTurns, purchaseMotion } from "../src/lib/reportMatrix.ts";
import { decisiveSentence } from "../src/lib/reportCopy.ts";
import { normalizeTranscript } from "../src/lib/transcriptNormalize.ts";

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

const transcript = readFileSync(new URL("../fixtures/meridian_apexops_triage.txt", import.meta.url), "utf8");
const parsed = parseTurns(transcript);
const sellers = [...new Set(parsed.turns.filter((turn) => turn.role === "seller").map((turn) => turn.speaker))];
const buyers = [...new Set(parsed.turns.filter((turn) => turn.role === "buyer").map((turn) => turn.speaker))];

check("markdown participant title marks the account executive as seller", sellers.includes("Mark Vance") && !sellers.includes("Sarah Lindqvist"), { sellers, buyers });
check("the buyers stay buyers", buyers.includes("Sarah Lindqvist") && buyers.includes("David Chen"), buyers);
check("an open enterprise purchase is not thrown out for a missing seller", purchaseMotion(transcript).motion === "deal_open", purchaseMotion(transcript));

const urgency = diagnosticProfile(transcript).urgency;
check("a greeting is not the deal deadline", !/swamped schedules/i.test(urgency), urgency);
check(
  "urgency cites a decision gate",
  /ten days|Thursday|mid-December|Q1/i.test(urgency),
  urgency
);

const david = decisiveSentence(transcript, "David Chen");
check(
  "David's evidence is his own residency sentence",
  /enclave|corporate policy|review queue/i.test(david?.text ?? "") && /David Chen/i.test(david?.speaker ?? ""),
  david
);
const sarah = decisiveSentence(transcript, "Sarah Lindqvist");
check(
  "Sarah's evidence is her freeze or CFO path",
  /freeze|CFO|ten days|business case|mid-December/i.test(sarah?.text ?? "") && /Sarah/i.test(sarah?.speaker ?? ""),
  sarah
);

check(
  "a four-digit clock becomes a six-digit timestamp",
  normalizeTranscript("[5:02] Sarah Lindqvist: The review is mid-December.").startsWith("[00:05:02] Sarah Lindqvist:")
);
check(
  "a bold role header becomes a plain speaker line",
  normalizeTranscript("**Mark Vance** (Account Executive, ApexOps): We are SOC 2 certified.").startsWith("Mark Vance:")
);

const firstNames = "Jordan: The downtime is costing you $45,000 per day.\nCasey: Pull the plug. We signed with the other vendor yesterday.";
check("two first names with no role stay unresolved", purchaseMotion(firstNames).motion === "unresolved", purchaseMotion(firstNames));

const forces = [
  {
    factor: "Budget Freeze & Formal Review Trigger",
    type: "Structural",
    weight: 90,
    evidence: "finance has put a general freeze on any new software line items that exceed twenty thousand annually",
  },
  {
    factor: "Corporate Policy on Data Residency & Isolation",
    type: "Structural",
    weight: 95,
    evidence: "Our corporate policy for any system integrating into our dispatch core requires dedicated tenant isolation or a Canadian-hosted enclave.",
  },
  {
    factor: "Legal DPA Review Queue",
    type: "Structural",
    weight: 85,
    evidence: "our legal counsel needs to review your data processing addendum. That review queue is currently backed up by about three weeks.",
  },
  {
    factor: "Desire for Dispatch Optimization",
    type: "Intent",
    weight: 70,
    evidence: "we're definitely feeling the pressure on dispatch times",
  },
  {
    factor: "Potential for Expedited Technical/Legal Review",
    type: "Enabler",
    weight: 60,
    evidence: "If you guys can actually solve the hosting and legal paperwork in the next ten days, I can take a pre-vetted package to our CFO off-cycle.",
  },
  {
    factor: "Tight Internal Deadlines",
    type: "Timing",
    weight: 75,
    evidence: "Otherwise, we're sliding right past the fiscal window.",
  },
  {
    factor: "Technical team cannot commit capacity",
    type: "Behavioral",
    weight: 75,
    evidence: "Is it a capacity constraint on your end for onboarding, or something else",
  },
];

const { causal, frozen } = deriveCanonicalState(forces, "STRUCTURAL LOCK-INS", transcript);
check(
  "a seller question is not scored as a capacity fact",
  !causal.forces.some((force) => /capacity constraint/i.test(`${force.factor} ${force.evidence}`)),
  causal.forces.map((force) => force.factor)
);
check(
  "a 10-day enabler keeps viability off the floor",
  frozen.viability_score > 0 && frozen.viability_score < 70,
  frozen.viability_score
);
check(
  "the trajectory stays recoverable",
  frozen.trajectory_type === "DEFERRED (recoverable)",
  frozen.trajectory_type
);
check("recovery posture is high friction", frozen.recovery_posture === "HIGH_FRICTION_RECOVERY", frozen.recovery_posture);
check(
  "recoverability stays conditional while the 10-day path is open",
  frozen.recoverability.status === "CONDITIONALLY_RECOVERABLE",
  frozen.recoverability.status
);

console.log(`\npassed ${passed}`);
if (failed) {
  console.error(`failed ${failed}`);
  process.exit(1);
}
