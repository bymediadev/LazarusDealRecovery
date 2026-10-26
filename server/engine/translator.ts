/**
 * Executive translation layer — Math→Text diagnostics grounded in evidence.
 */

import { z } from "zod";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { geminiApiKey } from "../llmProviders.js";
import type { EngineMatrixDecision, RefinedDealInputPayload } from "./matrix.js";

export const ExecutiveTranslationSchema = z.object({
  executiveSummary: z.string(),
  keyRiskDrivers: z.array(z.string()),
  recommendedRepActions: z.array(z.string()),
  executiveCoachingPoints: z.array(z.string()),
  evidentiarySignalTrace: z.array(z.string()),
});

export type ExecutiveTranslationPayload = z.infer<typeof ExecutiveTranslationSchema>;

function deterministicFallback(context: {
  telemetry: RefinedDealInputPayload;
  decision: EngineMatrixDecision;
  excerpts?: string[];
}): ExecutiveTranslationPayload {
  const b = context.decision.breakdown;
  return {
    executiveSummary: `Deal ${context.telemetry.dealId ?? "n/a"} scored DRI ${context.decision.dri} (${context.decision.targetStage}).`,
    keyRiskDrivers: [
      `Velocity Δ=${b.deltaVelocity}`,
      `Entropy Φ=${b.phiEntropy}`,
      `Sentiment Ψ=${b.psiSentiment}`,
      `Stakeholder Γ=${b.gammaStakeholder}`,
    ],
    recommendedRepActions: [
      context.decision.actionTrigger === "SUPPRESS_OUTREACH"
        ? "Do not outreach — Gate 0 suppressed"
        : "Queue a grounded pattern interrupt for human approval",
      "Confirm Economic Buyer access before next forecast call",
    ],
    executiveCoachingPoints: [
      "Inspect stakeholder re-profiles before escalating",
      "Treat Legal/Security stage latency with stage μ/σ forgiveness",
    ],
    evidentiarySignalTrace:
      context.excerpts?.length
        ? context.excerpts
        : ["Deterministic fallback: matrix coefficients only"],
  };
}

export async function generateExecutiveDiagnostics(context: {
  telemetry: RefinedDealInputPayload;
  decision: EngineMatrixDecision;
  excerpts?: string[];
}): Promise<ExecutiveTranslationPayload> {
  const fallback = deterministicFallback(context);
  const apiKey = geminiApiKey();
  if (!apiKey || (process.env.MODEL_PROVIDER || "").toUpperCase() === "OFF") {
    return fallback;
  }

  try {
    const ai = new GoogleGenerativeAI(apiKey);
    const model = ai.getGenerativeModel({
      model: process.env.GEMINI_ENGINE_MODEL || "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            executiveSummary: { type: SchemaType.STRING },
            keyRiskDrivers: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
            recommendedRepActions: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING },
            },
            executiveCoachingPoints: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING },
            },
            evidentiarySignalTrace: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING },
            },
          },
          required: [
            "executiveSummary",
            "keyRiskDrivers",
            "recommendedRepActions",
            "executiveCoachingPoints",
            "evidentiarySignalTrace",
          ],
        },
      },
    });

    const prompt = `Translate deterministic deal risk into CRO/AE diagnostics.
Do not invent facts. Cite only provided excerpts and coefficients.
Deal: ${context.telemetry.dealId}
DRI: ${context.decision.dri}
Stage: ${context.decision.targetStage}
Breakdown: ${JSON.stringify(context.decision.breakdown)}
Excerpts: ${(context.excerpts || []).join(" | ")}`;

    const response = await model.generateContent(prompt);
    return ExecutiveTranslationSchema.parse(JSON.parse(response.response.text()));
  } catch (err) {
    console.error("Executive translator fallback:", err);
    return fallback;
  }
}
