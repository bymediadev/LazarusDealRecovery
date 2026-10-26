/**
 * Pre-execution gatekeeper: auth, tenant scope, blocked status, Gate 0, deal lock.
 */

import type { NextFunction, Response } from "express";
import { resolveAuthUser } from "../founderAuth.js";
import { tenantIdForUser } from "../tenantMembership.js";
import { getServiceSupabase } from "../supabase.js";
import { evaluateGateZero } from "../engine/matrix.js";
import { acquireDealLock, releaseDealLock } from "../engine/dealLock.js";
import type { AuthedRequest } from "../requireUser.js";

export type EngineDealState = {
  id: string;
  tenant_id: string;
  post_mortem_id: string | null;
  external_deal_id: string | null;
  status: string;
  stage: string | null;
  deal_type: string | null;
  commercial_intent_score: number | null;
  days_stalled: number | null;
  unanswered_email_count: number | null;
  last_prospect_sentiment: string | null;
  contract_value: number | null;
  dri: number | null;
  stakeholders: unknown;
};

export type GatekeeperRequest = AuthedRequest & {
  tenantId?: string;
  dealId?: string;
  dealState?: EngineDealState;
  isCommercialOpportunity?: boolean;
  dealLock?: Awaited<ReturnType<typeof acquireDealLock>>;
};

const BLOCKED_STATUSES = new Set([
  "CLOSED_WON",
  "CLOSED_LOST",
  "PAUSED",
  "OPTED_OUT",
  "ARCHIVED",
]);

export async function gatekeeperMiddleware(
  req: GatekeeperRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  let lock: Awaited<ReturnType<typeof acquireDealLock>> = null;
  try {
    const user = await resolveAuthUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized: Sign in required" });
      return;
    }
    req.authUserId = user.id;
    req.authUser = user;

    const tenantId = await tenantIdForUser(user.id);
    if (!tenantId) {
      res.status(403).json({ error: "No company workspace membership" });
      return;
    }

    const dealId = String(req.body?.deal_id ?? req.body?.dealId ?? "").trim();
    if (!dealId) {
      res.status(400).json({ error: "Missing required deal_id" });
      return;
    }

    lock = await acquireDealLock(tenantId, dealId, 30);
    if (!lock) {
      res.status(429).json({
        error: "Concurrent engine execution detected for this deal. Request locked.",
      });
      return;
    }
    req.dealLock = lock;

    const supabase = getServiceSupabase();
    if (!supabase) {
      await releaseDealLock(lock);
      res.status(503).json({ error: "Database unavailable" });
      return;
    }

    const { data: deal, error } = await supabase
      .from("engine_deals")
      .select(
        "id, tenant_id, post_mortem_id, external_deal_id, status, stage, deal_type, commercial_intent_score, days_stalled, unanswered_email_count, last_prospect_sentiment, contract_value, dri, stakeholders"
      )
      .eq("id", dealId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error || !deal) {
      await releaseDealLock(lock);
      res.status(404).json({ error: "Deal not found or tenant RLS restriction failed" });
      return;
    }

    const status = String(deal.status ?? "").toUpperCase();
    if (BLOCKED_STATUSES.has(status)) {
      await releaseDealLock(lock);
      res.status(422).json({ error: `Execution rejected: Deal status is '${deal.status}'` });
      return;
    }

    const gate = evaluateGateZero({
      dealType: deal.deal_type,
      commercialIntentScore: deal.commercial_intent_score,
      daysStalled: deal.days_stalled ?? undefined,
      unansweredEmails: deal.unanswered_email_count ?? undefined,
    });

    if (gate.omega === 0) {
      await releaseDealLock(lock);
      res.status(200).json({
        status: "NOT_A_DEAL",
        riskIndex: 0,
        actionTrigger: "SUPPRESS_OUTREACH",
        reason: gate.reason,
      });
      return;
    }

    req.tenantId = tenantId;
    req.dealId = dealId;
    req.dealState = deal as EngineDealState;
    req.isCommercialOpportunity = true;
    next();
  } catch (err) {
    await releaseDealLock(lock);
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "Gatekeeper middleware internal error", details: message });
  }
}

/** Release lock after orchestrator finishes (success or failure). */
export async function releaseGatekeeperLock(req: GatekeeperRequest): Promise<void> {
  await releaseDealLock(req.dealLock);
  req.dealLock = null;
}
