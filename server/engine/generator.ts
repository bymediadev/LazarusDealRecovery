/**
 * Turbo 2 Math→Text — outreach polish with evidentiary grounding.
 * Ghost-Buster drafts go to review queue only (no auto-send).
 */

import { z } from "zod";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { geminiApiKey } from "../llmProviders.js";

export const AIResponseSchema = z.object({
  subjectLine: z.string().min(3).max(120),
  emailBody: z.string().min(20).max(2000),
  callToAction: z.string().min(5).max(150),
  detectedObjection: z.string().default("NONE"),
  evidentiaryExcerpts: z.array(z.string()).min(1),
});

export type AIResponsePayload = z.infer<typeof AIResponseSchema>;

export function getContextAwareFallback(
  templateId: string,
  variables: {
    prospectName: string;
    companyName: string;
    riskIndex: number;
    transcriptExcerpts?: string[];
  }
): AIResponsePayload {
  const excerpt =
    variables.transcriptExcerpts?.[0] ??
    `Fallback applied: High DRI (${variables.riskIndex}) required re-engagement.`;
  return {
    subjectLine: `Following up on our ${variables.companyName} timeline`,
    emailBody: `Hi ${variables.prospectName},\n\nChecking in on our discussion for ${variables.companyName}. Given where things stood, I wanted to confirm whether the timeline has shifted.\n\nContext we noted: "${excerpt.slice(0, 180)}"`,
    callToAction: "Are you free for a brief 5-minute sync tomorrow?",
    detectedObjection: templateId.includes("EXEC") ? "EXECUTIVE_ACCESS" : "TIMING_UNRESOLVED",
    evidentiaryExcerpts: [excerpt],
  };
}

async function generateViaOllama(
  prompt: string,
  fallback: AIResponsePayload
): Promise<AIResponsePayload> {
  const base = process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1";
  const model = process.env.OLLAMA_MODEL || "qwen2.5:7b";
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return fallback;
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content || "{}";
    return AIResponseSchema.parse(JSON.parse(content));
  } catch {
    return fallback;
  }
}

export async function generateStructuredPolish(
  templateId: string,
  variables: {
    prospectName: string;
    companyName: string;
    riskIndex: number;
    transcriptExcerpts?: string[];
  }
): Promise<AIResponsePayload> {
  const fallback = getContextAwareFallback(templateId, variables);
  const provider = (process.env.MODEL_PROVIDER || "GEMINI").toUpperCase();

  const prompt = `You are an executive outreach assistant for B2B deal recovery.
Rules:
- MEDDPICC / GAP: target Economic Buyer or Champion gaps; re-anchor on observed pain.
- Single low-friction CTA: binary time confirmation or permission question only.
- Every claim must cite an evidentiary excerpt from Observed Signals.
- Do not invent dates, approvals, or stakeholders.
Return JSON: subjectLine, emailBody, callToAction, detectedObjection, evidentiaryExcerpts.

Template: ${templateId}
Prospect: ${variables.prospectName}
Company: ${variables.companyName}
DRI: ${variables.riskIndex}
Observed Signals: ${(variables.transcriptExcerpts || []).join(" | ") || "(none)"}`;

  if (provider === "OLLAMA") {
    return generateViaOllama(prompt, fallback);
  }

  const apiKey = geminiApiKey();
  if (!apiKey) return fallback;

  try {
    const ai = new GoogleGenerativeAI(apiKey);
    const modelName = process.env.GEMINI_ENGINE_MODEL || "gemini-2.5-flash";
    const model = ai.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            subjectLine: { type: SchemaType.STRING },
            emailBody: { type: SchemaType.STRING },
            callToAction: { type: SchemaType.STRING },
            detectedObjection: { type: SchemaType.STRING },
            evidentiaryExcerpts: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING },
            },
          },
          required: [
            "subjectLine",
            "emailBody",
            "callToAction",
            "detectedObjection",
            "evidentiaryExcerpts",
          ],
        },
      },
    });
    const response = await model.generateContent(prompt);
    return AIResponseSchema.parse(JSON.parse(response.response.text()));
  } catch (err) {
    console.error("Circuit-breaker activated in AI adaptability layer:", err);
    return fallback;
  }
}
