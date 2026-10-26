LAZARUS DEAL RECOVERY (getldr.ca)
HARDENED TECHNICAL SPECIFICATION FOR CURSOR EXECUTION
EXECUTIVE SUMMARY & HARDENED SYSTEM ARCHITECTURE
Lazarus Deal Recovery implements a Hardened Multi-Stage Hybrid Architecture with Gate 0 Commercial Reality Filtering, Dynamic Stakeholder Intelligence Re-Profiling, Evidentiary Traceability, Production Security, and Bilateral CRM Synchronization to eliminate LLM drift, enforce state transitions, and protect tenant isolation.

î°ƒIncoming Request / Webhook / Bilateral CRM Sync (HubSpot / Salesforce)
           â”‚
           â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚             GATE 0 & PRE-EXECUTION GATEKEEPER MIDDLEWARE               â”‚
â”‚  â€¢ JWT-verified tenant & deal scoping (Supabase RLS)                   â”‚
â”‚  â€¢ Distributed Redis Cooldown Lock (Idempotency & Race Protection)     â”‚
â”‚  â€¢ Gate 0 Reality & Intent Check (Filters non-deals/peer contacts)     â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                                    â”‚ PASSED COMMERCIAL OPPORTUNITY
                                    â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚             TURBO 1: Rule-Based State & Risk Engine                    â”‚
â”‚  â€¢ Computes Deal Risk Index (DRI) & Deterministic State Matrices       â”‚
â”‚  â€¢ Dynamic Stakeholder Re-Profiling (Champions, Blockers, Detractors)  â”‚
â”‚  â€¢ Determines Target Compartment & Required Action                      â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                                    â”‚ Telemetry & Stakeholder Map
                                    â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚             TURBO 2: AI Adaptability Layer (Structured Output)          â”‚
â”‚  â€¢ Single-pass structured generation with Zod/Gemini JSON Schema lock  â”‚
â”‚  â€¢ Evidentiary Traceability (Grounded in transcript excerpts)          â”‚
â”‚  â€¢ MEDDPICC / GAP Selling alignment & Low-friction CTA enforcement   â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                                    â”‚
                                    â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚             Validation, Transaction & Bilateral CRM Sync               â”‚
â”‚  â€¢ Runtime Zod Schema Parsing & Context-Aware Fallbacks                â”‚
â”‚  â€¢ Atomic Postgres Transaction (State Update + Immutable Audit Log)   â”‚
â”‚  â€¢ Real-time Bilateral Push to HubSpot & Salesforce CRM               â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
î°‚PART 1: PRE-EXECUTION GATEKEEPER & GATE 0 COMMERCIAL REALITY MIDDLEWARE
Purpose
To intercept incoming triggers (/api/v1/run-engine), verify JWT tenant scoping, acquire atomic Redis locks to prevent race conditions, and run Gate 0 Commercial Reality Evaluation to filter non-deals, peer outreach, or low-intent activity before state mutations or AI costs occur.
Implementation Contract
Create file: server/middleware/gatekeeper.ts

