/**
 * Transcript grounding audit — rejects enterprise-template hallucinations.
 * Every force evidence quote must be traceable to the source transcript.
 */

import {
  type DeepContextInput,
  buildDeepContextMessageBlock,
} from "./deepContext.js";
import type {
  EvidenceSource,
  GroundingStatus,
  RejectedEvidence,
  StakeholderRepair,
} from "../src/lib/analysisLineage.js";

export interface StakeholderSignal {
  name: string;
  role: string;
  /** @deprecated use persona_type — kept for backward compatibility */
  stance: string;
  authority_level: string;
  persona_type: string;
  evidence: string;
  evidence_speaker?: string;
  evidence_basis?: "firsthand" | "secondhand" | "unattributed";
  /** transcript = spoken in the call. supplemental = CRM or a later note, not the call. */
  evidence_source?: EvidenceSource;
}

export interface GroundingAudit {
  pass: boolean;
  /** fully_grounded, partially_grounded, or rejected. A failed extraction is never reported as fully grounded. */
  grounding_status: GroundingStatus;
  grounded_force_count: number;
  ungrounded_forces: { factor: string; evidence: string; reason: string }[];
  invented_terms: string[];
  invented_amounts: string[];
  missing_critical_stakeholders: string[];
  stakeholders: StakeholderSignal[];
  ungrounded_stakeholders: { name: string; reason: string }[];
  /** Forces kept because supplemental context supports them. They are not transcript evidence. */
  supplemental_forces: { factor: string; reason: string }[];
  rejected_evidence: RejectedEvidence[];
  warnings: string[];
}

const TEMPLATE_BLEED_TERMS = [
  "as/400",
  "as400",
  "ibm as",
  "capex freeze",
  "board freeze",
  "board-mandated",
  "board mandated",
  "$500",
  "500k",
  "500,000",
  "$1.2",
  "1.2 million",
  "1.2m",
  "acquisition",
  "merger",
  "kafka",
  "kubernetes",
  "cybercore",
  "cloudvantage",
  "legacy system migration",
  "fiscal window",
  "nine-month deployment",
  "9-month",
];

