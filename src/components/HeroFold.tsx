import { useId } from "react";
import { HERO_PRIMARY_CTA, HERO_PRIMARY_CTA_NOTE } from "../lib/cta";

const OUTCOMES = [
  {
    title: "Recover more existing pipeline",
    body: "A stalled deal is revenue you already started. Find the ones still worth saving.",
  },
  {
    title: "Spend time where it can still close",
    body: "See which deals deserve the next call before the forecast.",
  },
  {
    title: "Stop working a flat no",
    body: "Cut the deal that will not move, instead of carrying it another quarter.",
  },
  {
    title: "Walk in with the next conversation",
    body: "Sales leadership gets a concrete path, not another summary of the call.",
  },
] as const;

export default function HeroFold({ onScan }: { onScan: () => void }) {
  const headingId = useId();

  return (
    <>
      <section
        id="outcomes"
        aria-labelledby={headingId}
        className="flex min-h-svh flex-col items-start px-5 pb-16 pt-10 sm:px-8 sm:pt-14 md:pb-20 lg:px-10 lg:pt-16"
      >
        <p className="mb-6 inline-flex w-fit items-center rounded-full border border-[#3dd6c6]/30 bg-[#0c1433] px-3 py-1 font-[var(--mono)] text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#3dd6c6]">
          Purpose-built for Sales Managers
        </p>
        <h1
          id={headingId}
          className="max-w-3xl text-[clamp(1.85rem,3.2vw,2.85rem)] font-bold leading-[1.12] tracking-tight text-white"
        >
          Which stalled deals are actually going to close?
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-200">
          You can see what is stalled. The brief says recoverable or a flat no, names the blocker, and
          gives the next action for the forecast call.
        </p>
        <button type="button" className="run-button marketing-inline-cta mt-8" onClick={onScan}>
          {HERO_PRIMARY_CTA}
        </button>
        <p className="mt-2 text-sm text-slate-400">{HERO_PRIMARY_CTA_NOTE}</p>
      </section>
      <section
        className="border-t border-white/10 px-5 py-8 sm:px-8 md:py-10 lg:px-10"
        aria-label="What this changes"
      >
        <ul className="grid list-none gap-3 p-0 sm:grid-cols-2">
          {OUTCOMES.map((item) => (
            <li key={item.title} className="rounded-2xl border border-[#3dd6c6]/30 bg-[#0c1433] p-4">
              <h2 className="text-base font-semibold leading-snug text-white">{item.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{item.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