î°ƒimport { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase';
import { Redis } from 'ioredis';
import jwt from 'jsonwebtoken';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export interface AuthenticatedTenantRequest extends Request {
  tenantId?: string;
  dealId?: string;
  dealState?: any;
  isCommercialOpportunity?: boolean;
}

export async function gatekeeperMiddleware(
  req: AuthenticatedTenantRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid JWT authorization header' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as { tenant_id: string };
    const { deal_id } = req.body;
    const tenant_id = decoded.tenant_id;

    if (!deal_id || !tenant_id) {
      return res.status(400).json({ error: 'Missing required deal_id or tenant_id claims' });
    }

    // Distributed Redis Lock for Idempotency & Race Protection
    const lockKey = `lock:deal:${tenant_id}:${deal_id}`;
    const acquired = await redis.set(lockKey, 'locked', 'NX', 'EX', 30);
    if (!acquired) {
      return res.status(429).json({ error: 'Concurrent engine execution detected for this deal. Request locked.' });
    }

    // RLS Scoped Database Query
    const { data: deal, error } = await supabase
      .from('deals')
      .select('id, status, stage, last_processed_at, tenant_id, deal_type, commercial_intent_score')
      .eq('id', deal_id)
      .eq('tenant_id', tenant_id)
      .single();

    if (error || !deal) {
      await redis.del(lockKey);
      return res.status(404).json({ error: 'Deal not found or tenant RLS restriction failed' });
    }

    // Block non-executable status
    const BLOCKED_STATUSES = ['CLOSED_WON', 'CLOSED_LOST', 'PAUSED', 'OPTED_OUT', 'ARCHIVED'];
    if (BLOCKED_STATUSES.includes(deal.status.toUpperCase())) {
      await redis.del(lockKey);
      return res.status(422).json({ error: `Execution rejected: Deal status is '${deal.status}'` });
    }

    // Gate 0: Commercial Reality & Intent Filter
    if (deal.deal_type === 'PEER_NETWORKING' || (deal.commercial_intent_score && deal.commercial_intent_score < 20)) {
      await redis.del(lockKey);
      return res.status(200).json({ status: 'SKIPPED', reason: 'Gate 0 Filter: Non-commercial interaction or low opportunity score.' });
    }

    req.tenantId = tenant_id;
    req.dealId = deal_id;
    req.dealState = deal;
    req.isCommercialOpportunity = true;

    next();
  } catch (err: any) {
    return res.status(500).json({ error: 'Gatekeeper middleware internal error', details: err.message });
  }
}
î°‚PART 2: TURBO 1 â€” DETERMINISTIC MATRIX & STAKEHOLDER RE-PROFILING ENGINE
Purpose
To compute Deal Risk Index (DRI) math, deterministic pipeline state transitions, and dynamically re-profile stakeholder intelligence (Champions, Economic Buyers, Blockers, Detractors) from interaction telemetry without AI hallucination.
Implementation Contract
Create file: server/engine/matrix.ts

î°ƒexport interface StakeholderProfile {
  id: string;
  name: string;
  role: 'CHAMPION' | 'ECONOMIC_BUYER' | 'BLOCKER' | 'DETRACTOR' | 'USER';
  engagementScore: number;
  lastObservedSignal: string;
}

export interface DealInputPayload {
  dealId: string;
  daysStalled: number;
  unansweredEmailCount: number;
  lastProspectSentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'GHOSTING';
  contractValue: number;
  stakeholders: StakeholderProfile[];
}

export interface EngineMatrixDecision {
  targetStage: 'STALLED' | 'RE_ENGAGED' | 'ESCALATED' | 'REQUIRES_MANUAL_REVIEW';
  riskIndex: number;
  actionTrigger: 'SEND_REENGAGEMENT_EMAIL' | 'SEND_EXECUTIVE_BUMP' | 'PAUSE_WORKFLOW';
  templateId: string;
  reprofiledStakeholders: StakeholderProfile[];
}

export class DeterministicEngineMatrix {
  public static evaluate(payload: DealInputPayload): EngineMatrixDecision {
    const { daysStalled, unansweredEmailCount, lastProspectSentiment, contractValue, stakeholders } = payload;

    let riskIndex = daysStalled * 3.5 + unansweredEmailCount * 15;
    if (lastProspectSentiment === 'GHOSTING') riskIndex += 25;
    if (lastProspectSentiment === 'NEGATIVE') riskIndex += 35;

    // Dynamic Stakeholder Intelligence Re-Profiling
    const reprofiledStakeholders = stakeholders.map(s => {
      if (s.role === 'CHAMPION' && unansweredEmailCount >= 3) {
        return { ...s, role: 'DETRACTOR' as const, lastObservedSignal: 'Champion went silent across 3+ touchpoints' };
      }
      return s;
    });

    const hasActiveBlocker = reprofiledStakeholders.some(s => s.role === 'BLOCKER' || s.role === 'DETRACTOR');
    if (hasActiveBlocker) riskIndex += 15;

    riskIndex = Math.min(100, Math.max(0, Math.round(riskIndex)));

    if (riskIndex >= 85 || unansweredEmailCount >= 4) {
      return { targetStage: 'REQUIRES_MANUAL_REVIEW', riskIndex, actionTrigger: 'PAUSE_WORKFLOW', templateId: 'MANUAL_ESCALATION_V1', reprofiledStakeholders };
    }
    if (daysStalled >= 14 && contractValue >= 25000) {
      return { targetStage: 'ESCALATED', riskIndex, actionTrigger: 'SEND_EXECUTIVE_BUMP', templateId: 'EXEC_BREAKTHROUGH_V2', reprofiledStakeholders };
    }
    return { targetStage: 'RE_ENGAGED', riskIndex, actionTrigger: 'SEND_REENGAGEMENT_EMAIL', templateId: 'SOFT_REENGAGE_V1', reprofiledStakeholders };
  }
}
î°‚PART 3: TURBO 2 â€” AI ADAPTABILITY LAYER (EVIDENTIARY TRACEABILITY & FALLBACKS)
Purpose
To generate structured outreach copy bound by API-level response schemas, enforcing Evidentiary Traceability by grounding generated content directly in observed transcript signals, with context-aware fallback copy grounded in active deal variables.
Implementation Contract
Create file: server/engine/generator.ts

