import { PostMortemResult, StakeholderSignal } from "../types";
import {
  findInvisibleVetoOrMissingAuthority,
  findTechnicalVetoHolder,
  formatAuthorityLabel,
} from "./authorityRoles";
import { peopleMapRows } from "./evidenceAttribution";
import { formatDiagnosticMarkdown, matrixFacing, recommendedMoveLine, unifiedDealHeadline } from "./reportMatrix";
import { formatMetricLegendMarkdown, metricRendersBesideRisk } from "./metricLegend";
import { recoveryActionNote, uniqueRecoveryNotes, formatRecoveryAction } from "./recoveryPlan";
import { decisiveSentence, reportRootIssue, spokenBy, verbatimQuote } from "./reportCopy";
import { intentInputTrace } from "./scoreInputTrace";

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

function invisibleVetoHolder(result: PostMortemResult): string {
  const stakeholders = result.stakeholders ?? [];
  const technical = findTechnicalVetoHolder(stakeholders);
  const missing = findInvisibleVetoOrMissingAuthority(stakeholders);
  const transcript = result.source_transcript ?? "";
  // A mapped person appears in the deal. "Never appears" is only for a role nobody holds.
  if (technical) {
    const title = technical.role?.trim() || "technical approver";
    const clause = verbatimQuote(transcript, decisiveSentence(transcript, technical.name)?.text ?? "");
    const why = clause ? `: ${clause}` : "";
    return `No missing authority. ${technical.name.trim()}, ${title}, is the technical approval dependency${why}`;
  }
  if (missing && !stakeholders.some((person) => person.name.trim().toLowerCase() === missing.name.trim().toLowerCase())) {
    const role = missing.role?.trim() || missing.persona_type?.trim() || "Decision maker";
    return `Missing authority: ${role} never appears in this deal.`;
  }
  return "No missing authority.";
}

function intentCopy(result: PostMortemResult): string | null {
  const components = result.viability_state?.derivation_components;
  const raw = Number(result.buyer_state?.intent_strength ?? components?.intent_strength);
  const constraint = Number(result.buyer_state?.constraint_pressure ?? components?.constraint_pressure);
  const effective = Number(result.buyer_state?.effective_intent ?? components?.intent_strength);
  if (!Number.isFinite(effective)) return null;
  const named =
    (result.causal_forces ?? []).find((force) => force.type === "Constraint" || force.type === "Structural")?.factor?.trim() ??
    "";
  return intentInputTrace(Number.isFinite(raw) ? raw : 0, Number.isFinite(constraint) ? constraint : 0, effective, named);
}

