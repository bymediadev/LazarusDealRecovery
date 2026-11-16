import type { PostMortemResult } from "../types";
import { readConstraint, type ConstraintKind } from "./constraintReading";
import { normalizeTranscript } from "./transcriptNormalize";

const ROOT_NOUN: Partial<Record<ConstraintKind, string>> = {
  technical_approval: "Technical sign-off",
  budget_resistance: "Budget resistance",
  financial_approval: "Financial approval",
  procurement_or_legal: "Open approval requirement",
  confirmed_rejection: "Confirmed rejection",
  active_opposition: "Active opposition",
  delayed_meeting: "Delayed meeting",
  absent_stakeholder: "Absent approver",
  conflicting_statements: "Conflicting statements",
  multiple_blockers: "Multiple blockers",
  insufficient_evidence: "Insufficient evidence",
};

/** Short noun phrase for the blocker. No person name and no role title. */
export function reportRootIssue(result: PostMortemResult): string {
  const blob = [
    result.source_transcript ?? "",
    ...(result.causal_forces ?? []).map((force) => `${force.factor} ${force.evidence ?? ""}`),
    result.live_deal_triage?.core_blocker ?? "",
    result.equilibrium_analysis?.equilibrium_breaker ?? "",
  ].join("\n");
  const noun = ROOT_NOUN[readConstraint(blob).kind];
  if (noun) return noun;
  const names = (result.stakeholders ?? []).flatMap((person) =>
    person.name.split(/\s+/).filter((part) => part.length > 2)
  );
  let phrase =
    result.live_deal_triage?.root_issue ||
    result.live_deal_triage?.core_blocker ||
    result.equilibrium_analysis?.equilibrium_breaker ||
    "Unspecified blocker";
  for (const name of names) {
    phrase = phrase.replace(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "ig"), " ");
  }
  const words = phrase
    .replace(/[^A-Za-z\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !/^(the|and|for|with|this|that|will|not|until)$/i.test(word))
    .slice(0, 4);
  return words.join(" ") || "Unspecified blocker";
}

interface TranscriptTurn {
  speaker: string;
  body: string;
}