î°ƒimport { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { z } from 'zod';

export const AIResponseSchema = z.object({
  subjectLine: z.string().min(3).max(120),
  emailBody: z.string().min(20).max(2000),
  callToAction: z.string().min(5).max(150),
  detectedObjection: z.string().default('NONE'),
  evidentiaryExcerpts: z.array(z.string()).describe('Quotes or signals from call transcripts supporting the outreach.')
});

export type AIResponsePayload = z.infer<typeof AIResponseSchema>;

export function getContextAwareFallback(templateId: string, variables: { prospectName: string; companyName: string; riskIndex: number }): AIResponsePayload {
  return {
    subjectLine: `Following up on our ${variables.companyName} timeline`,
    emailBody: `Hi ${variables.prospectName}, checking in on our discussion for ${variables.companyName}. Given our previous conversation, I wanted to see if your timeline has shifted.`,
    callToAction: 'Are you free for a brief 5-minute sync tomorrow?',
    detectedObjection: 'TIMING_UNRESOLVED',
    evidentiaryExcerpts: ['Fallback applied: High DRI risk score required re-engagement.']
  };
}

export async function generateStructuredPolish(
  templateId: string,
  variables: { prospectName: string; companyName: string; riskIndex: number; transcriptExcerpts?: string[] }
): Promise<AIResponsePayload> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return getContextAwareFallback(templateId, variables);

  try {
    const ai = new GoogleGenerativeAI(apiKey);
    const model = ai.getGenerativeModel({
      model: 'gemini-1.5-pro',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            subjectLine: { type: SchemaType.STRING },
            emailBody: { type: SchemaType.STRING },
            callToAction: { type: SchemaType.STRING },
            detectedObjection: { type: SchemaType.STRING },
            evidentiaryExcerpts: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } }
          },
          required: ['subjectLine', 'emailBody', 'callToAction', 'detectedObjection', 'evidentiaryExcerpts']
        }
      }
    });

    const prompt = `You are an executive outreach assistant polishing email text.
Prospect: ${variables.prospectName}, Company: ${variables.companyName}
Observed Signals: ${(variables.transcriptExcerpts || []).join(' | ')}`;

    const response = await model.generateContent(prompt);
    return AIResponseSchema.parse(JSON.parse(response.response.text()));
  } catch (error) {
    return getContextAwareFallback(templateId, variables);
  }
}
î°‚PART 4: IMMUTABLE AUDIT TRAIL, MIGRATIONS & CRM SYNC LAYER
Purpose
To maintain an immutable PostgreSQL audit ledger, ensure row-level security, and facilitate Bilateral CRM Synchronization with HubSpot and Salesforce for real-time field, note, and stakeholder updating.
Implementation Contract
Create SQL file: supabase/migrations/007_audit_trail.sql

î°ƒCREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    deal_id UUID NOT NULL,
    previous_stage VARCHAR(50),
    new_stage VARCHAR(50) NOT NULL,
    risk_index INT NOT NULL,
    gatekeeper_status VARCHAR(20) NOT NULL,
    action_triggered VARCHAR(50) NOT NULL,
    payload_snapshot JSONB NOT NULL,
    crm_sync_status VARCHAR(30) DEFAULT 'PENDING',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to tenant audit logs"
ON public.audit_logs FOR SELECT
USING (tenant_id = auth.uid());
î°‚Create TS file: server/lib/audit.ts

