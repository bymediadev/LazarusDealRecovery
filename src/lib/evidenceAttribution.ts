export type EvidenceBasis = "firsthand" | "secondhand" | "unattributed";

export interface QuoteAttribution {
  speaker: string | null;
  subject: string;
  basis: EvidenceBasis;
}

export interface PeopleMapQuote {
  text: string;
  note: string;
}

export interface PeopleMapRow {
  name: string;
  role: string;
  authority: string;
  persona: string;
  quotes: PeopleMapQuote[];
  secondhandNote: string | null;
}

interface StakeholderInput {
  name: string;
  role?: string;
  authority_level?: string;
  persona_type?: string;
  stance?: string;
  evidence?: string;
  evidence_speaker?: string;
  evidence_basis?: EvidenceBasis;
}

interface Speaker {
  name: string;
  alias: string;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function namesMatch(left: string, right: string): boolean {
  const tokens = (value: string) =>
    normalize(value)
      .split(" ")
      .filter((token) => token.length > 2);
  const other = new Set(tokens(right));
  return tokens(left).some((token) => other.has(token));
}

export function samePerson(left: string, right: string): boolean {
  return namesMatch(left, right);
}

function parseSpeakers(transcript: string): Speaker[] {
  const block = transcript.match(/SPEAKERS:\s*([\s\S]*?)(?:\n\s*\n|\n\[)/i);
  if (!block) return [];
  const speakers: Speaker[] = [];
  for (const line of block[1].split("\n")) {
    const match = line.match(/^(.+?)\(([A-Za-z]{1,8})\)/);
    if (!match) continue;
    speakers.push({ name: match[1].trim(), alias: match[2].trim() });
  }
  return speakers;
}

function utterances(transcript: string): { alias: string; body: string }[] {
  const turns: { alias: string; body: string }[] = [];
  let current: { alias: string; body: string } | null = null;
  for (const line of transcript.split(/\r?\n/)) {
    const match = line.match(/^\[(\d{2}:\d{2}:\d{2})\]\s*([A-Za-z]{1,8}):\s*(.*)$/);
    if (match) {
      if (current) turns.push(current);
      current = { alias: match[2], body: match[3].trim() };
      continue;
    }
    if (current && line.trim()) current.body += ` ${line.trim()}`;
  }
  if (current) turns.push(current);
  return turns;
}

const CAPACITY_STATEMENT =
  /\b(can'?t commit|cannot commit|no capacity|lacks capacity|another integration)\b/i;

export interface DialogueTurn {
  speaker: string;
  text: string;
}

export interface StatementAttribution {
  evidence_id: string;
  source_span: string;
  speaker_id: string | null;
  subject_id: string | null;
  force_id: string;
  force_type: string;
  attribution_confidence: "high" | "unknown";
}

/** Bold dialogue labels (`**Sarah:**`) are the speaker. A named person in the sentence is not. */
export function dialogueTurns(transcript: string): DialogueTurn[] {
  const turns: DialogueTurn[] = [];
  const pattern = /\*\*([^*\n]{1,60}):\*\*\s*([\s\S]*?)(?=\*\*[^*\n]{1,60}:\*\*|$)/g;
  for (const match of transcript.matchAll(pattern)) {
    const speaker = match[1].replace(/\s+/g, " ").trim();
    const text = match[2].replace(/\s+/g, " ").trim();
    if (speaker && text) turns.push({ speaker, text });
  }
  return turns;
}

function properNames(text: string): string[] {
  const skip = new Set([
    "she",
    "her",
    "his",
    "him",
    "they",
    "the",
    "and",
    "but",
    "yes",
    "not",
    "our",
    "that",
    "this",
    "with",
    "from",
    "have",
    "been",
  ]);
  const found: string[] = [];
  for (const match of text.matchAll(/\b([A-Z][a-z]{2,})\b/g)) {
    const name = match[1];
    if (skip.has(name.toLowerCase())) continue;
    if (!found.some((existing) => namesMatch(existing, name))) found.push(name);
  }
  return found;
}

/**
 * The person the capacity statement is about.
 * The speaker, and a name that merely appears in an earlier turn, are not the subject.
 */
export function capacitySubject(transcript: string): string | null {
  const turns = dialogueTurns(transcript);
  if (turns.length) {
    for (let index = 0; index < turns.length; index += 1) {
      const turn = turns[index];
      if (!CAPACITY_STATEMENT.test(turn.text)) continue;
      if (/\bI (?:can'?t|cannot) commit\b/i.test(turn.text)) return turn.speaker;
      const named = properNames(turn.text).filter((name) => !namesMatch(name, turn.speaker));
      if (named.length === 1) return named[0];
      if (index > 0 && /\b(she|he|her|his|they|team)\b/i.test(turn.text)) {
        const prior = properNames(turns[index - 1].text).filter(
          (name) => !namesMatch(name, turns[index - 1].speaker)
        );
        if (prior.length === 1) return prior[0];
      }
      return null;
    }
    return null;
  }

  const sentences = transcript.split(/(?<=[.!?])\s+/);
  for (let index = 0; index < sentences.length; index += 1) {
    if (!CAPACITY_STATEMENT.test(sentences[index])) continue;
    const named = properNames(sentences[index]);
    if (named.length === 1) return named[0];
    if (index > 0 && /\b(she|he|her|his)\b/i.test(sentences[index])) {
      const prior = properNames(sentences[index - 1]);
      if (prior.length === 1) return prior[0];
    }
    return null;
  }
  return null;
}

/** Speaker comes from the dialogue turn that contains the quote. Unknown stays unknown. */
export function attributeStatement(
  transcript: string,
  factor: string,
  evidence: string,
  forceType: string,
  index: number
): StatementAttribution {
  const cleaned = evidence.replace(/\*\*[^*]+:\*\*/g, " ");
  const needle = normalize(cleaned).slice(0, 80);
  const turn = dialogueTurns(transcript).find((item) => needle.length >= 24 && normalize(item.text).includes(needle));
  const capacity = CAPACITY_STATEMENT.test(`${factor} ${evidence}`) ? capacitySubject(transcript) : null;
  return {
    evidence_id: `evidence-${index + 1}`,
    source_span: evidence,
    speaker_id: turn?.speaker ?? null,
    subject_id: capacity,
    force_id: `force-${index + 1}`,
    force_type: forceType,
    attribution_confidence: turn ? "high" : "unknown",
  };
}

/** The quote stays with the person who said it. A named subject is not the speaker. */
export function attributeQuote(transcript: string, stakeholderName: string, quote: string): QuoteAttribution {
  const speakers = parseSpeakers(transcript);
  const quoteText = normalize(quote);
  let best: { alias: string; score: number } | null = null;
  for (const turn of utterances(transcript)) {
    const body = normalize(turn.body);
    if (body.length < 12 || quoteText.length < 12) continue;
    let score = 0;
    if (quoteText.includes(body)) score = body.length;
    else if (body.includes(quoteText)) score = quoteText.length;
    else {
      const slice = quoteText.slice(0, 48);
      if (slice.length >= 24 && body.includes(slice)) score = slice.length;
    }
    if (score > (best?.score ?? 0)) best = { alias: turn.alias, score };
  }
  const known = speakers.find((speaker) => speaker.alias.toLowerCase() === best?.alias.toLowerCase());
  const speaker = known?.name ?? null;
  if (!speaker) {
    const needle = quoteText.slice(0, 80);
    const turn = dialogueTurns(transcript).find(
      (item) => needle.length >= 24 && normalize(item.text).includes(needle)
    );
    if (!turn) {
      return { speaker: null, subject: stakeholderName, basis: "unattributed" };
    }
    const firsthand = namesMatch(turn.speaker, stakeholderName);
    return {
      speaker: turn.speaker,
      subject: stakeholderName,
      basis: firsthand ? "firsthand" : "secondhand",
    };
  }
  const firsthand = namesMatch(speaker, stakeholderName);
  return {
    speaker,
    subject: stakeholderName,
    basis: firsthand ? "firsthand" : "secondhand",
  };
}

/** A transcript sentence about this person. Secondhand when someone else said it. */
export function quotedSentenceAbout(
  transcript: string,
  personName: string,
  hint = ""
): { text: string; speaker: string | null; basis: EvidenceBasis } | null {
  const first = personName.trim().split(/\s+/)[0] ?? "";
  if (first.length < 2) return null;
  const mention = new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  const hintNorm = normalize(hint);
  const speakers = parseSpeakers(transcript);
  let best: { text: string; speaker: string | null; score: number } | null = null;

  const consider = (speakerLabel: string, body: string) => {
    if (!mention.test(body)) return;
    const known = speakers.find((speaker) => speaker.alias.toLowerCase() === speakerLabel.toLowerCase());
    const speaker =
      known?.name ??
      (speakers.some((item) => namesMatch(item.name, speakerLabel)) ? speakerLabel : speakerLabel || null);
    const flat = normalize(body);
    let score = Math.min(body.length, 180);
    if (new RegExp(`^${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(body.trim())) score += 20000;
    if (hintNorm.length >= 24) {
      for (let index = 0; index + 24 <= hintNorm.length; index += 8) {
        if (flat.includes(hintNorm.slice(index, index + 24))) score += 500;
      }
    }
    if (!best || score > best.score) best = { text: body.replace(/\s+/g, " ").trim(), speaker, score };
  };

  for (const turn of utterances(transcript)) consider(turn.alias, turn.body);
  for (const turn of dialogueTurns(transcript)) consider(turn.speaker, turn.text);

  if (!best) return null;
  const firsthand = Boolean(best.speaker) && namesMatch(best.speaker, personName);
  return {
    text: best.text,
    speaker: best.speaker,
    basis: firsthand ? "firsthand" : "secondhand",
  };
}

const NOT_STATED = "not stated";

/**
 * People-map rows: each person only shows a quote that is their own firsthand stance.
 * Secondhand lines stay on the speaker with an "About X" note. Subjects without a
 * firsthand utterance get exactly `not stated` — never a borrowed sentence.
 */
export function peopleMapRows(stakeholders: StakeholderInput[]): PeopleMapRow[] {
  const rows: PeopleMapRow[] = stakeholders.map((person) => ({
    name: person.name,
    role: person.role ?? "",
    authority: person.authority_level ?? "",
    persona: person.persona_type || person.stance || "",
    quotes: [],
    secondhandNote: null,
  }));

  for (const person of stakeholders) {
    const quote = person.evidence?.replace(/^"|"$/g, "").trim();
    if (!quote || normalize(quote) === normalize(NOT_STATED)) continue;
    const basis = person.evidence_basis ?? "unattributed";
    const speaker = person.evidence_speaker?.trim() || null;
    const subject = rows.find((row) => row.name === person.name);
    if (!subject) continue;

    if (basis === "firsthand") {
      const note = speaker ? `Said by ${speaker}.` : "Firsthand statement.";
      const key = normalize(quote);
      if (!subject.quotes.some((item) => normalize(item.text) === key)) {
        subject.quotes.push({ text: quote, note });
      }
      continue;
    }

    if (basis === "secondhand" && speaker) {
      const speakerRow = rows.find((row) => namesMatch(row.name, speaker));
      const note = `About ${person.name}. Said by ${speaker}, not by ${person.name}.`;
      if (speakerRow) {
        const key = normalize(quote);
        if (!speakerRow.quotes.some((item) => normalize(item.text) === key)) {
          speakerRow.quotes.push({ text: quote, note });
        }
      }
      subject.secondhandNote = `No firsthand statement. ${speaker} spoke about ${person.name}.`;
      continue;
    }

    // Unattributed evidence cannot prove this person's own stance.
    subject.secondhandNote =
      subject.secondhandNote ??
      "No firsthand statement from this person was found in the transcript.";
  }

  for (const row of rows) {
    const hasFirsthand = row.quotes.some(
      (item) => !/about\s+/i.test(item.note) && normalize(item.text) !== normalize(NOT_STATED)
    );
    if (!hasFirsthand) {
      row.quotes = [{ text: NOT_STATED, note: row.secondhandNote ? "Stance quote not spoken by this person." : "" }];
    }
  }

  return rows;
}