function speakerDirectory(transcript: string): Map<string, string> {
  const directory = new Map<string, string>();
  const block = transcript.match(/SPEAKERS:\s*([\s\S]*?)(?:\n\s*\n|\n\[)/i);
  if (!block) return directory;
  for (const line of block[1].split("\n")) {
    const match = line.match(/^(.+?)\(([A-Za-z]{1,8})\)/);
    if (!match) continue;
    directory.set(match[2].trim().toLowerCase(), match[1].trim());
  }
  return directory;
}

function transcriptTurns(transcript: string): TranscriptTurn[] {
  const normalized = normalizeTranscript(transcript);
  const directory = speakerDirectory(normalized);
  const turns: TranscriptTurn[] = [];
  let current: TranscriptTurn | null = null;
  for (const line of normalized.split(/\r?\n/)) {
    const stamped = line.match(/^\[(\d{2}:\d{2}:\d{2})\]\s*([A-Za-z][A-Za-z .'-]{0,40}):\s*(.*)$/);
    const named = line.match(/^([A-Z][A-Za-z .'-]{1,40}):\s*(.*)$/);
    const match = stamped ?? named;
    if (!match) continue;
    if (current) turns.push(current);
    const alias = (stamped ? stamped[2] : named?.[1] ?? "").trim();
    const body = (stamped ? stamped[3] : named?.[2] ?? "").trim();
    current = { speaker: directory.get(alias.toLowerCase()) ?? alias, body };
  }
  if (current) turns.push(current);
  return turns;
}

function namePattern(personName: string): RegExp | null {
  const first = personName.trim().split(/\s+/)[0] ?? "";
  if (first.length < 2) return null;
  return new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
}

const NOT_A_PERSON =
  /^(yes|but|the|without|once|this|that|and|for|with|after|before|until|when|what|where|who|how|not|his|her|our|their|from|into|over|under|about|there|here|also|just|only|both|then|than|been|have|will|would|could|does|did|are|was|were|you|your|she|they|can|may|let|its|budget|legal|park|temporary|understood|should|nothing|something|anything|everything|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)$/i;

/** A capitalized token that is another speaker in this transcript. */
function citesSomeoneElse(text: string, personFirst: string, speakers: string[]): boolean {
  const known = new Set(
    speakers
      .flatMap((speaker) => speaker.split(/\s+/))
      .map((part) => part.toLowerCase())
      .filter((part) => part.length > 2)
  );
  const tokens = text.match(/\b[A-Z][a-z]{2,}\b/g) ?? [];
  return tokens.some((token) => {
    const lower = token.toLowerCase();
    return lower !== personFirst.toLowerCase() && known.has(lower) && !NOT_A_PERSON.test(token);
  });
}

/**
 * Strongest verbatim sentence that makes this person decisive.
 * The speaker is labelled by the caller when it is not the person.
 */
export function decisiveSentence(
  transcript: string,
  personName: string
): { text: string; speaker: string } | null {
  const turns = transcriptTurns(transcript);
  const name = namePattern(personName);
  const first = personName.trim().split(/\s+/)[0] ?? "";
  const speakers = turns.map((turn) => turn.speaker);
  if (!name || !first) return null;
  let best: { text: string; speaker: string; score: number } | null = null;
  for (let index = 0; index < turns.length; index += 1) {
    const spokenByPerson = turns[index].speaker.toLowerCase().includes(first.toLowerCase());
    const nearby = [turns[index - 1]?.body, turns[index].body, turns[index + 1]?.body].filter(Boolean).join(" ");
    if (!name.test(nearby) && !spokenByPerson) continue;
    for (const raw of turns[index].body.split(/(?<=[.!?])\s+/)) {
      const text = raw.trim();
      if (!text || text.includes("...") || !transcript.includes(text)) continue;
      // A sentence that names a different person is their evidence, not this person's.
      if (!name.test(text) && citesSomeoneElse(text, first, speakers)) continue;
      let score = 0;
      if (/not moving|won't move|will not move/i.test(text)) score += 100;
      if (/without (him|her|them)/i.test(text)) score += 80;
      if (/signs off|sign-off|sign off/i.test(text)) score += 40;
      if (/nothing'?s approved|hasn'?t validated|has not validated/i.test(text)) score += 30;
      if (name.test(text) && /\b(missed|absent|flagged|not on (?:this |the )?call|wasn'?t on the call)\b/i.test(text)) {
        score += 40;
      }
      if (
        spokenByPerson &&
        /\b(requires|corporate policy|enclave|general freeze|review queue|pre-vetted package|off-cycle)\b/i.test(text)
      ) {
        score += 45;
      }
      if (name.test(text)) score += 10;
      // A bare name mention, such as a greeting, does not make the person decisive.
      if (score < 30) continue;
      if (!best || score > best.score) best = { text, speaker: turns[index].speaker, score };
    }
  }
  return best ? { text: best.text, speaker: best.speaker } : null;
}

/** True when the turn speaker is this person, including a full name against a first name. */
export function spokenBy(speaker: string, personName: string): boolean {
  const left = speaker.trim().toLowerCase();
  const right = personName.trim().toLowerCase();
  if (!left || !right) return false;
  if (left === right || left.includes(right)) return true;
  const first = right.split(/\s+/)[0] ?? "";
  return first.length > 2 && left.includes(first);
}

export function verbatimQuote(transcript: string, sentence: string): string {
  const cleaned = sentence
    .replace(/\s+/g, " ")
    .replace(/^(?:\[\d{2}:\d{2}:\d{2}\]\s*)+/, "")
    .replace(/^(?:[A-Za-z]{1,12}:\s+)+/, "")
    .trim();
  if (!cleaned || cleaned.includes("...")) return "";
  if (transcript.includes(cleaned)) return cleaned;
  const lines = transcript.split(/\r?\n/).map((line) =>
    line
      .replace(/^\[[^\]]+\]\s*[A-Za-z]{1,12}:\s*/, "")
      .replace(/^[A-Za-z][A-Za-z .'-]{0,40}:\s*/, "")
      .trim()
  );
  const hits = lines.filter((line) => {
    const bare = line.replace(/[.!?]+$/, "");
    return line.length >= 12 && transcript.includes(line) && (cleaned.includes(line) || cleaned.includes(bare));
  });
  const complete = hits.filter((line) => /[.!?]$/.test(line));
  const pool = complete.length ? complete : hits;
  pool.sort((left, right) => right.length - left.length);
  return pool[0] ?? "";
}
