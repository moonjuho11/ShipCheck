/** Raycast-style diagonal light streaks (in ShipCheck green) over a fading Firecrawl grid. */
export function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="bg-grid fade-edges absolute inset-0 opacity-70" />
      <div className="absolute inset-x-0 top-0 h-[780px] [mask-image:radial-gradient(ellipse_60%_65%_at_50%_42%,black,transparent)]">
        {[
          { left: "14%", delay: "0s", o: 0.35, w: 46 },
          { left: "24%", delay: "-4s", o: 0.7, w: 90 },
          { left: "34%", delay: "-8s", o: 0.5, w: 60 },
          { left: "44%", delay: "-2s", o: 0.9, w: 120 },
          { left: "55%", delay: "-6s", o: 0.75, w: 80 },
          { left: "65%", delay: "-10s", o: 0.55, w: 110 },
          { left: "76%", delay: "-3s", o: 0.4, w: 56 },
          { left: "86%", delay: "-7s", o: 0.25, w: 40 },
        ].map((s, i) => (
          <div key={i} className="streak" style={{ left: s.left, animationDelay: s.delay, opacity: s.o, width: s.w }} />
        ))}
        <div className="grain absolute inset-0" />
      </div>
      <div className="absolute inset-x-0 top-[520px] h-[300px] bg-gradient-to-b from-transparent to-canvas" />
    </div>
  );
}
