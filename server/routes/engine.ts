/**
 * Atomic Two-Turbo orchestrator — POST /api/v1/run-engine
 */

import { Router } from "express";
import {
  gatekeeperMiddleware,
  releaseGatekeeperLock,
  type GatekeeperRequest,
} from "../middleware/gatekeeper.js";
import { calculateDRI } from "../engine/matrix.js";
import {
  extractTelemetry,
  telemetryToMatrixPayload,
} from "../engine/telemetryExtract.js";
import { generateStructuredPolish } from "../engine/generator.js";
import { generateExecutiveDiagnostics } from "../engine/translator.js";
import { commitEngineExecution, writeAuditLogAndSync } from "../engine/audit.js";
import {
  enqueueGhostBusterReview,
  shouldFireResurrectionScorecard,
  shouldQueueGhostBuster,
  recordRescuedRevenue,
  buildResurrectionBroadcast,
  reviewGhostBusterItem,
  buildBoardLeakageReport,
  rescuedLeaderboard,
  buildMorningBriefingItems,
} from "../engine/hooks.js";
import { getServiceSupabase } from "../supabase.js";
import { requireAuthUser, type AuthedRequest } from "../requireUser.js";
import { tenantIdForUser } from "../tenantMembership.js";

const router = Router();

router.post(
  "/run-engine",
  (req, res, next) => {
    void gatekeeperMiddleware(req as GatekeeperRequest, res, next);
  },
  async (req, res) => {
    const greq = req as GatekeeperRequest;
    const { dealId, tenantId, dealState, authUserId } = greq;

    try {
      const extract = extractTelemetry({
        transcript: String(req.body?.transcript ?? ""),
        crm: {
          stage: dealState?.stage,
          daysStalled: dealState?.days_stalled ?? req.body?.daysStalled,
          unansweredEmailCount:
            dealState?.unanswered_email_count ?? req.body?.unansweredEmailCount,
          lastProspectSentiment:
            (dealState?.last_prospect_sentiment as
              | "POSITIVE"
              | "NEUTRAL"
              | "NEGATIVE"
              | "GHOSTING"
              | undefined) ?? req.body?.lastProspectSentiment,
          contractValue: Number(
            dealState?.contract_value ?? req.body?.contractValue ?? 0
          ),
          stakeholders: Array.isArray(dealState?.stakeholders)
            ? (dealState!.stakeholders as never[])
            : req.body?.stakeholders,
        },
      });

      const matrixInput = {
        ...telemetryToMatrixPayload(extract, dealId),
        dealType: dealState?.deal_type,
        commercialIntentScore: dealState?.commercial_intent_score,
      };

      const matrixDecision = calculateDRI(matrixInput);

      const polishedOutput = await generateStructuredPolish(matrixDecision.templateId, {
        prospectName: String(req.body?.prospectName || "Valued Client"),
        companyName: String(req.body?.companyName || "Target Enterprise"),
        riskIndex: matrixDecision.riskIndex,
        transcriptExcerpts: extract.evidentiaryExcerpts,
      });

      const executiveDiagnostics = await generateExecutiveDiagnostics({
        telemetry: matrixInput,
        decision: matrixDecision,
        excerpts: extract.evidentiaryExcerpts,
      });

      const commit = await commitEngineExecution({
        dealId: dealId!,
        tenantId: tenantId!,
        targetStage: matrixDecision.targetStage,
        riskIndex: matrixDecision.riskIndex,
        stakeholders: matrixDecision.reprofiledStakeholders,
      });
      if (!commit.ok) throw new Error(commit.error || "commit failed");

      let reviewQueueId: string | null = null;
      if (
        shouldQueueGhostBuster(
          matrixDecision,
          extract.unansweredEmails
        )
      ) {
        const queued = await enqueueGhostBusterReview({
          tenantId: tenantId!,
          dealId: dealId!,
          userId: authUserId,
          riskIndex: matrixDecision.riskIndex,
          outreach: polishedOutput,
        });
        reviewQueueId = queued.id;
      }

      const prevDri = dealState?.dri ?? matrixDecision.riskIndex;
      let resurrection: ReturnType<typeof buildResurrectionBroadcast> | null = null;
      if (
        shouldFireResurrectionScorecard(
          prevDri,
          matrixDecision.riskIndex,
          Boolean(req.body?.replied)
        )
      ) {
        resurrection = buildResurrectionBroadcast({
          repName: String(req.body?.repName || "Rep"),
          dealValue: extract.contractValue ?? 0,
          driBefore: prevDri,
          driAfter: matrixDecision.riskIndex,
        });
        await recordRescuedRevenue({
          tenantId: tenantId!,
          dealId: dealId!,
          userId: authUserId,
          rescuedArr: extract.contractValue ?? 0,
          driBefore: prevDri,
          driAfter: matrixDecision.riskIndex,
        });
      }

      await writeAuditLogAndSync({
        tenantId: tenantId!,
        dealId: dealId!,
        previousStage: String(dealState?.stage ?? ""),
        newStage: matrixDecision.targetStage,
        riskIndex: matrixDecision.riskIndex,
        gatekeeperStatus: "PASSED",
        actionTriggered: matrixDecision.actionTrigger,
        payloadSnapshot: {
          outreachPayload: polishedOutput,
          executiveDiagnostics,
          reprofiledStakeholders: matrixDecision.reprofiledStakeholders,
          breakdown: matrixDecision.breakdown,
          reviewQueueId,
          resurrection,
        },
      });

      await releaseGatekeeperLock(greq);
      return res.status(200).json({
        success: true,
        stage: matrixDecision.targetStage,
        riskIndex: matrixDecision.riskIndex,
        breakdown: matrixDecision.breakdown,
        outreachPayload: polishedOutput,
        executiveDiagnostics,
        reviewQueueId,
        resurrection,
        note: reviewQueueId
          ? "Ghost-Buster draft queued for human approval — not sent."
          : undefined,
      });
    } catch (error: unknown) {
      await releaseGatekeeperLock(greq);
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: "Pipeline error", details: message });
    }
  }
);