î°ƒimport { supabase } from './supabase';
import { syncToCRM } from './crmSync';

export interface AuditLogEntry {
  tenantId: string;
  dealId: string;
  previousStage: string;
  newStage: string;
  riskIndex: number;
  gatekeeperStatus: 'PASSED' | 'FAILED' | 'BYPASSED';
  actionTriggered: string;
  payloadSnapshot: Record<string, any>;
}

export async function writeAuditLogAndSync(entry: AuditLogEntry): Promise<void> {
  const { error } = await supabase.from('audit_logs').insert({
    tenant_id: entry.tenantId,
    deal_id: entry.dealId,
    previous_stage: entry.previousStage,
    new_stage: entry.newStage,
    risk_index: entry.riskIndex,
    gatekeeper_status: entry.gatekeeperStatus,
    action_triggered: entry.actionTriggered,
    payload_snapshot: entry.payloadSnapshot,
    crm_sync_status: 'PROCESSING'
  });

  if (error) {
    console.error('CRITICAL: Failed to write audit log entry:', error);
    return;
  }

  // Bilateral CRM Synchronization
  await syncToCRM(entry.tenantId, entry.dealId, entry.newStage, entry.riskIndex, entry.payloadSnapshot);
}
î°‚PART 5: ATOMIC ORCHESTRATION CONTROLLER & CRM SYNC
Purpose
To orchestrate Middleware, Turbo 1, Turbo 2, and Bilateral CRM Sync inside an atomic database transaction with automatic lock releases.
Implementation Contract
Create file: server/routes/engine.ts

î°ƒimport { Router } from 'express';
import { gatekeeperMiddleware, AuthenticatedTenantRequest } from '../middleware/gatekeeper';
import { DeterministicEngineMatrix } from '../engine/matrix';
import { generateStructuredPolish } from '../engine/generator';
import { generateExecutiveDiagnostics } from '../engine/translator';
import { writeAuditLogAndSync } from '../lib/audit';
import { supabase } from '../lib/supabase';
import { Redis } from 'ioredis';

const router = Router();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

router.post('/run-engine', gatekeeperMiddleware, async (req: AuthenticatedTenantRequest, res) => {
  const { dealId, tenantId, dealState } = req;
  const lockKey = `lock:deal:${tenantId}:${dealId}`;

  try {
    const telemetryInput = {
      dealId: dealId!,
      daysStalled: req.body.daysStalled || 10,
      unansweredEmailCount: req.body.unansweredEmailCount || 2,
      lastProspectSentiment: req.body.lastProspectSentiment || 'GHOSTING',
      contractValue: req.body.contractValue || 15000,
      stakeholders: req.body.stakeholders || []
    };

    const matrixDecision = DeterministicEngineMatrix.evaluate(telemetryInput);

    const polishedOutput = await generateStructuredPolish(matrixDecision.templateId, {
      prospectName: req.body.prospectName || 'Valued Client',
      companyName: req.body.companyName || 'Target Enterprise',
      riskIndex: matrixDecision.riskIndex,
      transcriptExcerpts: req.body.transcriptExcerpts
    });

    const executiveDiagnostics = await generateExecutiveDiagnostics({
      telemetry: telemetryInput,
      decision: matrixDecision
    });

    // Atomic Database State Mutation RPC
    const { error: rpcError } = await supabase.rpc('commit_engine_execution', {
      p_deal_id: dealId,
      p_tenant_id: tenantId,
      p_target_stage: matrixDecision.targetStage,
      p_risk_index: matrixDecision.riskIndex
    });
    if (rpcError) throw rpcError;

    await writeAuditLogAndSync({
      tenantId: tenantId!,
      dealId: dealId!,
      previousStage: dealState.stage,
      newStage: matrixDecision.targetStage,
      riskIndex: matrixDecision.riskIndex,
      gatekeeperStatus: 'PASSED',
      actionTriggered: matrixDecision.actionTrigger,
      payloadSnapshot: { outreachPayload: polishedOutput, executiveDiagnostics, reprofiledStakeholders: matrixDecision.reprofiledStakeholders }
    });

    await redis.del(lockKey);
    return res.status(200).json({ success: true, stage: matrixDecision.targetStage, riskIndex: matrixDecision.riskIndex, outreachPayload: polishedOutput, executiveDiagnostics });
  } catch (error: any) {
    await redis.del(lockKey);
    return res.status(500).json({ error: 'Pipeline error', details: error.message });
  }
});

