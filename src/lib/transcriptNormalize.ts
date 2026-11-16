/**
 * Turn raw call text into speaker lines before role detection or evidence picking.
 * Dialogue words are left intact so a quote can still be found in the original text.
 */

const SELLER_TITLE =
  /\b(account executive|enterprise ae|account manager|solutions engineer|vp of sales|sales representative|sales rep|account rep|business development representative|\bae\b|\bam\b|\bsdr\b|\bbdr\b|\bsales\b|representative)\b/i;

const VENDOR_LEAD =
  /\b(our platform|we are soc|soc 2|i(?:'ll| will) have the|in your inbox|our (?:deployment|security packet|enclave|dpa)|canadian data residency)\b/i;

const BUYER_CONSTRAINT =
  /\b(our (?:policy|cfo|legal counsel|finance|compliance framework)|finance has put|corporate policy|review queue|discretionary operational)\b/i;

export interface NormalizedTurn {
  speaker: string;
  body: string;
}

export function normalizeTranscript(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return "";
  try {
    return raw
      .replace(/\r/g, "")
      .split("\n")
      .map((line) => normalizeLine(line))
      .join("\n");
  } catch {
    return raw;
  }
}

/** [M:SS] and [MM:SS] become [00:MM:SS]. A clock that is already [HH:MM:SS] is left alone. */
export function normalizeTimestampToken(token: string): string {
  const short = token.match(/^\[(\d{1,2}):(\d{2})\]$/);
  if (!short) return token;
  return `[00:${short[1].padStart(2, "0")}:${short[2]}]`;
}

function normalizeLine(line: string): string {
  let text = line.replace(/\*\*/g, "");
  text = text.replace(/\[(\d{1,2}):(\d{2})\]/g, (token) => normalizeTimestampToken(token));
  const titled = text.match(
    /^(\s*(?:\[[^\]]+\]\s*)?)([A-Z][A-Za-z.'’-]{1,40}(?:\s+[A-Z][A-Za-z.'’-]{1,40}){0,3})\s*[–—-]\s*([^:\n]{2,80}):\s*(.*)$/
  );
  if (titled && SELLER_TITLE.test(titled[3])) {
    return `${titled[1]}${titled[2].trim()}: ${titled[4]}`;
  }
  const paren = text.match(
    /^(\s*(?:\[[^\]]+\]\s*)?)([A-Z][A-Za-z.'’-]{1,40}(?:\s+[A-Z][A-Za-z.'’-]{1,40}){0,3})\s*\(([^)\n]{2,80})\):\s*(.*)$/
  );
  if (paren) return `${paren[1]}${paren[2].trim()}: ${paren[4]}`;
  return text;
}

function remember(sellers: Set<string>, name: string): void {
  const full = name.replace(/\*+/g, "").replace(/\s+/g, " ").trim();
  if (!full) return;
  sellers.add(full.toLowerCase());
  const first = full.split(/\s+/)[0] ?? "";
  if (first) sellers.add(first.toLowerCase());
}

/** Names whose role slot says they are selling. Scans the raw header, not the dialogue. */
export function sellerNames(transcript: unknown): Set<string> {
  const sellers = new Set<string>();
  if (typeof transcript !== "string" || !transcript.trim()) return sellers;
  const blob = transcript.replace(/\r/g, "").replace(/\*\*/g, "");
  for (const match of blob.matchAll(
    /\(([A-Za-z]{1,5})\)\s*[–—-][^()\n]{0,160}?\b(account executive|enterprise ae|account manager|solutions engineer|vp of sales|sales rep(?:resentative)?|account rep|\bae\b|\bsdr\b|\bbdr\b)\b/gi
  )) {
    sellers.add(match[1].toLowerCase());
  }
  for (const match of blob.matchAll(
    /([A-Z][A-Za-z.'’-]{1,40}(?:\s+[A-Z][A-Za-z.'’-]{1,40}){0,3})\s*(?:\(([^)\n]{2,80})\)|[–—-]\s*([^:\n]{2,80}))/g
  )) {
    const role = `${match[2] ?? ""} ${match[3] ?? ""}`;
    if (!SELLER_TITLE.test(role)) continue;
    remember(sellers, match[1]);
  }
  return sellers;
}

/**
 * When no title matched, one speaker presenting the vendor's product and another
 * stating the buyer's constraint is the vendor lead. Two unlabeled names are not enough.
 */
export function inferVendorLead(turns: { speaker: string; body: string }[]): string | null {
  if (turns.length < 4) return null;
  const bySpeaker = new Map<string, string>();
  for (const turn of turns) {
    const name = turn.speaker.trim();
    if (!name || /^(me|them|speaker|unknown)$/i.test(name)) continue;
    bySpeaker.set(name, `${bySpeaker.get(name) ?? ""} ${turn.body}`);
  }
  if (bySpeaker.size < 2) return null;
  let vendor: string | null = null;
  for (const [name, body] of bySpeaker) {
    if (VENDOR_LEAD.test(body)) vendor = vendor ?? name;
  }
  if (!vendor) return null;
  for (const [name, body] of bySpeaker) {
    if (name !== vendor && BUYER_CONSTRAINT.test(body)) return vendor;
  }
  return null;
}

/** Speaker turns after normalization. Continuation lines stay with the current speaker. */
export function splitSpeakerTurns(transcript: unknown): NormalizedTurn[] {
  const text = normalizeTranscript(transcript);
  if (!text) return [];
  const turns: NormalizedTurn[] = [];
  let current: NormalizedTurn | null = null;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\*+/g, "");
    if (!line.trim()) continue;
    if (/^(?:transcript|date|speakers|participants|call date|scenario|context|overview)\s*:/i.test(line.trim())) {
      continue;
    }
    const match = line.match(
      /^\s*(?:\[(\d{2}:\d{2}:\d{2})\]\s*)?([A-Za-z][A-Za-z0-9 .'/’()-]{0,60}?)\s*:\s*(.*)$/
    );
    if (!match) {
      if (current && line.trim()) current.body = `${current.body} ${line.trim()}`.trim();
      continue;
    }
    const speaker = match[2].trim();
    if (/^(?:from|to|subject|cc|bcc|stage|status|participants|context|overview)$/i.test(speaker)) continue;
    current = { speaker, body: (match[3] ?? "").trim() };
    turns.push(current);
  }
  return turns.filter((turn) => turn.body.trim());
}
