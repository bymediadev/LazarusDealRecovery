import { useEffect, useState } from "react";
import { navigateApp } from "../lib/appRoute";
import { qualifySharePath, readArrival, type Arrival } from "./arrival";
import OffHoursFunnel from "./OffHoursFunnel";
import "./off-hours.css";

type Props = {
  mode: "page" | "dock";
  onOpenPortal?: () => void;
};

export default function OffHoursQualifier({ mode, onOpenPortal }: Props) {
  const [arrival] = useState<Arrival>(() =>
    typeof window === "undefined"
      ? "site"
      : readArrival(window.location.search, document.referrer, window.location.pathname)
  );
  const [open, setOpen] = useState(mode === "page");

  useEffect(() => {
    if (mode !== "dock" || typeof window === "undefined") return;
    const path = qualifySharePath(window.location.search, document.referrer);
    if (!path) return;
    navigateApp(path);
  }, [mode]);

  const funnel = (
    <OffHoursFunnel active={mode === "page" || open} arrival={arrival} onOpenPortal={onOpenPortal} />
  );

  if (mode === "page") {
    return (
      <section className="ohq-page" aria-label="Off-hours forecast triage">
        {funnel}
      </section>
    );
  }

  return (
    <div className="ohq-dock">
      {open && (
        <div className="ohq-panel" role="dialog" aria-label="Off-hours forecast triage">
          <button type="button" className="ohq-close" onClick={() => setOpen(false)}>
            Close
          </button>
          {funnel}
          <button type="button" className="btn-secondary" onClick={() => navigateApp("/qualify")}>
            Open full page
          </button>
        </div>
      )}
      <button
        type="button"
        className="ohq-launch"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        Off-hours triage
      </button>
    </div>
  );
}
