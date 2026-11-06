/**
 * Shared authority / veto selectors. Technical veto, economic decision-maker,
 * and absent authority are distinct — never treated as interchangeable.
 */

export type AuthorityRoleKind =
  | "technical_veto"
  | "economic_decision_maker"
  | "absent_decision_maker"
  | "aligned_champion"
  | "suppressed_champion"
  | "hidden_detractor"
  | "unknown";

export interface AuthorityPerson {
  name: string;
  role?: string;
  persona_type?: string;
  stance?: string;
  authority_level?: string;
  evidence?: string;
}

function labelOf(person: AuthorityPerson): string {
  return `${person.persona_type ?? ""} ${person.stance ?? ""} ${person.authority_level ?? ""} ${person.role ?? ""}`;
}

export function authorityRoleKind(person: AuthorityPerson): AuthorityRoleKind {
  const label = labelOf(person);
  if (/technical_veto|vp of infrastructure|ot network|architecture/i.test(label) && /absent|missed|not on/i.test(`${label} ${person.evidence ?? ""}`)) {
    return "technical_veto";
  }
  if (/technical_veto/i.test(person.authority_level ?? "")) return "technical_veto";
  if (/absent decision maker/i.test(label)) return "absent_decision_maker";
  if (/hidden detractor/i.test(label)) return "hidden_detractor";
  if (/economic owner|economic buyer|decision maker/i.test(label) && !/absent/i.test(label)) {
    return "economic_decision_maker";
  }
  if (/suppressed champion/i.test(label)) return "suppressed_champion";
  if (/aligned champion/i.test(label)) return "aligned_champion";
  if (/vp of infrastructure|signs off|ot network|architecture/i.test(`${label} ${person.evidence ?? ""}`)) {
    return "technical_veto";
  }
  return "unknown";
}

/** Identified technical approval dependency — not the economic DM and not "missing authority." */
export function findTechnicalVetoHolder(people: AuthorityPerson[]): AuthorityPerson | null {
  return people.find((person) => authorityRoleKind(person) === "technical_veto") ?? null;
}

export function findEconomicDecisionMaker(people: AuthorityPerson[]): AuthorityPerson | null {
  return people.find((person) => authorityRoleKind(person) === "economic_decision_maker") ?? null;
}

/**
 * Invisible veto / missing authority only.
 * An identified technical veto holder is NOT treated as missing authority.
 */
export function findInvisibleVetoOrMissingAuthority(people: AuthorityPerson[]): AuthorityPerson | null {
  return (
    people.find((person) => authorityRoleKind(person) === "hidden_detractor") ??
    people.find((person) => authorityRoleKind(person) === "absent_decision_maker") ??
    null
  );
}

export function formatAuthorityLabel(person: AuthorityPerson): string {
  const kind = authorityRoleKind(person);
  const role = person.role?.trim();
  const bits = [person.name.trim()];
  if (role) bits.push(`(${role})`);
  if (kind === "technical_veto") bits.push("— technical approval dependency");
  else if (kind === "absent_decision_maker") bits.push("— absent decision maker");
  else if (kind === "hidden_detractor") bits.push("— hidden detractor");
  else if (kind === "economic_decision_maker") bits.push("— economic decision-maker");
  else if (person.persona_type || person.stance) bits.push(`— ${person.persona_type || person.stance}`);
  return bits.join(" ");
}