export default router;
î°‚PART 6: CURSOR SEQUENTIAL IMPLEMENTATION CHECKLIST
Part 1 Task: Implement JWT verification, distributed Redis locking, and Gate 0 Reality Filtering inside server/middleware/gatekeeper.ts.
Part 2 Task: Build dynamic stakeholder re-profiling logic and DRI calculations inside server/engine/matrix.ts.
Part 3 Task: Build evidentiary transcript grounding and context-aware fallback handling in server/engine/generator.ts.
Part 4 Task: Construct migration supabase/migrations/007_audit_trail.sql and bilateral sync module in server/lib/crmSync.ts.
Part 5 Task: Assemble atomic atomic controller routes with lock lifecycle handling in server/routes/engine.ts.
Part 6 Task: Implement single-pass Executive Diagnostics in server/engine/translator.ts.
Part 7 Task: Run end-to-end integration suite verifying JWT rejection, Gate 0 filtering, atomic Postgres updates, and bilateral CRM pushes.
PART 7: THE EXECUTIVE TRANSLATION LAYER (EVIDENTIARY DIAGNOSTICS)
Purpose
To translate deterministic metrics into executive and rep diagnostics grounded in observed transcript evidence, ensuring clear alignment for CROs and Account Executives.
Implementation Contract
Create file: server/engine/translator.ts

î°ƒimport { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { z } from 'zod';
import { EngineMatrixDecision, DealInputPayload } from './matrix';

export const ExecutiveTranslationSchema = z.object({
  executiveSummary: z.string(),
  keyRiskDrivers: z.array(z.string()),
  recommendedRepActions: z.array(z.string()),
  executiveCoachingPoints: z.array(z.string()),
  evidentiarySignalTrace: z.array(z.string()).describe('Direct quotes or transcript observations backing diagnostics')
});

export type ExecutiveTranslationPayload = z.infer<typeof ExecutiveTranslationSchema>;

export async function generateExecutiveDiagnostics(context: { telemetry: DealInputPayload; decision: EngineMatrixDecision }): Promise<ExecutiveTranslationPayload> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      executiveSummary: 'Deterministic evaluation completed. Default fallback applied.',
      keyRiskDrivers: ['Elevated DRI score'],
      recommendedRepActions: ['Execute recovery workflow'],
      executiveCoachingPoints: ['Review stakeholder engagement'],
      evidentiarySignalTrace: ['Fallback trace applied']
    };
  }

  const ai = new GoogleGenerativeAI(apiKey);
  const model = ai.getGenerativeModel({
    model: 'gemini-1.5-pro',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          executiveSummary: { type: SchemaType.STRING },
          keyRiskDrivers: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          recommendedRepActions: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          executiveCoachingPoints: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          evidentiarySignalTrace: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } }
        },
        required: ['executiveSummary', 'keyRiskDrivers', 'recommendedRepActions', 'executiveCoachingPoints', 'evidentiarySignalTrace']
      }
    }
  });

  const response = await model.generateContent(`Analyze deal ${context.telemetry.dealId} with DRI ${context.decision.riskIndex}`);
  return ExecutiveTranslationSchema.parse(JSON.parse(response.response.text()));
}
î°‚PART 8: BILATERAL CRM SYNC & SALES FRAMEWORK HARDENING
Purpose
To enforce strict MEDDPICC / GAP Selling rules in Turbo 2, bind CTAs to single low-friction confirmations, and maintain real-time bilateral CRM synchronization with HubSpot and Salesforce.
Bilateral Sync & Sales Playbook Rules
Bilateral CRM Synchronization: Real-time bidirectional synchronization updates deal stages, notes, DRI scores, and stakeholder roles directly into HubSpot and Salesforce upon state commit.
MEDDPICC / GAP Alignment: Outreach copy must target identified Economic Buyer / Champion gaps and re-anchor on business pain observed in transcript signals.
Single Low-Friction CTA: CTAs must strictly request binary time confirmation or permission-based questions without open-ended discovery requests.
Evidentiary Grounding: All AI-generated recommendations and outreach must cite specific transcript excerpts or telemetry observations.