router.post(
  "/review-queue/:id",
  requireAuthUser,
  async (req: AuthedRequest, res) => {
    const tenantId = await tenantIdForUser(req.authUserId);
    if (!tenantId) {
      res.status(403).json({ error: "No company workspace" });
      return;
    }
    const action = String(req.body?.action ?? "").toUpperCase();
    if (!["APPROVED", "EDITED", "CANCELLED"].includes(action)) {
      res.status(400).json({ error: "action must be APPROVED, EDITED, or CANCELLED" });
      return;
    }
    const result = await reviewGhostBusterItem({
      tenantId,
      queueId: req.params.id,
      userId: req.authUserId!,
      action: action as "APPROVED" | "EDITED" | "CANCELLED",
      subjectLine: req.body?.subjectLine,
      emailBody: req.body?.emailBody,
      callToAction: req.body?.callToAction,
    });
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({
      ok: true,
      status: action,
      note: "Approved drafts are not auto-sent. Send from your connected mailbox.",
    });
  }
);

router.get("/morning-briefing", requireAuthUser, async (req: AuthedRequest, res) => {
  const tenantId = await tenantIdForUser(req.authUserId);
  if (!tenantId) {
    res.status(403).json({ error: "No company workspace" });
    return;
  }
  const supabase = getServiceSupabase();
  if (!supabase) {
    res.status(503).json({ error: "Database unavailable" });
    return;
  }
  const { data } = await supabase
    .from("engine_deals")
    .select("id, dri, previous_dri, stakeholders, external_deal_id")
    .eq("tenant_id", tenantId)
    .limit(100);
  const items = buildMorningBriefingItems(
    (data ?? []).map((d) => ({
      id: d.id,
      name: d.external_deal_id ?? d.id,
      dri: d.dri,
      previous_dri: d.previous_dri,
      stakeholders: d.stakeholders as { role: string; status?: string }[] | undefined,
    }))
  );
  res.json({ items, localHint: "Deliver at 7:30 local via Slack/Teams/email worker" });
});

router.get("/board-report", requireAuthUser, async (req: AuthedRequest, res) => {
  const tenantId = await tenantIdForUser(req.authUserId);
  if (!tenantId) {
    res.status(403).json({ error: "No company workspace" });
    return;
  }
  const supabase = getServiceSupabase();
  if (!supabase) {
    res.status(503).json({ error: "Database unavailable" });
    return;
  }
  const { data } = await supabase
    .from("engine_deals")
    .select("dri, contract_value, stage, deal_type")
    .eq("tenant_id", tenantId);
  const report = buildBoardLeakageReport(
    (data ?? []).map((d) => ({
      dri: d.dri,
      contract_value: d.contract_value,
      stage: d.stage,
      root_cause: d.deal_type,
    }))
  );
  const leaderboard = await rescuedLeaderboard(tenantId);
  res.json({ ...report, rescuedArrYtd: leaderboard.reduce((s, r) => s + r.rescued_arr, 0), leaderboard });
});

export function registerEngineRoutes(app: import("express").Express): void {
  app.use("/api/v1", router);
}

export default router;
