import { PostMortemResult, StakeholderSignal } from "../types";
import { findTechnicalVetoHolder, formatAuthorityLabel } from "./authorityRoles";
import { peopleMapRows } from "./evidenceAttribution";
import { diagnosticProfile, formatDiagnosticMarkdown, matrixFacing, recommendedMoveLine, unifiedDealHeadline } from "./reportMatrix";
import { formatMetricLegendMarkdown, metricRendersBesideRisk } from "./metricLegend";
import { recoveryActionLines, uniqueRecoveryNotes, formatRecoveryAction } from "./recoveryPlan";
import { decisiveSentence, spokenBy, speakerOfText, verbatimQuote } from "./reportCopy";

function bulletList(items: string[], empty = "—"): string {
  if (!items.length) return empty;
  return items.map((item) => `- ${item}`).join("\n");
}

function stakeholderLabel(s: StakeholderSignal): string {
  const persona = (s.persona_type ?? s.stance ?? "").trim();
  const role = s.role?.trim();
  const bits = [s.name.trim()];
  if (role) bits.push(`(${role})`);
  if (persona) bits.push(`— ${persona}`);
  return bits.join(" ");
}

function dealStatus(result: PostMortemResult): string {
  return String(result.deal_classification?.status ?? result.deal_status ?? "");
}

function facingFor(result: PostMortemResult) {
  return matrixFacing({
    status: dealStatus(result),
    trajectory: result.deal_trajectory?.trajectory_type,
    recoverabilityStatus: result.recoverability?.status,
    relevanceLabel: result.relevance?.label,
  });
}

type ActionIndex = Map<string, number>;

function registerAction(index: ActionIndex, action: string): { number: number; repeat: boolean } {
  const key = formatRecoveryAction(action)
    .action.toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const prior = index.get(key);
  if (prior) return { number: prior, repeat: true };
  const number = index.size + 1;
  index.set(key, number);
  return { number, repeat: false };
}

/**
 * Same boolean the snapshot prints as Authority gap.
 * The scored flag wins. Stakeholder labels are only a fallback when the scorer did not publish one.
 */
function authorityGapOpen(result: PostMortemResult): boolean {
  const flag = result.proprietary_indices?.authority_gap_flag;
  if (typeof flag === "boolean") return flag;
  const nested = result.proprietary_indices?.stakeholder_dispersion?.authority_gap;
  if (typeof nested === "boolean") return nested;
  const people = result.stakeholders ?? [];
  let absent = 0;
  let suppressed = 0;
  let aligned = 0;
  for (const person of people) {
    const label = `${person.persona_type ?? ""} ${person.stance ?? ""}`.toLowerCase();
    if (/absent decision maker/.test(label)) absent += 1;
    if (/suppressed champion/.test(label)) suppressed += 1;
    if (/aligned champion/.test(label)) aligned += 1;
  }
  return absent > 0 || (suppressed > 0 && aligned === 0);
}

function personWithRole(person: { name: string; role?: string }): string {
  const name = person.name.trim();
  const role = person.role?.trim();
  return role ? `${name}, ${role}` : name;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name.trim();
}

function namedApprover(result: PostMortemResult): { name: string; role?: string } | null {
  const stakeholders = result.stakeholders ?? [];
  const technical = findTechnicalVetoHolder(stakeholders);
  if (technical) {
    return stakeholders.find((person) => person.name.trim().toLowerCase() === technical.name.trim().toLowerCase()) ?? technical;
  }
  return (
    stakeholders.find((person) =>
      /absent decision maker/i.test(`${person.persona_type ?? ""} ${person.stance ?? ""}`)
    ) ?? null
  );
}

function championOf(result: PostMortemResult): StakeholderSignal | undefined {
  const stakeholders = result.stakeholders ?? [];
  return (
    stakeholders.find((person) => /suppressed champion/i.test(`${person.persona_type ?? ""} ${person.stance ?? ""}`)) ??
    stakeholders.find((person) => /aligned champion/i.test(`${person.persona_type ?? ""} ${person.stance ?? ""}`))
  );
}

function sentenceMentions(transcript: string, name: string, pattern: RegExp): boolean {
  const first = firstName(name);
  if (first.length < 2) return false;
  const who = new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  return transcript
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .some((sentence) => who.test(sentence) && pattern.test(sentence));
}

