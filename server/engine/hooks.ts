/**
 * Product hook & retention engine.
 * Ghost-Buster: review queue only — never auto-sends.
 */

import { getServiceSupabase } from "../supabase.js";
import type { AIResponsePayload } from "./generator.js";
import type { EngineMatrixDecision } from "./matrix.js";

export type HookNotification = {
  channel: "slack" | "teams" | "email" | "in_app";
  title: string;
  body: string;
  meta?: Record<string, unknown>;
};

/** DRI jump > 15 overnight or silent champion → morning briefing item. */
export function buildMorningBriefingItems(
  deals: {
    id: string;
    name?: string;
    dri: number | null;
    previous_dri: number | null;
    stakeholders?: { role: string; status?: string }[];
  }[]
): HookNotification[] {
  const items: HookNotification[] = [];
  for (const d of deals) {
    const dri = d.dri ?? 0;
    const prev = d.previous_dri ?? dri;
    const jump = dri - prev;
    const silentChampion = (d.stakeholders ?? []).some(
      (s) => s.role === "CHAMPION" && /silent|detractor/i.test(s.status ?? "")
    );
    if (jump > 15 || silentChampion) {
      items.push({
        channel: "in_app",
        title: `Drift alert: ${d.name ?? d.id}`,
        body:
          jump > 15
            ? `DRI jumped ${jump} points (now ${dri}). Approve a recovery action when ready.`
            : `Champion went silent. Review the queued pattern interrupt before forecast.`,
        meta: { dealId: d.id, dri, jump, approveRequired: true },
      });
    }
  }
  return items;
}

export function shouldFireResurrectionScorecard(
  driBefore: number,
  driAfter: number,
  replied = false
): boolean {
  return replied || (driBefore > 75 && driAfter < 30);
}

export function buildResurrectionBroadcast(input: {
  repName: string;
  dealValue: number;
  driBefore: number;
  driAfter: number;
}): HookNotification {
  return {
    channel: "slack",
    title: "Deal resurrected",
    body: `${input.repName} dropped DRI ${input.driBefore} → ${input.driAfter} on a $${input.dealValue.toLocaleString()} deal.`,
    meta: { ...input, leaderboard: true },
  };
}

/** Ghost-Buster trigger — queue only. */
export function shouldQueueGhostBuster(
  decision: EngineMatrixDecision,
  unanswered: number
): boolean {
  return decision.dri > 85 || unanswered >= 3;
}

export async function enqueueGhostBusterReview(input: {
  tenantId: string;
  dealId: string;
  userId?: string | null;
  riskIndex: number;
  outreach: AIResponsePayload;
}): Promise<{ id: string | null; queued: boolean }> {
  const supabase = getServiceSupabase();
  if (!supabase) return { id: null, queued: false };

  const { data, error } = await supabase
    .from("engine_review_queue")
    .insert({
      tenant_id: input.tenantId,
      deal_id: input.dealId,
      kind: "GHOST_BUSTER",
      status: "PENDING_REVIEW",
      subject_line: input.outreach.subjectLine,
      email_body: input.outreach.emailBody,
      call_to_action: input.outreach.callToAction,
      evidentiary_excerpts: input.outreach.evidentiaryExcerpts,
      risk_index: input.riskIndex,
      created_by: input.userId ?? null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Ghost-Buster queue failed:", error.message);
    return { id: null, queued: false };
  }
  return { id: data.id, queued: true };
}

export async function reviewGhostBusterItem(input: {
  tenantId: string;
  queueId: string;
  userId: string;
  action: "APPROVED" | "EDITED" | "CANCELLED";
  subjectLine?: string;
  emailBody?: string;
  callToAction?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = getServiceSupabase();
  if (!supabase) return { ok: false, error: "Database unavailable" };

  const patch: Record<string, unknown> = {
    status: input.action === "EDITED" ? "EDITED" : input.action,
    reviewed_by: input.userId,
    reviewed_at: new Date().toISOString(),
  };
  if (input.subjectLine) patch.subject_line = input.subjectLine;
  if (input.emailBody) patch.email_body = input.emailBody;
  if (input.callToAction) patch.call_to_action = input.callToAction;

  // Never mark SENT from this path — human must send outside Lazarus.
  const { error } = await supabase
    .from("engine_review_queue")
    .update(patch)
    .eq("id", input.queueId)
    .eq("tenant_id", input.tenantId)
    .eq("status", "PENDING_REVIEW");

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export function buildBoardLeakageReport(deals: {
  dri: number | null;
  contract_value: number | null;
  stage?: string | null;
  root_cause?: string | null;
}[]): {
  totalPipelineRiskValue: number;
  driDistribution: Record<string, number>;
  rescuedArrYtd: number;
  rootCauseBreakdown: Record<string, number>;
} {
  let totalPipelineRiskValue = 0;
  const driDistribution: Record<string, number> = {
    LOW: 0,
    MODERATE: 0,
    HIGH: 0,
    CRITICAL: 0,
  };
  const rootCauseBreakdown: Record<string, number> = {};

  for (const d of deals) {
    const dri = d.dri ?? 0;
    const value = Number(d.contract_value ?? 0);
    totalPipelineRiskValue += value * (dri / 100);
    const tier =
      dri >= 75 ? "CRITICAL" : dri >= 55 ? "HIGH" : dri >= 35 ? "MODERATE" : "LOW";
    driDistribution[tier] += 1;
    const cause = d.root_cause || d.stage || "UNSPECIFIED";
    rootCauseBreakdown[cause] = (rootCauseBreakdown[cause] ?? 0) + 1;
  }

  return {
    totalPipelineRiskValue: Math.round(totalPipelineRiskValue),
    driDistribution,
    rescuedArrYtd: 0,
    rootCauseBreakdown,
  };
}

export async function recordRescuedRevenue(input: {
  tenantId: string;
  dealId: string;
  userId?: string | null;
  rescuedArr: number;
  driBefore: number;
  driAfter: number;
}): Promise<void> {
  const supabase = getServiceSupabase();
  if (!supabase) return;
  const monthKey = new Date().toISOString().slice(0, 7);
  await supabase.from("engine_rescued_revenue").insert({
    tenant_id: input.tenantId,
    deal_id: input.dealId,
    user_id: input.userId ?? null,
    rescued_arr: input.rescuedArr,
    dri_before: input.driBefore,
    dri_after: input.driAfter,
    month_key: monthKey,
  });
}

export async function rescuedLeaderboard(
  tenantId: string,
  monthKey?: string
): Promise<{ user_id: string | null; rescued_arr: number }[]> {
  const supabase = getServiceSupabase();
  if (!supabase) return [];
  const key = monthKey ?? new Date().toISOString().slice(0, 7);
  const { data } = await supabase
    .from("engine_rescued_revenue")
    .select("user_id, rescued_arr")
    .eq("tenant_id", tenantId)
    .eq("month_key", key);

  const map = new Map<string, number>();
  for (const row of data ?? []) {
    const uid = row.user_id ?? "unknown";
    map.set(uid, (map.get(uid) ?? 0) + Number(row.rescued_arr ?? 0));
  }
  return [...map.entries()]
    .map(([user_id, rescued_arr]) => ({
      user_id: user_id === "unknown" ? null : user_id,
      rescued_arr,
    }))
    .sort((a, b) => b.rescued_arr - a.rescued_arr);
}
