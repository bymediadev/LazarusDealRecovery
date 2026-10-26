/**
 * Turbo 2 Text→Math — schema-locked telemetry from transcript + CRM fields.
 */

import { z } from "zod";
import type { ProspectSentiment, StakeholderRole } from "./config.js";
import type { RefinedDealInputPayload, StakeholderProfile } from "./matrix.js";

export const TelemetryExtractSchema = z.object({
  daysStalled: z.number().int().min(0).max(730),
  unansweredEmails: z.number().int().min(0).max(50),
  sentiment: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE", "GHOSTING"]),
  deltaT: z.number().int().min(0).max(365),
  stage: z.string().min(1).max(64),
  contractValue: z.number().min(0).optional(),
  stakeholders: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().optional(),
        role: z.enum(["CHAMPION", "ECONOMIC_BUYER", "BLOCKER", "DETRACTOR", "USER"]),
        engagementScore: z.number().optional(),
        lastObservedSignal: z.string().optional(),
      })
    )
    .default([]),
  evidentiaryExcerpts: z.array(z.string()).default([]),
});

export type TelemetryExtract = z.infer<typeof TelemetryExtractSchema>;

const ROLE_HINTS: { re: RegExp; role: StakeholderRole }[] = [
  { re: /\b(cfo|economic buyer|budget owner|signer)\b/i, role: "ECONOMIC_BUYER" },
  { re: /\b(champion|sponsor|coach)\b/i, role: "CHAMPION" },
  { re: /\b(blocker|detractor|opposed|pushback)\b/i, role: "DETRACTOR" },
  { re: /\b(security|legal|procurement|compliance)\b/i, role: "BLOCKER" },
];

function inferSentiment(text: string): ProspectSentiment {
  if (/\b(ghost|no response|radio silence|went dark)\b/i.test(text)) return "GHOSTING";
  if (/\b(angry|frustrated|deal.?breaker|not interested|killed)\b/i.test(text)) return "NEGATIVE";
  if (/\b(excited|looking forward|ready to|let'?s move)\b/i.test(text)) return "POSITIVE";
  return "NEUTRAL";
}

function inferStage(text: string, crmStage?: string | null): string {
  if (crmStage && crmStage.trim()) return crmStage.trim().toUpperCase().replace(/\s+/g, "_");
  if (/\b(legal|security|procurement|soc\s*2|iso)\b/i.test(text)) return "LEGAL_SECURITY";
  if (/\b(proposal|pricing|quote|commercial)\b/i.test(text)) return "PROPOSAL_REVIEW";
  if (/\b(demo|poc|pilot|technical)\b/i.test(text)) return "DEMO";
  return "PROPOSAL_REVIEW";
}

function extractExcerpts(transcript: string, limit = 4): string[] {
  const lines = transcript
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 24 && l.length < 280);
  const scored = lines.filter((l) =>
    /\b(budget|security|timeline|champion|legal|stall|delay|competitor|approval)\b/i.test(l)
  );
  return (scored.length ? scored : lines).slice(0, limit);
}

function inferStakeholders(transcript: string): StakeholderProfile[] {
  const found: StakeholderProfile[] = [];
  for (const hint of ROLE_HINTS) {
    if (hint.re.test(transcript)) {
      found.push({
        role: hint.role,
        name: hint.role,
        lastObservedSignal: hint.re.exec(transcript)?.[0] ?? hint.role,
        status: "ACTIVE",
      });
    }
  }
  if (!found.length) {
    found.push({ role: "CHAMPION", name: "Champion", status: "ACTIVE" });
  }
  return found;
}

/**
 * Deterministic Text→Math extract (no LLM). CRM body fields override transcript heuristics.
 */
export function extractTelemetry(input: {
  transcript?: string;
  crm?: Partial<RefinedDealInputPayload> & {
    stage?: string | null;
    daysStalled?: number;
    unansweredEmailCount?: number;
    lastProspectSentiment?: ProspectSentiment;
    contractValue?: number;
    stakeholders?: StakeholderProfile[];
  };
}): TelemetryExtract {
  const text = input.transcript ?? "";
  const crm = input.crm ?? {};

  const daysStalled =
    crm.daysStalled ??
    crm.tStalled ??
    (/\b(\d+)\s*days?\b/i.test(text)
      ? Number(/\b(\d+)\s*days?\b/i.exec(text)?.[1] ?? 10)
      : 10);

  const unansweredEmails =
    crm.unansweredEmailCount ??
    crm.unansweredCount ??
    crm.unansweredEmails ??
    (/\b(unanswered|no reply|ghost)\b/i.test(text) ? 3 : 1);

  const sentiment =
    crm.lastProspectSentiment ??
    crm.sentiment ??
    inferSentiment(text);

  const raw = {
    daysStalled: Math.max(0, Math.round(Number(daysStalled) || 0)),
    unansweredEmails: Math.max(0, Math.round(Number(unansweredEmails) || 0)),
    sentiment,
    deltaT: crm.deltaT ?? crm.daysSinceSentimentSignal ?? 3,
    stage: inferStage(text, crm.stage),
    contractValue: crm.contractValue ?? 0,
    stakeholders: crm.stakeholders?.length
      ? crm.stakeholders
      : inferStakeholders(text),
    evidentiaryExcerpts: extractExcerpts(text),
  };

  return TelemetryExtractSchema.parse(raw);
}

export function telemetryToMatrixPayload(
  extract: TelemetryExtract,
  dealId?: string
): RefinedDealInputPayload {
  return {
    dealId,
    stage: extract.stage,
    daysStalled: extract.daysStalled,
    unansweredEmails: extract.unansweredEmails,
    sentiment: extract.sentiment,
    deltaT: extract.deltaT,
    contractValue: extract.contractValue ?? 0,
    stakeholders: extract.stakeholders as StakeholderProfile[],
  };
}
