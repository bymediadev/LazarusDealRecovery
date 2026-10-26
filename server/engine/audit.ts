import { getServiceSupabase } from "../supabase.js";
import { syncEngineDealToCrm } from "./crmSync.js";

export interface AuditLogEntry {
  tenantId: string;
  dealId: string;
  previousStage: string;
  newStage: string;
  riskIndex: number;
  gatekeeperStatus: "PASSED" | "FAILED" | "BYPASSED";
  actionTriggered: string;
  payloadSnapshot: Record<string, unknown>;
}

export async function writeAuditLogAndSync(entry: AuditLogEntry): Promise<void> {
  const supabase = getServiceSupabase();
  if (!supabase) {
    console.error("CRITICAL: No supabase client for audit log");
    return;
  }

  const { error } = await supabase.from("engine_audit_logs").insert({
    tenant_id: entry.tenantId,
    deal_id: entry.dealId,
    previous_stage: entry.previousStage,
    new_stage: entry.newStage,
    risk_index: entry.riskIndex,
    gatekeeper_status: entry.gatekeeperStatus,
    action_triggered: entry.actionTriggered,
    payload_snapshot: entry.payloadSnapshot,
    crm_sync_status: "PROCESSING",
  });

  if (error) {
    console.error("CRITICAL: Failed to write audit log entry:", error.message);
    return;
  }

  const syncStatus = await syncEngineDealToCrm(
    entry.tenantId,
    entry.dealId,
    entry.newStage,
    entry.riskIndex,
    entry.payloadSnapshot
  );

  await supabase
    .from("engine_audit_logs")
    .update({ crm_sync_status: syncStatus })
    .eq("deal_id", entry.dealId)
    .eq("tenant_id", entry.tenantId)
    .order("created_at", { ascending: false })
    .limit(1);
}

export async function commitEngineExecution(input: {
  dealId: string;
  tenantId: string;
  targetStage: string;
  riskIndex: number;
  stakeholders?: unknown;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = getServiceSupabase();
  if (!supabase) return { ok: false, error: "Database unavailable" };

  const { error } = await supabase.rpc("commit_engine_execution", {
    p_deal_id: input.dealId,
    p_tenant_id: input.tenantId,
    p_target_stage: input.targetStage,
    p_risk_index: input.riskIndex,
    p_stakeholders: input.stakeholders ?? null,
  });

  if (error) {
    const { data: current } = await supabase
      .from("engine_deals")
      .select("dri")
      .eq("id", input.dealId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();
    const patch: Record<string, unknown> = {
      previous_dri: current?.dri ?? null,
      dri: input.riskIndex,
      stage: input.targetStage,
      last_processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (input.stakeholders != null) patch.stakeholders = input.stakeholders;
    const { error: upErr } = await supabase
      .from("engine_deals")
      .update(patch)
      .eq("id", input.dealId)
      .eq("tenant_id", input.tenantId);

    if (upErr) return { ok: false, error: upErr.message };
  }
  return { ok: true };
}
