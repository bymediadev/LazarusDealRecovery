# Lazarus Framework Contract

Canonical contract for the Two-Turbo / Gate 0 recovery engine. Source specs live beside this file. Locked product decisions:

- **DRI:** Non-linear Operational DRI (Δ / Φ / Ψ / Γ) is the sole Deal Risk Index in reports, CRM, and UI.
- **Ghost-Buster:** Review queue only — generate drafts for rep approve/edit/cancel. No timed auto-send.
- **Force Interaction:** Gemini still maps transcript evidence into forces and stakeholders (Text→Math input). It does not write the DRI.

## Pipeline

```
Ingest / webhook / CRM sync
  → Gate 0 commercial reality (Ω)
  → Turbo 2 Text→Math (telemetry extract)
  → Turbo 1 non-linear DRI matrix + stakeholder re-profile
  → Turbo 2 Math→Text (outreach polish + executive diagnostics)
  → Zod validate + audit commit + bilateral CRM sync
  → Product hooks (briefing / scorecard / Ghost-Buster queue / board report)
```

## Gate 0 (Ω)

Skip before AI cost or state mutation when:

- `deal_type === PEER_NETWORKING`, or
- `commercial_intent_score < 20`

Response: `NOT_A_DEAL`, `DRI = 0`, `action = SUPPRESS_OUTREACH`.

Blocked statuses: `CLOSED_WON`, `CLOSED_LOST`, `PAUSED`, `OPTED_OUT`, `ARCHIVED`.

## DRI formula

Stage benchmarks (μ, σ): Discovery 7/2, Demo 10/3, Proposal 10/3, Legal/Security 21/7.

Globals: λ = 0.85, β = 35, α = 0.5, τ = 14 days.

Authority weights Wᵢ: Economic Buyer 0.45, Champion 0.30, Blocker/Detractor 0.15, User 0.10.

```
Z_stall = max(0, (t_stalled − μ_stage) / σ_stage)
Δ = 100 × (1 − exp(−λ × Z_stall))
Φ = β × (1 − exp(−α × u))
Ψ = Ψ_base × exp(−(ln 2 / τ) × Δt)
Γ = 15 × Σ W_i for blockers/detractors
DRI = clamp(round(Δ + Φ + Ψ + Γ), 0, 100)
```

Ψ_base: POSITIVE 0, NEUTRAL 12, GHOSTING 25, NEGATIVE 40.

Champion silent across ≥3 unanswered touchpoints → re-profile to DETRACTOR.

## Calibration fixtures (must stay green)

| Model | Expected |
|-------|----------|
| 1 Peer / Gate 0 | Ω=0, NOT_A_DEAL, SUPPRESS_OUTREACH |
| 2 On-track proposal | DRI 14, RE_ENGAGED |
| 3 Apex champion entropy | raw ~131.8 → DRI 100, REQUIRES_MANUAL_REVIEW |
| 4 Legal forgiveness | DRI 63, RE_ENGAGED |

## Product hooks

1. Morning briefing (7:30 local) — drift alerts + approve-ready actions.
2. Resurrection scorecard — DRI drop / reply broadcasts + leaderboard.
3. Ghost-Buster — queue drafts when DRI > 85 or unanswered ≥ 3; human approve required.
4. Board leakage report — pipeline risk $, DRI distribution, rescued ARR, root causes.

## Dual branch

- **Cloud:** www.getldr.ca + Render API (existing).
- **Standalone:** `STANDALONE_INSTALL=true`, client Supabase/Gemini, white-label tokens, zero Lazarus upstream telemetry.

## Code map

| Concern | Path |
|---------|------|
| Config / benchmarks | `server/engine/config.ts` |
| Gate 0 + DRI matrix | `server/engine/matrix.ts` |
| Telemetry extract | `server/engine/telemetryExtract.ts` |
| Outreach polish | `server/engine/generator.ts` |
| Executive diagnostics | `server/engine/translator.ts` |
| Hooks | `server/engine/hooks.ts` |
| Gatekeeper | `server/middleware/gatekeeper.ts` |
| Orchestrator | `server/routes/engine.ts` |
| Audit migration | `supabase/migrations/022_engine_audit_trail.sql` |
