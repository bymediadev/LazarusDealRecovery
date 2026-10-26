/**
 * Calibration suite — docs/architecture/benchmarks.md Test Models 1–4.
 * Run: npm run test:matrix
 */

import { calculateDRI, evaluateGateZero } from "./matrix.js";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

function assertClose(actual: number, expected: number, digits: number, msg: string): void {
  const tol = Math.pow(10, -digits) / 2 + 0.05;
  if (Math.abs(actual - expected) > tol) {
    throw new Error(`${msg}: expected ~${expected}, got ${actual}`);
  }
}

function testModel1(): void {
  const gateResult = evaluateGateZero({
    dealType: "PEER_NETWORKING",
    commercialIntentScore: 15,
    daysStalled: 30,
    unansweredEmails: 4,
  });
  assert(gateResult.omega === 0, "Model 1: omega should be 0");
  assert(gateResult.targetStage === "NOT_A_DEAL", "Model 1: NOT_A_DEAL");
  assert(gateResult.action === "SUPPRESS_OUTREACH", "Model 1: SUPPRESS_OUTREACH");

  const full = calculateDRI({
    dealType: "PEER_NETWORKING",
    commercialIntentScore: 15,
    daysStalled: 30,
    unansweredEmails: 4,
  });
  assert(full.dri === 0, "Model 1: DRI 0");
  assert(full.targetStage === "NOT_A_DEAL", "Model 1: stage");
  console.log("✓ Test Model 1: Gate 0 Filter Verification");
}

function testModel2(): void {
  const result = calculateDRI({
    stage: "PROPOSAL_REVIEW",
    daysStalled: 5,
    unansweredEmails: 1,
    sentiment: "POSITIVE",
    deltaT: 2,
    stakeholders: [
      { role: "CHAMPION", status: "ACTIVE", weight: 0.3 },
      { role: "ECONOMIC_BUYER", status: "ACTIVE", weight: 0.45 },
    ],
  });
  assert(result.dri === 14, `Model 2: DRI 14, got ${result.dri}`);
  assert(result.targetStage === "RE_ENGAGED", `Model 2: RE_ENGAGED, got ${result.targetStage}`);
  console.log("✓ Test Model 2: Normal Progression (On-Track Proposal)");
}

function testModel3(): void {
  const result = calculateDRI({
    stage: "PROPOSAL_REVIEW",
    daysStalled: 18,
    unansweredEmails: 3,
    sentiment: "NEUTRAL",
    deltaT: 6,
    stakeholders: [
      { role: "CHAMPION", status: "DETRACTOR", weight: 0.3 },
      { role: "ECONOMIC_BUYER", status: "ACTIVE", weight: 0.45 },
    ],
  });
  assertClose(result.rawDri, 131.8, 1, "Model 3 raw DRI");
  assert(result.dri === 100, `Model 3: DRI capped 100, got ${result.dri}`);
  assert(
    result.targetStage === "REQUIRES_MANUAL_REVIEW",
    `Model 3: REQUIRES_MANUAL_REVIEW, got ${result.targetStage}`
  );
  const det = result.reprofiledStakeholders.find((s) => s.role === "DETRACTOR");
  assert(det, "Model 3: champion re-profiled to DETRACTOR");
  console.log("✓ Test Model 3: Elevated Risk & Champion Entropy Decay");
}

function testModel4(): void {
  const result = calculateDRI({
    stage: "LEGAL_SECURITY",
    daysStalled: 25,
    unansweredEmails: 1,
    sentiment: "NEUTRAL",
    deltaT: 3,
    stakeholders: [{ role: "ECONOMIC_BUYER", status: "ACTIVE", weight: 0.45 }],
  });
  assert(result.dri === 63, `Model 4: DRI 63, got ${result.dri}`);
  assert(result.targetStage === "RE_ENGAGED", `Model 4: RE_ENGAGED, got ${result.targetStage}`);
  console.log("✓ Test Model 4: High-Tolerance Procurement Stage");
}

export function runMatrixCalibrationSuite(): void {
  testModel1();
  testModel2();
  testModel3();
  testModel4();
  console.log("Lazarus Engine — Model Calibration Suite: all passed");
}

const isDirect =
  typeof process !== "undefined" &&
  process.argv[1] &&
  /matrix\.test\.(ts|js|mjs)$/.test(process.argv[1].replace(/\\/g, "/"));

if (isDirect) {
  runMatrixCalibrationSuite();
}
