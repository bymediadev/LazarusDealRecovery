function band(value: number, cap = 100): string {
  const ratio = Math.max(0, Math.min(1, value / Math.max(1, cap)));
  if (ratio < 0.25) return "low";
  if (ratio < 0.55) return "moderate";
  if (ratio < 0.8) return "elevated";
  return "high";
}

/** Explains the intent inputs already used. Does not expose raw multipliers. */
export function intentInputTrace(rawIntent: number, constraint: number, effectiveIntent: number): string {
  const rule = `Effective intent is ${band(effectiveIntent)} after constraint pressure (${band(constraint)}) is applied to raw intent (${band(rawIntent)}).`;
  if (rawIntent === 0) {
    return `${rule} Raw intent is low because no Intent force was extracted. That is not a finding that the buyer has no interest.`;
  }
  return `${rule} Raw intent is the strongest Intent force. It is separate from the ability to get approval.`;
}

export function pinnedEquilibriumNote(state: string, structural: number, constraint: number): string | null {
  if (state !== "PINNED") return null;
  return `PINNED means the extracted structural weight ${structural} and constraint weight ${constraint} sum to at least 160. It is not a finding that the buyer rejected the deal.`;
}
