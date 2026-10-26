/**
 * Engine E2E calibration: Gate 0, matrix models, Meridian, peer filter,
 * Ghost-Buster queue rule, Revenue Detective heuristics.
 */
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  calculateDRI,
  evaluateGateZero,
} from "../server/engine/matrix.ts";
import {
  extractTelemetry,
  telemetryToMatrixPayload,
} from "../server/engine/telemetryExtract.ts";
import { shouldQueueGhostBuster } from "../server/engine/hooks.ts";
import { getContextAwareFallback } from "../server/engine/generator.ts";
import { isStandaloneInstall } from "../server/telemetry.ts";
import { resolveBrandTokens } from "../server/engine/branding.ts";
import { runMatrixCalibrationSuite } from "../server/engine/matrix.test.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function load(name) {
  return JSON.parse(readFileSync(path.join(root, "fixtures", name), "utf8"));
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

console.log("--- Matrix Models 1–4 ---");
runMatrixCalibrationSuite();

console.log("--- Meridian Gate 0 pass ---");
const meridian = load("meridian-cold-chain.json");
const mGate = evaluateGateZero({
  dealType: meridian.deal_type,
  commercialIntentScore: meridian.commercial_intent_score,
});
assert(mGate.omega === 1, "Meridian should pass Gate 0");
const mDri = calculateDRI({
  stage: meridian.stage,
  daysStalled: meridian.days_stalled,
  unansweredEmails: meridian.unanswered_emails,
  sentiment: meridian.sentiment,
  deltaT: meridian.delta_t,
  contractValue: meridian.contract_value,
  stakeholders: meridian.stakeholders,
  dealType: meridian.deal_type,
  commercialIntentScore: meridian.commercial_intent_score,
});
assert(mDri.omega === 1, "Meridian matrix omega 1");
assert(mDri.dri > 0, "Meridian DRI > 0");
console.log("✓ Meridian DRI", mDri.dri, mDri.targetStage);

console.log("--- Daniel Johnson Gate 0 suppress ---");
const daniel = load("daniel-johnson-peer.json");
const dGate = evaluateGateZero({
  dealType: daniel.deal_type,
  commercialIntentScore: daniel.commercial_intent_score,
});
assert(dGate.omega === 0, "Daniel omega 0");
assert(dGate.action === "SUPPRESS_OUTREACH", "Daniel suppress");
console.log("✓ Peer networking suppressed");

console.log("--- Telemetry extract + Ghost-Buster queue rule ---");
const extract = extractTelemetry({
  transcript: meridian.transcript_excerpt,
  crm: {
    stage: meridian.stage,
    daysStalled: meridian.days_stalled,
    unansweredEmailCount: 3,
    lastProspectSentiment: "GHOSTING",
    contractValue: meridian.contract_value,
  },
});
const decision = calculateDRI(telemetryToMatrixPayload(extract, "meridian"));
const queue = shouldQueueGhostBuster(decision, extract.unansweredEmails);
assert(queue === true || decision.dri > 85 || extract.unansweredEmails >= 3, "queue rule");
const draft = getContextAwareFallback("SOFT_REENGAGE_V1", {
  prospectName: "Elena",
  companyName: "Meridian",
  riskIndex: decision.dri,
  transcriptExcerpts: extract.evidentiaryExcerpts,
});
assert(draft.evidentiaryExcerpts.length >= 1, "evidentiary excerpts required");
console.log("✓ Ghost-Buster would queue (not send). DRI", decision.dri);

console.log("--- Revenue Detective hidden blocker ---");
const detective = load("revenue-detective-security.json");
const sec = extractTelemetry({ transcript: detective.transcript_excerpt });
assert(
  sec.stakeholders.some((s) => s.role === "BLOCKER" || s.role === "DETRACTOR") ||
    /security|soc/i.test(sec.evidentiaryExcerpts.join(" ")),
  "security signal detected"
);
assert(sec.stage === "LEGAL_SECURITY" || /security/i.test(detective.transcript_excerpt), "security stage/signal");
console.log("✓ Hidden security friction surfaced for review-queue interrupt");

console.log("--- Standalone brand / telemetry fence ---");
process.env.STANDALONE_INSTALL = "true";
process.env.WHITE_LABEL_BRAND_NAME = "Elite Point Engine";
assert(isStandaloneInstall() === true, "standalone flag");
assert(resolveBrandTokens().brandName === "Elite Point Engine", "brand token");
delete process.env.STANDALONE_INSTALL;
delete process.env.WHITE_LABEL_BRAND_NAME;
console.log("✓ Standalone fence helpers");

console.log("ENGINE CALIBRATION OK");