/** Not person names — speaker labels, pronouns, common sentence starters */
const NAME_STOPWORDS = new Set([
  "he", "she", "they", "we", "you", "i", "it", "the", "this", "that", "these", "those",
  "from", "later", "then", "when", "what", "where", "how", "why", "who", "which",
  "rep", "prospect", "seller", "buyer", "speaker", "speakers", "client", "customer",
  "hello", "hi", "hey", "yes", "no", "well", "look", "honestly", "thanks", "thank",
  "based", "given", "our", "your", "their", "his", "her", "its", "my", "mine",
  "call", "recording", "transcript", "date", "june", "july", "august", "september",
  "monday", "tuesday", "wednesday", "thursday", "friday", "january", "february",
  "march", "april", "may", "october", "november", "december",
  "if", "but", "and", "or", "so", "just", "also", "still", "really", "actually",
  "cloud", "vant", "sales", "team", "board", "deal", "contract", "budget",
  "logistics", "health", "systems", "solutions", "technologies", "technology",
  "software", "services", "industries", "enterprise", "global", "digital",
  "information", "officer", "executive", "infrastructure", "operations",
  "vantage", "core", "meridian", "salesforce", "omni", "analytics", "platform",
  "horizon", "discovery", "transcript", "northline", "syncflow",
]);

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function stripQuoteWrappers(text: string): string {
  return text.replace(/^["'""]+|["'""]+$/g, "").trim();
}

function isLikelyPersonName(token: string): boolean {
  const t = token.trim();
  if (t.length < 2 || t.length > 24) return false;
  const lower = t.toLowerCase();
  if (NAME_STOPWORDS.has(lower)) return false;
  if (t === t.toUpperCase() && t.length <= 8) return false;
  return /^[A-Z][a-z]{1,20}$/.test(t) || /^[A-Z]{2,3}$/.test(t);
}

function isCompanyNameFragment(token: string, transcript: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b[A-Z][A-Za-z0-9]*\\s+${escaped}\\b`).test(transcript);
}

/** Verbatim or near-verbatim quote must appear in transcript */
export function evidenceMatchesTranscript(evidence: string, transcript: string): boolean {
  const quote = stripQuoteWrappers(evidence);
  if (quote.length < 10) return false;

  const t = normalizeForMatch(transcript);
  const q = normalizeForMatch(quote);

  if (t.includes(q)) return true;

  const words = q.split(" ").filter((w) => w.length > 2);
  if (words.length < 3) return t.includes(q);

  let ti = 0;
  let matched = 0;
  for (const word of words) {
    const idx = t.indexOf(word, ti);
    if (idx !== -1) {
      matched++;
      ti = idx + word.length;
    }
  }
  return matched / words.length >= 0.75;
}

function termInText(term: string, text: string): boolean {
  return normalizeForMatch(text).includes(term.toLowerCase());
}

function collectOutputText(
  forces: { factor: string; evidence: string }[],
  extra = ""
): string {
  return [extra, ...forces.map((f) => `${f.factor} ${f.evidence}`)].join(" ");
}

/**
 * Terms from other deal templates that must not appear unless they are in the
 * transcript or in supplemental context. Supplemental support is not transcript support.
 */
export function detectInventedTerms(
  forces: { factor: string; evidence: string }[],
  transcript: string,
  extraOutputText = "",
  supplemental = ""
): string[] {
  const outputBlob = collectOutputText(forces, extraOutputText);
  const invented: string[] = [];

  for (const term of TEMPLATE_BLEED_TERMS) {
    if (
      termInText(term, outputBlob) &&
      !termInText(term, transcript) &&
      !termInText(term, supplemental)
    ) {
      invented.push(term);
    }
  }
  return invented;
}

/** Transcript match wins. A supplemental-only match stays labeled supplemental. */
export function classifyEvidenceSource(
  evidence: string,
  transcript: string,
  supplemental = ""
): EvidenceSource | "none" {
  if (evidenceMatchesTranscript(evidence, transcript)) return "transcript";
  if (supplemental.trim() && evidenceMatchesTranscript(evidence, supplemental)) return "supplemental";
  return "none";
}

/** Dollar amounts in output that never appear in the transcript */
export function detectInventedDollarAmounts(
  outputText: string,
  transcript: string
): string[] {
  const amountRe = /\$[\d,]+(?:\.\d+)?(?:\s*[kKmM])?|\b[\d,]+\s*(?:k|K|m|M)\b/g;
  const found = outputText.match(amountRe) ?? [];
  const invented: string[] = [];
  const tNorm = normalizeForMatch(transcript).replace(/[,$]/g, "");

  for (const raw of new Set(found)) {
    const digits = raw.replace(/[^0-9]/g, "");
    if (!digits || digits.length < 3) continue;
    if (!tNorm.includes(digits)) {
      invented.push(raw.trim());
    }
  }
  return invented;
}

/** People who must appear in stakeholders when explicitly named as blockers */
export function detectMissingCriticalStakeholders(
  transcript: string,
  stakeholders: StakeholderSignal[]
): string[] {
  const t = normalizeForMatch(transcript);
  const missing: string[] = [];
  const hasStakeholder = (needle: string) =>
    stakeholders.some((s) => {
      const blob = `${s.name} ${s.role} ${s.persona_type} ${s.stance}`.toLowerCase();
      return blob.includes(needle);
    });

  if (/\bdave\b/.test(t) && !hasStakeholder("dave")) {
    missing.push("Dave");
  }

  if (
    (t.includes("vp of infrastructure") || t.includes("vice president of infrastructure")) &&
    !hasStakeholder("infrastructure")
  ) {
    missing.push("VP of Infrastructure");
  }

  if (
    (t.includes("missed the demo") || t.includes("missed the technical demo")) &&
    t.includes("dave") &&
    !hasStakeholder("dave")
  ) {
    missing.push("Dave (missed demo — detractor)");
  }

  for (const approver of absentApproversInTranscript(transcript)) {
    if (!hasStakeholder(approver.name.toLowerCase())) missing.push(approver.name);
  }

  return [...new Set(missing)];
}

export function buildTranscriptConstraints(transcript: string, dealValue: number): string {
  const forbidden = TEMPLATE_BLEED_TERMS.filter((term) => !termInText(term, transcript));
  const lines = [
    dealValue > 0
      ? `USER DEAL VALUE: $${dealValue.toLocaleString()} — do not cite other contract sizes unless spoken.`
      : "No deal value was entered. Do not invent a price. Cite only amounts spoken in the transcript.",
    "Extract ONLY from the transcript below. No AS/400, capex freeze, acquisition, or M&A unless literally said.",
    "Every force evidence = verbatim quote from this transcript.",
    "People Map (stakeholders[]): every persona with persona_type (Aligned Champion | Absent Decision Maker | Hidden Detractor).",
    "Structural parent forces require verbatim buyer/prospect quotes — not rep summaries.",
  ];
  if (forbidden.length > 0) {
    lines.push(`FORBIDDEN in output (not in this transcript): ${forbidden.slice(0, 12).join(", ")}`);
  }
  return lines.join("\n");
}

export function extractMentionedNames(transcript: string): string[] {
  const names = new Set<string>();

  const add = (raw: string | undefined) => {
    if (!raw) return;
    const token = raw.trim().split(/\s+/)[0];
    if (!isLikelyPersonName(token)) return;
    if (isCompanyNameFragment(token, transcript)) return;
    names.add(token);
  };

  const roleParenRe = /\b(?:Rep|Prospect|Seller|Buyer|Speaker)\s*\(\s*([A-Za-z][A-Za-z.-]{1,24})\s*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = roleParenRe.exec(transcript)) !== null) add(m[1]);

  const headerNameRe = /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*\([A-Z]{1,4}\)/gm;
  while ((m = headerNameRe.exec(transcript)) !== null) add(m[1].split(/\s+/)[0]);

  const titledRe =
    /\b([A-Z][a-z]{2,})\s*(?:\([^)]*(?:VP|Vice President|Director|CIO|CTO|CFO|CEO|Chief|President|Infrastructure)[^)]*\)|[-–—]\s*(?:Chief|VP|Vice President|Director))/g;
  while ((m = titledRe.exec(transcript)) !== null) add(m[1]);

  const titleNameRe =
    /\b(?:VP|Vice President|Director|Chief)\s+(?:of\s+[\w\s]+)?,\s*([A-Z][a-z]{2,})\b/g;
  while ((m = titleNameRe.exec(transcript)) !== null) add(m[1]);

  const actionRe =
    /\b([A-Z][a-z]{2,})\s+(?:missed|didn't attend|did not attend|wasn't on|was not on|no-showed)\b/g;
  while ((m = actionRe.exec(transcript)) !== null) add(m[1]);

  const loopInRe = /\b(?:loop in|bring in|include|invite)\s+([A-Z][a-z]{2,})\b/gi;
  while ((m = loopInRe.exec(transcript)) !== null) add(m[1]);

  // "Dave, our VP of Infrastructure"
  const namedVpRe = /\b([A-Z][a-z]{2,}),\s*our\s+(?:VP|Vice President)\s+of\s+\w+/g;
  while ((m = namedVpRe.exec(transcript)) !== null) add(m[1]);

  return [...names];
}

export function auditTranscriptGrounding(input: {
  transcript: string;
  dealValue: number;
  causal_forces: { factor: string; evidence: string }[];
  executive_summary?: string;
  force_initialization?: { summary?: string; classification_rationale?: string };
  stakeholders?: StakeholderSignal[];
  /** CRM notes or a later meeting. Matches here are supplemental, not transcript evidence. */
  supplemental?: string;
}): GroundingAudit {
  const {
    transcript,
    causal_forces,
    executive_summary = "",
    force_initialization = {},
    stakeholders = [],
    supplemental = "",
  } = input;
  const ungrounded_forces: GroundingAudit["ungrounded_forces"] = [];
  const supplemental_forces: GroundingAudit["supplemental_forces"] = [];
  const warnings: string[] = [];

  const extraOutput = [
    executive_summary,
    force_initialization.summary ?? "",
    force_initialization.classification_rationale ?? "",
  ].join(" ");

  for (const force of causal_forces) {
    const source = classifyEvidenceSource(force.evidence, transcript, supplemental);
    if (source === "none") {
      ungrounded_forces.push({
        factor: force.factor,
        evidence: force.evidence,
        reason: "Evidence quote not found in transcript (possible hallucination)",
      });
    } else if (source === "supplemental") {
      supplemental_forces.push({
        factor: force.factor,
        reason: "Evidence is in supplemental context, not in the transcript.",
      });
    }
  }

  const invented_terms = detectInventedTerms(causal_forces, transcript, extraOutput, supplemental);
  if (invented_terms.length > 0) {
    warnings.push(
      `Template bleed blocked — not in transcript: ${invented_terms.join(", ")}`
    );
  }

  const invented_amounts = detectInventedDollarAmounts(
    extraOutput,
    `${transcript}\n${supplemental}`
  );
  if (invented_amounts.length > 0) {
    warnings.push(
      `Invented dollar amounts blocked — not in transcript: ${invented_amounts.join(", ")}`
    );
  }

  const missing_critical_stakeholders = detectMissingCriticalStakeholders(
    transcript,
    stakeholders
  );
  if (missing_critical_stakeholders.length > 0) {
    warnings.push(
      `Missing stakeholder(s) required by transcript: ${missing_critical_stakeholders.join(", ")}`
    );
  }

  const ungrounded_stakeholders: GroundingAudit["ungrounded_stakeholders"] = [];
  for (const s of stakeholders) {
    if (!s.name.trim()) continue;
    const source = s.evidence_source ?? classifyEvidenceSource(s.evidence, transcript, supplemental);
    if (source === "none") {
      ungrounded_stakeholders.push({
        name: s.name,
        reason: "Stakeholder evidence not grounded in transcript",
      });
    }
  }

  const grounded_force_count = causal_forces.length - ungrounded_forces.length;
  const pass =
    ungrounded_forces.length === 0 &&
    invented_terms.length === 0 &&
    invented_amounts.length === 0 &&
    missing_critical_stakeholders.length === 0 &&
    ungrounded_stakeholders.length === 0 &&
    causal_forces.length > 0;

  const grounding_status: GroundingStatus = pass
    ? "fully_grounded"
    : grounded_force_count === 0
      ? "rejected"
      : "partially_grounded";

  const rejected_evidence = rejectedFromAudit({
    ungrounded_forces,
    ungrounded_stakeholders,
    invented_terms,
    invented_amounts,
    missing_critical_stakeholders,
  });

  if (supplemental_forces.length > 0) {
    warnings.push(
      `Supplemental context supports ${supplemental_forces.length} force(s). Those forces are not transcript evidence.`
    );
  }

  return {
    pass,
    grounding_status,
    grounded_force_count,
    ungrounded_forces,
    invented_terms,
    invented_amounts,
    missing_critical_stakeholders,
    stakeholders,
    ungrounded_stakeholders,
    supplemental_forces,
    rejected_evidence,
    warnings,
  };
}

function rejectedFromAudit(audit: {
  ungrounded_forces: { factor: string; reason: string }[];
  ungrounded_stakeholders: { name: string; reason: string }[];
  invented_terms: string[];
  invented_amounts: string[];
  missing_critical_stakeholders: string[];
}): RejectedEvidence[] {
  return [
    ...audit.ungrounded_forces.map((force) => ({
      kind: "force" as const,
      label: force.factor,
      detail: force.reason,
      reason: "ungrounded_force",
    })),
    ...audit.ungrounded_stakeholders.map((person) => ({
      kind: "stakeholder" as const,
      label: person.name,
      detail: person.reason,
      reason: "ungrounded_stakeholder",
    })),
    ...audit.invented_terms.map((term) => ({
      kind: "term" as const,
      label: term,
      detail: "Term is not in the transcript or supplemental context.",
      reason: "invented_term",
    })),
    ...audit.invented_amounts.map((amount) => ({
      kind: "amount" as const,
      label: amount,
      detail: "Amount is not in the transcript or supplemental context.",
      reason: "invented_amount",
    })),
    ...audit.missing_critical_stakeholders.map((name) => ({
      kind: "missing_stakeholder" as const,
      label: name,
      detail: "Named in the transcript but missing from the extraction.",
      reason: "missing_stakeholder",
    })),
  ];
}

/**
 * Final audit after filtering. A failed extraction stays failed even when the
 * remaining forces are safe to score. Removed claims stay on rejected_evidence.
 */
export function composeFinalGroundingAudit(
  prior: GroundingAudit,
  refreshed: GroundingAudit
): GroundingAudit {
  const scoringUnsafe =
    refreshed.ungrounded_forces.length > 0 ||
    refreshed.invented_terms.length > 0 ||
    refreshed.invented_amounts.length > 0 ||
    refreshed.missing_critical_stakeholders.length > 0 ||
    refreshed.ungrounded_stakeholders.length > 0 ||
    refreshed.grounded_force_count === 0;

  const removedSomething = !prior.pass;
  let grounding_status: GroundingStatus;
  if (scoringUnsafe && refreshed.grounded_force_count === 0) grounding_status = "rejected";
  else if (scoringUnsafe || removedSomething) grounding_status = "partially_grounded";
  else grounding_status = "fully_grounded";

  const warnings = [
    ...prior.warnings.filter((warning) => !/Missing stakeholder/i.test(warning)),
    ...refreshed.warnings.filter((warning) => !prior.warnings.includes(warning)),
  ];
  if (grounding_status === "partially_grounded") {
    warnings.push(
      "Grounding was partial. Ungrounded claims were removed before scoring. This is not a fully grounded extraction."
    );
  }
  if (grounding_status === "rejected") {
    warnings.push("Grounding rejected the extraction. No safe force remained for scoring.");
  }

  const rejected_evidence = [
    ...prior.rejected_evidence,
    ...refreshed.rejected_evidence.filter(
      (item) => !prior.rejected_evidence.some((priorItem) => priorItem.kind === item.kind && priorItem.label === item.label)
    ),
  ];

  return {
    ...refreshed,
    pass: grounding_status === "fully_grounded",
    grounding_status,
    ungrounded_forces: prior.ungrounded_forces.length ? prior.ungrounded_forces : refreshed.ungrounded_forces,
    invented_terms: [...new Set([...prior.invented_terms, ...refreshed.invented_terms])],
    invented_amounts: [...new Set([...prior.invented_amounts, ...refreshed.invented_amounts])],
    missing_critical_stakeholders: refreshed.missing_critical_stakeholders,
    ungrounded_stakeholders: prior.ungrounded_stakeholders.length
      ? prior.ungrounded_stakeholders
      : refreshed.ungrounded_stakeholders,
    rejected_evidence,
    warnings,
    stakeholders: refreshed.stakeholders,
    grounded_force_count: refreshed.grounded_force_count,
    supplemental_forces: refreshed.supplemental_forces,
  };
}

/** Remove forces/summary fields that reference content not in the transcript */
export function filterInventedForces<T extends { factor: string; evidence: string }>(
  forces: T[],
  transcript: string,
  extraOutputText = ""
): T[] {
  return selectGroundedForces(forces, transcript, "", extraOutputText).kept;
}

/**
 * Keep a force only when its evidence is in the transcript or in supplemental context.
 * Supplemental matches stay tagged and are not treated as transcript quotes.
 */
export function selectGroundedForces<T extends { factor: string; evidence: string }>(
  forces: T[],
  transcript: string,
  supplemental = "",
  extraOutputText = ""
): {
  kept: (T & { evidence_source: EvidenceSource })[];
  rejected: RejectedEvidence[];
} {
  const invented = new Set(detectInventedTerms(forces, transcript, extraOutputText, supplemental));
  const kept: (T & { evidence_source: EvidenceSource })[] = [];
  const rejected: RejectedEvidence[] = [];
  for (const force of forces) {
    const inventedHit = [...invented].find(
      (term) => termInText(term, force.factor) || termInText(term, force.evidence)
    );
    const source = classifyEvidenceSource(force.evidence, transcript, supplemental);
    if (inventedHit || source === "none") {
      rejected.push({
        kind: "force",
        label: force.factor,
        detail: inventedHit
          ? `Force uses "${inventedHit}", which is not in the transcript or supplemental context.`
          : "Evidence quote not found in the transcript or supplemental context.",
        reason: inventedHit ? "invented_term" : "ungrounded_force",
      });
      continue;
    }
    kept.push({ ...force, evidence_source: source });
  }
  return { kept, rejected };
}

/**
 * Pull a verbatim transcript span that mentions this person.
 * Never invents text — returns null when no grounded span exists.
 */
export function groundedQuoteForPerson(transcript: string, name: string): string | null {
  const token = name.trim().split(/\s+/)[0];
  if (!token || token.length < 2) return null;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sentenceRe = new RegExp(`[^.\\n]*\\b${escaped}\\b[^.\\n]*[.!]?`, "i");
  const match = transcript.match(sentenceRe);
  if (!match) return null;
  const quote = match[0].replace(/^\[[^\]]+\]\s*/, "").trim();
  if (quote.length < 10) return null;
  return evidenceMatchesTranscript(quote, transcript) ? quote : null;
}

function hasNamedStakeholder(stakeholders: StakeholderSignal[], needle: string): boolean {
  const n = needle.toLowerCase();
  return stakeholders.some((s) =>
    `${s.name} ${s.role} ${s.persona_type} ${s.stance}`.toLowerCase().includes(n)
  );
}

export interface AbsentApprover {
  name: string;
  role: string;
  authority_level: "technical_veto" | "unknown";
  evidence: string;
}

/**
 * People the transcript names as absent approvers. Role and authority come from
 * the same span. A technical sign-off is not recorded as economic authority.
 */
export function absentApproversInTranscript(transcript: string): AbsentApprover[] {
  const found: AbsentApprover[] = [];
  const seen = new Set<string>();

  const consider = (name: string, roleHint: string) => {
    const token = name.trim().split(/\s+/)[0] ?? "";
    if (!isLikelyPersonName(token)) return;
    const key = token.toLowerCase();
    if (seen.has(key)) return;
    const quote = groundedQuoteForPerson(transcript, token);
    if (!quote) return;
    const window = transcript.slice(
      Math.max(0, transcript.toLowerCase().indexOf(token.toLowerCase())),
      Math.max(0, transcript.toLowerCase().indexOf(token.toLowerCase())) + 220
    );
    const absent =
      /\b(missed|wasn'?t on|was not on|couldn'?t join|could not join|not on the call|underwater until)\b/i.test(
        `${quote} ${window}`
      );
    if (!absent) return;
    const blob = `${roleHint} ${quote} ${window}`;
    const technical =
      /infrastructure|architecture|technical|ot network|vlan|sign(?:s|ed)? off/i.test(blob) &&
      !/\b(cfo|budget owner|economic buyer)\b/i.test(roleHint);
    seen.add(key);
    found.push({
      name: token,
      role: roleHint.trim() || (technical ? "Technical approver" : "Approver"),
      authority_level: technical ? "technical_veto" : "unknown",
      evidence: quote,
    });
  };

  const namedTitle =
    /\b([A-Z][a-z]{2,}),\s*our\s+((?:VP|Vice President|Director|Chief)[^,.\n]{0,48})/g;
  let match: RegExpExecArray | null;
  while ((match = namedTitle.exec(transcript)) !== null) consider(match[1], match[2]);

  const missed =
    /\b([A-Z][a-z]{2,})\s+(?:missed|wasn't on|was not on|couldn't join|could not join)\b/g;
  while ((match = missed.exec(transcript)) !== null) consider(match[1], "");

  return found;
}

export function explainStakeholderGrounding(
  stakeholders: StakeholderSignal[],
  transcript: string,
  supplemental = ""
): {
  stakeholders: StakeholderSignal[];
  rejected: RejectedEvidence[];
  repairs: StakeholderRepair[];
} {
  const repaired: StakeholderSignal[] = [];
  const rejected: RejectedEvidence[] = [];
  const repairs: StakeholderRepair[] = [];

  for (const person of stakeholders) {
    if (!person.name?.trim()) continue;
    if (evidenceMatchesTranscript(person.evidence ?? "", transcript)) {
      repaired.push({ ...person, evidence_source: "transcript" });
      continue;
    }
    const quote = groundedQuoteForPerson(transcript, person.name);
    if (quote) {
      repaired.push({ ...person, evidence: quote, evidence_source: "transcript" });
      repairs.push({
        name: person.name,
        rule_id: "stakeholder_evidence_replaced",
        reason: "Stakeholder evidence was not in the transcript. Replaced with a verbatim span that names them.",
        evidence_source: "transcript",
      });
      continue;
    }
    if (supplemental.trim() && evidenceMatchesTranscript(person.evidence ?? "", supplemental)) {
      repaired.push({ ...person, evidence_source: "supplemental" });
      repairs.push({
        name: person.name,
        rule_id: "supplemental_stakeholder_kept",
        reason: "Stakeholder evidence is in supplemental context and is not treated as a transcript quote.",
        evidence_source: "supplemental",
      });
      continue;
    }
    rejected.push({
      kind: "stakeholder",
      label: person.name,
      detail: "Stakeholder evidence was not in the transcript or supplemental context.",
      reason: "ungrounded_stakeholder",
    });
  }

  for (const approver of absentApproversInTranscript(transcript)) {
    if (hasNamedStakeholder(repaired, approver.name.toLowerCase())) continue;
    repaired.push({
      name: approver.name,
      role: approver.role,
      stance: "Absent Decision Maker",
      persona_type: "Absent Decision Maker",
      authority_level: approver.authority_level,
      evidence: approver.evidence,
      evidence_source: "transcript",
    });
    repairs.push({
      name: approver.name,
      rule_id: "absent_approver_reinjection",
      reason:
        "A named absent approver was missing from the extraction. Reinjected from a verbatim transcript span. Technical sign-off is not economic authority.",
      evidence_source: "transcript",
    });
  }

  return { stakeholders: repaired, rejected, repairs };
}

/**
 * Keep people named in the transcript after grounding.
 * Ungrounded evidence is replaced with a verbatim span when possible.
 * Named absent approvers are reinjected from the transcript when missing.
 */
export function ensureGroundedStakeholders(
  stakeholders: StakeholderSignal[],
  transcript: string,
  supplemental = ""
): StakeholderSignal[] {
  return explainStakeholderGrounding(stakeholders, transcript, supplemental).stakeholders;
}

export function scrubInventedSummary(summary: string, transcript: string, supplemental = ""): string {
  let s = summary;
  for (const term of TEMPLATE_BLEED_TERMS) {
    if (termInText(term, s) && !termInText(term, transcript) && !termInText(term, supplemental)) {
      s = s.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "");
    }
  }
  return s.replace(/\s{2,}/g, " ").trim();
}

export function buildGroundingRetryMessage(
  transcript: string,
  dealValue: number,
  audit: GroundingAudit,
  deepContext?: DeepContextInput
): string {
  const failures = [
    ...audit.ungrounded_forces.map(
      (f) => `UNGROUNDED FORCE "${f.factor}": ${f.reason}. Evidence was: "${f.evidence}"`
    ),
    ...audit.invented_terms.map((t) => `INVENTED TERM "${t}" — not present in transcript`),
    ...audit.invented_amounts.map((a) => `INVENTED AMOUNT "${a}" — not present in transcript`),
    ...audit.missing_critical_stakeholders.map(
      (s) => `MISSING STAKEHOLDER "${s}" — named in transcript but not in stakeholders[]`
    ),
    ...audit.ungrounded_stakeholders.map((s) => `UNGROUNDED STAKEHOLDER "${s.name}"`),
  ];

  return `${buildTranscriptConstraints(transcript, dealValue)}${buildDeepContextMessageBlock(deepContext ?? {})}

YOUR PRIOR OUTPUT FAILED TRANSCRIPT GROUNDING. Re-extract from scratch.

FAILURES:
${failures.map((f) => `- ${f}`).join("\n")}

TRANSCRIPT:
${transcript}`;
}