function coreBlocker(result: PostMortemResult): string {
  const eq = result.equilibrium_analysis;
  const init = result.force_initialization;
  const force = (result.causal_forces ?? []).find(
    (f) => f.type === "Constraint" || f.type === "Structural"
  );
  return (
    eq?.equilibrium_breaker?.trim() ||
    init?.classification_rationale?.trim() ||
    force?.factor?.trim() ||
    init?.summary?.trim() ||
    "See full autopsy for blocker detail"
  );
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
  if (quote && decisive) {
    const said = decisive.speaker && !spokenBy(decisive.speaker, person.name) ? ` (said by ${decisive.speaker})` : "";
    return `  Evidence: "${quote}"${said}`;
  }
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

function whoDoesWhat(result: PostMortemResult, actions: ActionIndex): string {
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
        ? `- **${absent.name}${absent.role ? ` (${absent.role})` : ""}:** Technical approval dependency — schedule validation with them present; do not treat close date as real until they sign off.`
        : `- **${absent.name}${absent.role ? ` (${absent.role})` : ""}:** Missing decision-maker — get them in the room or on the thread before treating close date as real.`
    );
  }
  if (notADeal) {
    lines.push(`- **Recommended next move:** ${recommendedMoveLine(promised)}`);
  } else if (crmNext) {
    const slot = registerAction(actions, crmNext);
    lines.push(
      slot.repeat
        ? `- **Recommended next move:** See ${slot.number}.`
        : `- **Recommended next move:** ${slot.number}. ${recoveryActionNote(crmNext).replace(/\n/g, "; ")}`
    );
  }

  return lines.join("\n");
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
  const section = (title: string, items: string[], empty?: string) => {
    const notes = uniqueRecoveryNotes(items).map((note) => {
      const slot = registerAction(actions, note);
      if (slot.repeat) return `See ${slot.number}.`;
      return `${slot.number}. ${note.replace(/\n/g, "\n   ")}`;
    });
    if (!notes.length) {
      if (!empty) return;
      sections.push(`**${title}:**`);
      sections.push(empty);
      return;
    }
    sections.push(`**${title}:**`);
    sections.push(notes.join("\n"));
  };

  if (notADeal) {
    const promised = uniqueRecoveryNotes(day0.length ? day0 : day30);
    return promised.length
      ? promised.map((note, i) => `${i + 1}. ${note.replace(/\n/g, "\n   ")}`).join("\n")
      : "No purchase step was promised.";
  }
  section(
    "This week (0–7 days)",
    day0.length ? day0 : day30.slice(0, 2),
    laterCheckpoint.length ? undefined : "Set a dated next step with the champion."
  );
  if (!notADeal && day30.length) {
    sections.push("");
    section("30 days", day30);
  }
  if (!notADeal && laterCheckpoint.length) {
    sections.push("");
    section("Stated checkpoint", laterCheckpoint);
  }
  if (!notADeal && day60.length) {
    sections.push("");
    section("60 days", day60);
  }
  if (!notADeal && day90.length) {
    sections.push("");
    section("90 days", day90);
  }
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
    if (pi.authority_gap_flag) lines.push("- **Authority gap:** Yes");
  } else if (triage && triage.department_friction_index > 0) {
    lines.push(`- **Department friction index:** ${triage.department_friction_index}/100`);
  }
  if (vs && !facing.offForecast && metricRendersBesideRisk(vs.viability_score, pi?.risk_tier, pi?.deal_risk_index)) {
    lines.push(`- **Viability score:** ${vs.viability_score}/100`);
  }
  return lines.length ? lines.join("\n") : "- Metrics not available for this run.";
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
  const rootIssue = reportRootIssue(result);
  const intent = intentCopy(result);
  const actions = new Map<string, number>();
  const blocker =
    result.live_deal_triage?.core_blocker?.trim() || coreBlocker(result);
  const veto = invisibleVetoHolder(result);
  const nextDate = nextActionDate(result);
  const eqNote = notADeal ? "" : result.equilibrium_analysis?.explanation?.trim();
  const friction = notADeal ? [] : frictionExtras(result);
  const history = historicalExtras(result);

  const rendered = [
    `## Lazarus Deal Recovery Overview — ${client}`,
    "",
    "### Exactly what's going on",
    `**Deal status:** ${headline.line}`,
    `**Forecast judgment:** ${headline.forecastLine}`,
    `**Root issue:** ${rootIssue}`,
    intent ? `**Intent:** ${intent}` : null,
    `**Core blocker:** ${blocker}`,
    `**Invisible veto / missing authority:** ${veto}`,
    eqNote ? `**Why it's stuck:** ${eqNote}` : null,
    "",
    result.diagnostic_profile ? formatDiagnosticMarkdown(result.diagnostic_profile) : null,
    result.diagnostic_profile ? "" : null,
    "### Who needs to do what",
    whoDoesWhat(result, actions),
    "",
    notADeal ? "### People" : "### People map",
    peopleByRole(result),
    "",
    "### What to do",
    `**Next action date:** ${nextDate}`,
    "",
    whatToDo(result, actions),
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
  if (!transcript) return withoutStructuralZero;
  return withoutStructuralZero
    .split("\n")
    .filter((line) => {
      const quotes = [...line.matchAll(/"([^"]*)"/g)].map((match) => match[1]);
      return quotes.every((quote) => transcript.includes(quote));
    })
    .join("\n");
}
