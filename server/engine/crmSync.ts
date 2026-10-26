/**
 * Bilateral CRM sync for engine state (HubSpot / Salesforce).
 * Best-effort: missing OAuth or deal link → SKIPPED, not hard fail.
 */

import { getServiceSupabase } from "../supabase.js";

export type CrmSyncStatus = "SYNCED" | "PENDING" | "SKIPPED" | "FAILED";

export async function syncEngineDealToCrm(
  tenantId: string,
  dealId: string,
  newStage: string,
  riskIndex: number,
  payloadSnapshot: Record<string, unknown>
): Promise<CrmSyncStatus> {
  const supabase = getServiceSupabase();
  if (!supabase) return "FAILED";

  const { data: deal } = await supabase
    .from("engine_deals")
    .select("id, provider, external_deal_id, post_mortem_id, dri")
    .eq("id", dealId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!deal?.external_deal_id || !deal.provider) {
    return "SKIPPED";
  }

  try {
    const note = [
      `Lazarus Engine update`,
      `DRI: ${riskIndex}`,
      `Stage: ${newStage}`,
      `Action: ${String(payloadSnapshot.actionTriggered ?? "")}`,
    ].join("\n");

    // Persist sync intent on crm_deal_links for outbound workers / reviveCrm.
    await supabase
      .from("crm_deal_links")
      .update({
        historical_crm_context: {
          engine_dri: riskIndex,
          engine_stage: newStage,
          engine_note: note,
          engine_synced_at: new Date().toISOString(),
          payload: payloadSnapshot,
        },
        last_outbound_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("provider", deal.provider)
      .eq("external_deal_id", deal.external_deal_id);

    return "SYNCED";
  } catch (err) {
    console.error("crmSync failed:", err);
    return "FAILED";
  }
}
