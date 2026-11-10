function band(value: number, cap = 100): string {
  const ratio = Math.max(0, Math.min(1, value / Math.max(1, cap)));
  if (ratio < 0.25) return "low";
  if (ratio < 0.55) return "moderate";
  if (ratio < 0.8) return "elevated";
  return "high";
}

/** Intent level already computed, capped by the constraint named in the data. */
export function intentInputTrace(
  rawIntent: number,
  constraint: number,
  effectiveIntent: number,
  constraintName = ""
): string {
  const level = band(effectiveIntent);
  const titled = level.charAt(0).toUpperCase() + level.slice(1);
  const named = constraintName.replace(/\s+/g, " ").trim();
  const cap = named || (constraint > 0 ? "constraint pressure" : "the open constraint");
  const line = `${titled} but capped by ${cap}.`;
  if (rawIntent === 0) {
    return `${line} That is not a finding that the buyer has no interest.`;
  }
  return line;
}

export function pinnedEquilibriumNote(state: string, structural: number, constraint: number): string | null {
  if (state !== "PINNED") return null;
  return `PINNED means the extracted structural weight ${structural} and constraint weight ${constraint} sum to at least 160. It is not a finding that the buyer rejected the deal.`;
}
