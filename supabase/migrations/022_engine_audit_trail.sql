-- Two-Turbo engine: deal state, immutable audit trail, review queue, leaderboard.
-- Apply after 021_security_sweep.sql

CREATE TABLE IF NOT EXISTS public.engine_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  post_mortem_id UUID REFERENCES public.call_post_mortems(id) ON DELETE SET NULL,
  external_deal_id TEXT,
  provider TEXT CHECK (provider IS NULL OR provider IN ('hubspot', 'salesforce')),
  status TEXT NOT NULL DEFAULT 'OPEN',
  stage TEXT,
  deal_type TEXT DEFAULT 'UNKNOWN',
  commercial_intent_score INT,
  days_stalled INT DEFAULT 0,
  unanswered_email_count INT DEFAULT 0,
  last_prospect_sentiment TEXT DEFAULT 'NEUTRAL',
  days_since_sentiment INT DEFAULT 0,
  contract_value NUMERIC DEFAULT 0,
  dri INT,
  previous_dri INT,
  stakeholders JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engine_deals_tenant ON public.engine_deals (tenant_id);
CREATE INDEX IF NOT EXISTS idx_engine_deals_post_mortem ON public.engine_deals (post_mortem_id);
CREATE INDEX IF NOT EXISTS idx_engine_deals_external
  ON public.engine_deals (provider, external_deal_id);

ALTER TABLE public.engine_deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS engine_deals_tenant_select ON public.engine_deals;
CREATE POLICY engine_deals_tenant_select ON public.engine_deals
  FOR SELECT TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );

CREATE TABLE IF NOT EXISTS public.engine_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES public.engine_deals(id) ON DELETE CASCADE,
  previous_stage VARCHAR(50),
  new_stage VARCHAR(50) NOT NULL,
  risk_index INT NOT NULL,
  gatekeeper_status VARCHAR(20) NOT NULL,
  action_triggered VARCHAR(50) NOT NULL,
  payload_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  crm_sync_status VARCHAR(30) DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engine_audit_logs_tenant ON public.engine_audit_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_engine_audit_logs_deal ON public.engine_audit_logs (deal_id);

ALTER TABLE public.engine_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS engine_audit_logs_tenant_select ON public.engine_audit_logs;
CREATE POLICY engine_audit_logs_tenant_select ON public.engine_audit_logs
  FOR SELECT TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );

CREATE TABLE IF NOT EXISTS public.engine_review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES public.engine_deals(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'GHOST_BUSTER',
  status TEXT NOT NULL DEFAULT 'PENDING_REVIEW'
    CHECK (status IN ('PENDING_REVIEW', 'APPROVED', 'EDITED', 'CANCELLED', 'SENT')),
  subject_line TEXT,
  email_body TEXT,
  call_to_action TEXT,
  evidentiary_excerpts JSONB NOT NULL DEFAULT '[]'::jsonb,
  risk_index INT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engine_review_queue_tenant_status
  ON public.engine_review_queue (tenant_id, status);

ALTER TABLE public.engine_review_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS engine_review_queue_tenant_select ON public.engine_review_queue;
CREATE POLICY engine_review_queue_tenant_select ON public.engine_review_queue
  FOR SELECT TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );

CREATE TABLE IF NOT EXISTS public.engine_rescued_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES public.engine_deals(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rescued_arr NUMERIC NOT NULL DEFAULT 0,
  dri_before INT,
  dri_after INT,
  month_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engine_rescued_revenue_tenant_month
  ON public.engine_rescued_revenue (tenant_id, month_key);

ALTER TABLE public.engine_rescued_revenue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS engine_rescued_revenue_tenant_select ON public.engine_rescued_revenue;
CREATE POLICY engine_rescued_revenue_tenant_select ON public.engine_rescued_revenue
  FOR SELECT TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.commit_engine_execution(
  p_deal_id UUID,
  p_tenant_id UUID,
  p_target_stage TEXT,
  p_risk_index INT,
  p_stakeholders JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.engine_deals
  SET
    previous_dri = dri,
    dri = p_risk_index,
    stage = COALESCE(p_target_stage, stage),
    stakeholders = COALESCE(p_stakeholders, stakeholders),
    last_processed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_deal_id AND tenant_id = p_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_engine_execution(UUID, UUID, TEXT, INT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_engine_execution(UUID, UUID, TEXT, INT, JSONB) TO service_role;