function absencePhrase(transcript: string, name: string): string {
  if (sentenceMentions(transcript, name, /missed the (?:technical )?demo/i)) return "missed the demo";
  if (sentenceMentions(transcript, name, /missed (?:today'?s |the )?session/i)) return "missed the session";
  if (sentenceMentions(transcript, name, /wasn'?t on the call|not on (?:this |the )?call/i)) return "was not on the call";
  return "";
}

function willNotMoveClause(result: PostMortemResult, approverName: string): string {
  const champion = championOf(result);
  const transcript = result.source_transcript ?? "";
  if (!champion || !transcript.trim()) return "";
  const decisive = decisiveSentence(transcript, approverName);
  if (!decisive || !spokenBy(decisive.speaker, champion.name)) return "";
  if (!/not moving|will not move|won'?t move/i.test(decisive.text)) return "";
  const pronoun = decisive.text.match(/without (him|her|them)/i)?.[1].toLowerCase() ?? "them";
  return `${firstName(champion.name)} will not move without ${pronoun}`;
}

function qualificationProfile(result: PostMortemResult) {
  if (result.diagnostic_profile) return result.diagnostic_profile;
  const transcript = result.source_transcript ?? "";
  return transcript.trim() ? diagnosticProfile(transcript) : null;
}

/** One manager sentence for the top of the note. Scores stay in the snapshot. */
export function situationSentence(result: PostMortemResult): string {
  if (facingFor(result).offForecast) return "";
  const approver = namedApprover(result);
  if (!approver?.name?.trim()) return "";
  const absence = absencePhrase(result.source_transcript ?? "", approver.name);
  const because = absence ? `${personWithRole(approver)}, ${absence}` : `${personWithRole(approver)} has to sign off`;
  const move = willNotMoveClause(result, approver.name);
  let sentence = `The deal is stalled because ${because}${move ? `, and ${move}` : ""}.`;
  const profile = qualificationProfile(result);
  if (profile?.budget && /budget was qualified/i.test(profile.budget)) sentence += " Budget is real.";
  if (profile?.urgency && /^No urgency stated\.?$/i.test(profile.urgency.trim())) sentence += " There is no date.";
  return sentence;
}

function actionBlob(result: PostMortemResult): string {
  return [
    ...(result.immediate_remediation ?? []),
    ...(result.rescue_triage_plan?.immediate_0_30_days ?? []),
    ...(result.rescue_triage_plan?.near_term_30_90_days ?? []),
    ...(result.rescue_triage_plan?.long_term_90_plus_days ?? []),
  ].join("\n");
}

/** A later meeting or quarter is not the same deadline as a preparation step. */
function isStatedLaterCheckpoint(action: string): boolean {
  return /\b(after month-end|until q[1-4]|parked until|next quarter)\b/i.test(action);
}

function isApproverMeeting(action: string): boolean {
  return isStatedLaterCheckpoint(action) && /\b(meeting|slots|reschedul)/i.test(action);
}

function isPrepStep(action: string): boolean {
  return /\b(one-pager|one pager|send)\b/i.test(action);
}

function listedActions(result: PostMortemResult): string[] {
  return [
    ...(result.immediate_remediation ?? []),
    ...(result.rescue_triage_plan?.immediate_0_30_days ?? []),
    ...(result.rescue_triage_plan?.near_term_30_90_days ?? []),
    ...(result.rescue_triage_plan?.long_term_90_plus_days ?? []),
    result.crm_intelligence?.recommended_next_action ?? "",
  ].filter((action) => action.trim());
}

function annotatePrep(note: string, approver: string): string {
  const clause = `the step that gets ${approver} to the meeting`;
  if (note.toLowerCase().includes(clause)) return note;
  const lines = note.split("\n");
  lines[0] = `${lines[0]} — ${clause}`;
  return lines.join("\n");
}

function nextActionDate(result: PostMortemResult): string {
  if (facingFor(result).offForecast) {
    return facingFor(result).category === "unresolved"
      ? "No forecast date — speakers are not established"
      : "No forecast date — send what was already promised";
  }
  const text = actionBlob(result);
  const dateMatch = text.match(/\b(20\d{2}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/);
  if (dateMatch) return dateMatch[1];
  const prep = /\bthis week\b/i.test(text);
  const later = isStatedLaterCheckpoint(text);
  if (prep && later) {
    return "Preparation this week. The meeting checkpoint stays as stated (after month-end or the named quarter). No single deadline was invented.";
  }
  if (later) return "Checkpoint is the quarter or month-end stated in the evidence. No calendar date was invented.";
  if (!text.trim()) return "Within 7 days";
  return "Within 7–30 days";
}

function peopleMapEvidenceLine(
  person: StakeholderSignal,
  rows: ReturnType<typeof peopleMapRows>,
  transcript: string
): string {
  const row = rows.find((item) => item.name === person.name);
  const firsthand = row?.quotes.find(
    (quote) => quote.text.trim() && !/^not stated$/i.test(quote.text) && !/^about\s+/i.test(quote.note)
  );
  if (firsthand) {
    const quote = verbatimQuote(transcript, firsthand.text);
    if (quote) return `  Evidence: "${quote}"`;
  }
  const decisive = decisiveSentence(transcript, person.name);
  const quote = verbatimQuote(transcript, decisive?.text ?? "");
  if (quote && decisive && !spokenBy(decisive.speaker, person.name)) {
    const speaker = firstName(decisive.speaker);
    const who = firstName(person.name);
    if (/not moving|will not move|won'?t move|without (?:him|her|them)/i.test(quote)) {
      return `  ${speaker} will not move until ${who} signs off.`;
    }
    return `  ${speaker} named ${who} as the approval dependency.`;
  }
  if (quote && decisive) return `  Evidence: "${quote}"`;
  return "  No firsthand statement.";
}

function peopleByRole(result: PostMortemResult): string {
  const stakeholders = result.stakeholders ?? [];
  if (!stakeholders.length) {
    return "- No stakeholders mapped — re-run with a fuller transcript.";
  }

  const rows = peopleMapRows(stakeholders);
  const technical = findTechnicalVetoHolder(stakeholders);
  const groups: { label: string; match: RegExp }[] = [
    {
      label:
        facingFor(result).offForecast
          ? "Business owner (apparent decision-maker)"
          : "Economic owner (authority on the call)",
      match: /economic owner/i,
    },
    { label: "Aligned champion (push internally)", match: /aligned champion/i },
    { label: "Suppressed champion (intent, no authority)", match: /suppressed champion/i },
    { label: "Hidden detractor / veto risk", match: /hidden detractor/i },
    { label: "Unmet condition", match: /unmet condition/i },
    { label: "Resource constraint", match: /resource constraint/i },
    { label: "Inactive sponsor", match: /inactive sponsor/i },
    { label: "Competitive preference", match: /competitive preference/i },
    { label: "Absent decision maker", match: /absent decision maker/i },
  ];

  const lines: string[] = [];
  const used = new Set<string>();

  if (technical) {
    const full =
      stakeholders.find((person) => person.name === technical.name) ??
      ({
        name: technical.name,
        role: technical.role ?? "",
        persona_type: technical.persona_type ?? "Absent Decision Maker",
        stance: technical.stance ?? "",
        evidence: technical.evidence ?? "",
      } as StakeholderSignal);
    used.add(`${full.name}|${full.role}`);
    lines.push("**Technical approval dependency:**");
    lines.push(`- ${formatAuthorityLabel(full)}`);
    lines.push(peopleMapEvidenceLine(full, rows, result.source_transcript ?? ""));
    lines.push("");
  }

  for (const g of groups) {
    const people = stakeholders.filter(
      (s) => g.match.test(s.persona_type ?? s.stance ?? "") && !used.has(`${s.name}|${s.role}`)
    );
    if (!people.length) continue;
    lines.push(`**${g.label}:**`);
    for (const p of people) {
      used.add(`${p.name}|${p.role}`);
      lines.push(`- ${stakeholderLabel(p)}`);
      lines.push(peopleMapEvidenceLine(p, rows, result.source_transcript ?? ""));
    }
    lines.push("");
  }

  const others = stakeholders.filter((s) => !used.has(`${s.name}|${s.role}`));
  if (others.length) {
    lines.push("**Other stakeholders:**");
    for (const p of others) {
      lines.push(`- ${stakeholderLabel(p)}`);
      lines.push(peopleMapEvidenceLine(p, rows, result.source_transcript ?? ""));
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function whoDoesWhat(result: PostMortemResult): string {
  const lines: string[] = [];
  const stakeholders = result.stakeholders ?? [];
  const champion = stakeholders.find((s) =>
    /aligned champion|suppressed champion/i.test(s.persona_type ?? s.stance ?? "")
  );
  const detractor = stakeholders.find((s) =>
    /hidden detractor/i.test(s.persona_type ?? s.stance ?? "")
  );
  const absent =
    findTechnicalVetoHolder(stakeholders) ??
    stakeholders.find((s) => /absent decision maker/i.test(s.persona_type ?? s.stance ?? ""));
  const crmNext = result.crm_intelligence?.recommended_next_action?.trim();
  const notADeal = facingFor(result).offForecast;
  const immediate = result.immediate_remediation ?? [];
  const promised = immediate.length ? immediate : (result.rescue_triage_plan?.immediate_0_30_days ?? []);

  if (notADeal) {
    lines.push(
      "- **Sales manager / AE (our side):** Keep this off the forecast. Do only the steps already promised, and do not open a recovery cadence."
    );
  } else {
    lines.push("- **Sales manager / AE (our side):** Own the next action date, clear the core blocker, and update forecast with recoverable vs flat-no judgment.");
  }
  const owner = stakeholders.find((s) => /economic owner/i.test(s.persona_type ?? s.stance ?? ""));
  if (owner) {
    lines.push(
      notADeal
        ? `- **${owner.name}${owner.role ? ` (${owner.role})` : ""}:** Business owner and apparent decision-maker. No purchase process was established.`
        : `- **${owner.name}${owner.role ? ` (${owner.role})` : ""}:** Owner and authority. There is no one above them, and no internal step for them to run.`
    );
  }
  if (champion && !owner) {
    lines.push(
      `- **${champion.name}${champion.role ? ` (${champion.role})` : ""}:** Internal champion — arm them with the evidence and next step they can run inside their org.`
    );
  }
  if (detractor) {
    lines.push(
      `- **${detractor.name}${detractor.role ? ` (${detractor.role})` : ""}:** Likely veto / friction source — do not ignore; surface their concern directly.`
    );
  }
  if (absent) {
    const tech = findTechnicalVetoHolder(stakeholders);
    const isTech = Boolean(tech && tech.name.trim().toLowerCase() === absent.name.trim().toLowerCase());
    lines.push(
      isTech
        ? `- **${absent.name}${absent.role ? ` (${absent.role})` : ""}:** Technical approval dependency — do not treat the close date as real until they sign off.`
        : `- **${absent.name}${absent.role ? ` (${absent.role})` : ""}:** Missing decision-maker — get them in the room or on the thread before treating close date as real.`
    );
  }
  const meeting = listedActions(result).find((action) => isApproverMeeting(action)) ?? "";
  if (notADeal) {
    lines.push(`- **Recommended next move:** ${recommendedMoveLine(promised)}`);
  } else if (meeting) {
    const action = formatRecoveryAction(meeting).action.replace(/\.$/, "").trim();
    if (action) lines.push(`- **Recommended next move:** ${action}.`);
  } else if (crmNext && !isPrepStep(crmNext)) {
    const action = formatRecoveryAction(crmNext).action.replace(/\.$/, "").trim();
    if (action) lines.push(`- **Recommended next move:** ${action}.`);
  }

  return lines.join("\n");
}

const REPORT_ACTION_FIELD =
  /^(Owner|Stakeholder|Target outcome|Evidence that would show progress|Required, not yet observed|Checkpoint|Source timing):\s*(.+)$/i;

/** Report rendering of a recovery step. Status is an inline tag. Fields are nested bullets. */
function formatReportAction(note: string): string {
  const lines = recoveryActionLines(note);
  if (!lines.length) return note.trim();
  let head = lines[0];
  const meta: string[] = [];
  for (const line of lines.slice(1)) {
    if (/^(Activity|Outcome|Activity and outcome)$/.test(line)) continue;
    const status = line.match(/^Current status:\s*(.+)$/i);
    if (status) {
      if (!head.endsWith(`]`) || !head.includes(`[${status[1]}]`)) head = `${head} [${status[1]}]`;
      continue;
    }
    const field = line.match(REPORT_ACTION_FIELD);
    if (field) {
      meta.push(`- **${field[1]}:** ${field[2]}`);
      continue;
    }
    meta.push(line);
  }
  return [head, ...meta].join("\n");
}

function actionKeyOf(action: string): string {
  return formatRecoveryAction(action)
    .action.toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function whatToDo(result: PostMortemResult, actions: ActionIndex): string {
  const notADeal = facingFor(result).offForecast;
  const immediate = result.immediate_remediation ?? [];
  const plan = result.rescue_triage_plan ?? {
    immediate_0_30_days: [],
    near_term_30_90_days: [],
    long_term_90_plus_days: [],
  };

  const day0 = (immediate.length ? immediate : plan.immediate_0_30_days.slice(0, 2)).filter(
    (action) => !isStatedLaterCheckpoint(action)
  );
  const day30 = plan.immediate_0_30_days.filter((action) => !isStatedLaterCheckpoint(action));
  const laterCheckpoint = [...immediate, ...plan.immediate_0_30_days, ...plan.near_term_30_90_days, ...plan.long_term_90_plus_days].filter(
    isStatedLaterCheckpoint
  );
  const mid = Math.ceil(plan.near_term_30_90_days.length / 2);
  const day60 = plan.near_term_30_90_days.slice(0, mid);
  const day90 = [
    ...plan.near_term_30_90_days.slice(mid),
    ...plan.long_term_90_plus_days,
  ];

  const sections: string[] = [];
  const section = (title: string, items: string[], empty?: string, annotate = false) => {
    const notes = uniqueRecoveryNotes(items).map((note) => {
      const slot = registerAction(actions, note);
      if (slot.repeat) return `See ${slot.number}.`;
      const formatted = formatReportAction(note).replace(/\n/g, "\n   ");
      const body = annotate && isPrepStep(note) ? annotatePrep(formatted, firstName(namedApprover(result)?.name ?? "them")) : formatted;
      return `${slot.number}. ${body}`;
    });
    const placeholder = !notes.length && empty ? [empty] : notes;
    if (!placeholder.length || placeholder.every((note) => /^See \d+\.$/.test(note.trim()))) return;
    if (sections.length) sections.push("");
    sections.push(`**${title}:**`);
    sections.push(placeholder.join("\n"));
  };

  if (notADeal) {
    const promised = uniqueRecoveryNotes(day0.length ? day0 : day30);
    return promised.length
      ? promised.map((note, i) => `${i + 1}. ${formatReportAction(note).replace(/\n/g, "\n   ")}`).join("\n")
      : "No purchase step was promised.";
  }
  const crmNext = result.crm_intelligence?.recommended_next_action?.trim() ?? "";
  const weekItems = day0.length ? [...day0] : day30.slice(0, 2);
  const covered = Boolean(
    crmNext &&
      [weekItems, day30, laterCheckpoint, day60, day90].some((pool) =>
        pool.some((item) => actionKeyOf(item) === actionKeyOf(crmNext))
      )
  );
  if (crmNext && !covered) {
    if (isStatedLaterCheckpoint(crmNext)) laterCheckpoint.unshift(crmNext);
    else weekItems.unshift(crmNext);
  }
  const meetingItems = laterCheckpoint.filter((action) => isApproverMeeting(action));
  const prepItems = [...weekItems, ...day30].filter((action) => isPrepStep(action));
  const rankMeetingFirst = meetingItems.length > 0 && prepItems.length > 0;
  if (rankMeetingFirst) section("Stated checkpoint", meetingItems);
  section(
    "This week (0–7 days)",
    weekItems,
    laterCheckpoint.length ? undefined : "Set a dated next step with the champion.",
    rankMeetingFirst
  );
  if (!notADeal && day30.length) section("30 days", day30);
  const remainingCheckpoint = rankMeetingFirst
    ? laterCheckpoint.filter((action) => !isApproverMeeting(action))
    : laterCheckpoint;
  if (!notADeal && remainingCheckpoint.length) section("Stated checkpoint", remainingCheckpoint);
  if (!notADeal && day60.length) section("60 days", day60);
  if (!notADeal && day90.length) section("90 days", day90);
  return sections.join("\n");
}

function frictionExtras(result: PostMortemResult): string[] {
  const items: string[] = [];
  const f = result.friction_deltas;
  const transcript = result.source_transcript ?? "";
  if (!f) return items;
  const quoted = (label: string, evidence: string) => {
    const quote = verbatimQuote(transcript, evidence);
    if (!quote) return;
    items.push(`${label} — "${quote}"`);
  };
  if (f.administrative_gatekeeping.detected) {
    quoted("Administrative gatekeeping", f.administrative_gatekeeping.evidence);
  }
  if (f.stakeholder_dispersion.detected) {
    quoted("Stakeholder dispersion", f.stakeholder_dispersion.evidence);
  }
  if (f.budget_scoping_gap.detected) {
    quoted("Budget scoping gap", f.budget_scoping_gap.evidence);
  }
  return items;
}

function historicalExtras(result: PostMortemResult): string[] {
  const transcript = result.source_transcript ?? "";
  return (result.historical_context_match ?? []).slice(0, 4).flatMap((m) => {
    const quote = verbatimQuote(transcript, m.live_dialogue_evidence ?? "");
    if (!quote) return [];
    const prior = m.historical_event ? ` Prior: ${m.historical_event}` : "";
    return [`${m.reference_date} · ${m.conflict_type} — "${quote}"${prior}`];
  });
}

function metricsBlock(result: PostMortemResult): string {
  const facing = facingFor(result);
  if (facing.offForecast) {
    return `- **Category:** ${facing.categoryLabel}. Stall metrics are not applied.`;
  }
  const pi = result.proprietary_indices;
  const triage = result.live_deal_triage;
  const vs = result.viability_state;
  const lines: string[] = [];

  const elevated = pi?.risk_tier === "HIGH" || pi?.risk_tier === "CRITICAL" || (pi?.deal_risk_index ?? 0) > 70;
  const pushScore = (label: string, value: number | undefined) => {
    if (!metricRendersBesideRisk(value, pi?.risk_tier, pi?.deal_risk_index)) return;
    lines.push(`- **${label}:** ${value}/100`);
  };
  if (pi) {
    if (!(elevated && pi.deal_risk_index === 0)) {
      lines.push(`- **Deal Risk Score:** ${pi.deal_risk_index}/100 (${pi.risk_tier})`);
    }
    pushScore("Department Friction (DFI)", pi.multi_department_friction);
    pushScore("Dispersion", pi.stakeholder_dispersion_index);
    pushScore("Stall signals", pi.dialogue_stall_score);
    if (authorityGapOpen(result)) lines.push("- **Authority gap:** Yes");
  } else if (triage && triage.department_friction_index > 0) {
    lines.push(`- **Department friction index:** ${triage.department_friction_index}/100`);
  }
  if (vs && !facing.offForecast && metricRendersBesideRisk(vs.viability_score, pi?.risk_tier, pi?.deal_risk_index)) {
    lines.push(`- **Viability score:** ${vs.viability_score}/100`);
  }
  const reading = snapshotReading(result);
  if (reading) {
    lines.push("");
    lines.push(reading);
  }
  return lines.length ? lines.join("\n") : "- Metrics not available for this run.";
}

function snapshotReading(result: PostMortemResult): string {
  if (facingFor(result).offForecast) return "";
  const parts: string[] = [];
  const tier = result.proprietary_indices?.risk_tier;
  if ((tier === "HIGH" || tier === "CRITICAL") && authorityGapOpen(result)) {
    const word = tier === "CRITICAL" ? "critical" : "high";
    parts.push(`Risk is ${word} because the deal is sitting on an absent approver.`);
  }
  const profile = qualificationProfile(result);
  const restart = profile?.restart ?? "";
  const named = restart.match(/\bIf ([A-Z][A-Za-z'-]+) buys in\b/);
  const buyer = firstName(speakerOfText(result.source_transcript ?? "", "buys in"));
  const approver = named?.[1] ?? "";
  if (/buys in/i.test(restart) && buyer.length > 2 && approver) {
    parts.push(`Viability stays open because ${buyer} will restart if ${approver} buys in.`);
  }
  return parts.join(" ");
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  while (from < haystack.length) {
    const idx = haystack.indexOf(needle, from);
    if (idx < 0) break;
    count += 1;
    from = idx + needle.length;
  }
  return count;
}

function insideQuotes(text: string, index: number): boolean {
  const marks = text.slice(0, index).match(/"/g);
  return (marks?.length ?? 0) % 2 === 1;
}

function lastBare(region: string, quote: string): number {
  let from = region.length;
  while (from > 0) {
    const idx = region.lastIndexOf(quote, from - 1);
    if (idx < 0) return -1;
    if (!insideQuotes(region, idx)) return idx;
    from = idx;
  }
  return -1;
}

function joinWithoutQuote(before: string, after: string): string {
  const left = before.replace(/[ \t]+$/g, "");
  const right = after.replace(/^[ \t]+/g, "");
  if (!left) return right;
  if (!right) return left;
  const gap = /[\w.!?)]$/.test(left) && /^[\w("]/.test(right) ? " " : "";
  return left + gap + right;
}

/** Remove one copy of a quote, preferring the later copy in this region. */
function dropLastQuote(region: string, quote: string): { text: string; dropped: boolean } {
  const token = `"${quote}"`;
  const quotedAt = region.lastIndexOf(token);
  const bareAt = lastBare(region, quote);
  if (quotedAt < 0 && bareAt < 0) return { text: region, dropped: false };
  const useQuoted = quotedAt !== -1 && (bareAt === -1 || quotedAt > bareAt);
  if (!useQuoted) {
    return { text: joinWithoutQuote(region.slice(0, bareAt), region.slice(bareAt + quote.length)), dropped: true };
  }
  const before = region.slice(0, quotedAt);
  const after = region.slice(quotedAt + token.length);
  const colon = before.match(/:\s*$/);
  const restOfLine = after.split("\n")[0] ?? "";
  if (colon && /^[\s.)]*$/.test(restOfLine)) {
    const start = before.length - colon[0].length;
    return { text: region.slice(0, start) + after.slice(restOfLine.length), dropped: true };
  }
  const said = restOfLine.match(/^\s*(\(said by [^)]+\))/);
  if (said) {
    return { text: `${before}cited above ${after.slice(after.indexOf(said[1]))}`, dropped: true };
  }
  return { text: `${before}cited above${after}`, dropped: true };
}

function locateReportSections(top: string): { peopleStart: number; whatToDo: number } | null {
  const peopleStart = top.search(/\n### People(?: map)?\n/);
  const whatToDo = top.search(/\n### What to do\n/);
  if (peopleStart < 0 || whatToDo < 0 || whatToDo <= peopleStart) return null;
  return { peopleStart, whatToDo };
}

/**
 * The same verbatim quote stays in the people map.
 * Overview, diagnostic, and action prose reference it instead of printing a third copy.
 */
function dedupeTopHalfQuotes(markdown: string): string {
  const marker = "\n### Snapshot metrics";
  const cut = markdown.indexOf(marker);
  if (cut < 0) return markdown;
  let top = markdown.slice(0, cut);
  const rest = markdown.slice(cut);
  const located = locateReportSections(top);
  if (!located) return markdown;
  const people = top.slice(located.peopleStart, located.whatToDo);
  const quotes = [...new Set([...people.matchAll(/"([^"]{12,})"/g)].map((match) => match[1]))].sort(
    (left, right) => right.length - left.length
  );

  for (const quote of quotes) {
    let guard = 0;
    while (countOccurrences(top, quote) > 2 && guard < 8) {
      guard += 1;
      const loc = locateReportSections(top);
      if (!loc) break;
      const before = dropLastQuote(top.slice(0, loc.peopleStart), quote);
      if (before.dropped) {
        top = before.text + top.slice(loc.peopleStart);
        continue;
      }
      const after = dropLastQuote(top.slice(loc.whatToDo), quote);
      if (after.dropped) {
        top = top.slice(0, loc.whatToDo) + after.text;
        continue;
      }
      const peopleBlock = top.slice(loc.peopleStart, loc.whatToDo);
      if (countOccurrences(peopleBlock, quote) <= 1) break;
      const droppedPeople = dropLastQuote(peopleBlock, quote);
      if (!droppedPeople.dropped) break;
      top = top.slice(0, loc.peopleStart) + droppedPeople.text + top.slice(loc.whatToDo);
    }
  }
  return top + rest;
}

/**
 * Manager-ready CRM overview for HubSpot / Salesforce paste:
 * what's going on, who does what, what to do, plus supporting context + legend.
 */
export function formatCompressedCrmNotes(result: PostMortemResult): string {
  const client = result.client_name?.trim() || "Unknown account";
  const facing = facingFor(result);
  const notADeal = facing.offForecast;
  const rawStatus = String(result.deal_classification?.status ?? result.deal_status ?? "STALLED");
  const absent = (result.stakeholders ?? []).find((s) =>
    /absent decision maker/i.test(`${s.persona_type ?? ""} ${s.stance ?? ""}`)
  );
  const vetoPerson = (result.stakeholders ?? []).find((s) =>
    /hidden detractor|blocker/i.test(`${s.persona_type ?? ""} ${s.stance ?? ""}`)
  );
  const headline = unifiedDealHeadline({
    status: rawStatus,
    trajectory: result.deal_trajectory?.trajectory_type,
    recoverabilityStatus: result.recoverability?.status,
    relevanceLabel: result.relevance?.label,
    transcript: result.source_transcript,
    blockedOn: absent?.name ?? vetoPerson?.name ?? null,
    viabilityState: result.viability_state?.state,
    recoverabilityScore: result.viability_state?.viability_score ?? result.recoverability_score,
    riskTier: result.proprietary_indices?.risk_tier,
  });
  const actions = new Map<string, number>();
  const planBody = whatToDo(result, actions);
  const whoBody = whoDoesWhat(result);
  const nextDate = nextActionDate(result);
  const situation = situationSentence(result);
  const friction = notADeal ? [] : frictionExtras(result);
  const history = historicalExtras(result);

  const rendered = [
    `## Lazarus Deal Recovery Overview — ${client}`,
    "",
    "### Exactly what's going on",
    `**Deal status:** ${headline.line}`,
    `**Forecast judgment:** ${headline.forecastLine}`,
    situation ? situation : null,
    "",
    result.diagnostic_profile ? formatDiagnosticMarkdown(result.diagnostic_profile) : null,
    result.diagnostic_profile ? "" : null,
    "### Who needs to do what",
    whoBody,
    "",
    notADeal ? "### People" : "### People map",
    peopleByRole(result),
    "",
    "### What to do",
    `**Next action date:** ${nextDate}`,
    "",
    planBody,
    "",
    "### Snapshot metrics",
    metricsBlock(result),
    friction.length ? "" : null,
    friction.length ? "### Friction & signals" : null,
    friction.length ? bulletList(friction) : null,
    history.length ? "" : null,
    history.length ? "### Historical context" : null,
    history.length ? bulletList(history) : null,
    notADeal ? null : "",
    notADeal ? null : "---",
    notADeal ? null : "",
    notADeal
      ? null
      : formatMetricLegendMarkdown({
          deal_risk_index: metricRendersBesideRisk(
            result.proprietary_indices?.deal_risk_index,
            result.proprietary_indices?.risk_tier,
            result.proprietary_indices?.deal_risk_index
          )
            ? result.proprietary_indices?.deal_risk_index
            : undefined,
          multi_department_friction: metricRendersBesideRisk(
            result.proprietary_indices?.multi_department_friction,
            result.proprietary_indices?.risk_tier,
            result.proprietary_indices?.deal_risk_index
          )
            ? result.proprietary_indices?.multi_department_friction
            : undefined,
          stakeholder_dispersion_index: metricRendersBesideRisk(
            result.proprietary_indices?.stakeholder_dispersion_index,
            result.proprietary_indices?.risk_tier,
            result.proprietary_indices?.deal_risk_index
          )
            ? result.proprietary_indices?.stakeholder_dispersion_index
            : undefined,
          dialogue_stall_score: metricRendersBesideRisk(
            result.proprietary_indices?.dialogue_stall_score,
            result.proprietary_indices?.risk_tier,
            result.proprietary_indices?.deal_risk_index
          )
            ? result.proprietary_indices?.dialogue_stall_score
            : undefined,
          viability_score: metricRendersBesideRisk(
            result.viability_state?.viability_score,
            result.proprietary_indices?.risk_tier,
            result.proprietary_indices?.deal_risk_index
          )
            ? result.viability_state?.viability_score
            : undefined,
        }),
    notADeal ? null : "",
    `*Generated by Lazarus Deal Recovery · ${new Date().toISOString().slice(0, 10)}*`,
  ]
    .filter((line) => line !== null)
    .join("\n");
  const dealRisk = result.proprietary_indices?.deal_risk_index;
  const tier = result.proprietary_indices?.risk_tier;
  const hideStructuralZero = tier === "HIGH" || tier === "CRITICAL" || (typeof dealRisk === "number" && dealRisk > 70);
  const withoutStructuralZero = hideStructuralZero
    ? rendered
        .split("\n")
        .flatMap((line) => {
          const next = line.replace(/\bStructural 0\b\.?\s*/g, "");
          if (!next.trim() && line.trim()) return [];
          return [next];
        })
        .join("\n")
    : rendered;
  const transcript = result.source_transcript ?? "";
  const grounded = !transcript
    ? withoutStructuralZero
    : withoutStructuralZero
        .split("\n")
        .filter((line) => {
          const quotes = [...line.matchAll(/"([^"]*)"/g)].map((match) => match[1]);
          return quotes.every((quote) => transcript.includes(quote));
        })
        .join("\n");
  return dedupeTopHalfQuotes(grounded);
}
