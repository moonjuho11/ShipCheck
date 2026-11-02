"use client";

/**
 * Linear-style isometric line art that draws itself in (stroke pathLength 0 → 1)
 * the first time each figure scrolls into view.
 */
import type { ReactNode } from "react";
import { EASE, m } from "../motion";

const STROKE = "rgb(255 255 255 / 0.32)";
const ACCENT = "rgb(255 255 255 / 0.7)";
const base = { fill: "none", strokeWidth: 1, strokeLinejoin: "round" as const };

const fade = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.6, delay: 0.6 } } };

const draw = {
  hidden: { pathLength: 0, opacity: 0 },
  show: { pathLength: 1, opacity: 1, transition: { pathLength: { duration: 1.1, ease: EASE }, opacity: { duration: 0.2 } } },
};

function iso(x: number, y: number, z: number): [number, number] {
  return [150 + (x - y) * 0.866, 120 + (x + y) * 0.5 - z];
}
const pts = (...p: [number, number, number][]) => p.map((q) => iso(...q).join(",")).join(" ");

function Box({ x, y, z, w, d, h, accent = false }: { x: number; y: number; z: number; w: number; d: number; h: number; accent?: boolean }) {
  const st = { ...base, stroke: accent ? ACCENT : STROKE };
  const [lx1, ly1] = iso(x + w, y + d, z), [lx2, ly2] = iso(x + w, y + d, z + h);
  return (
    <g>
      <m.polygon {...st} variants={draw} points={pts([x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h])} />
      <m.polyline {...st} variants={draw} points={pts([x, y + d, z + h], [x, y + d, z], [x + w, y + d, z], [x + w, y, z], [x + w, y, z + h])} />
      <m.line {...st} variants={draw} x1={lx1} y1={ly1} x2={lx2} y2={ly2} />
    </g>
  );
}

function Figure({ children }: { children: ReactNode }) {
  return (
    <m.svg
      viewBox="0 0 300 240"
      className="h-full w-full"
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
    >
      {children}
    </m.svg>
  );
}

/** FIG 0.1 — a sealed sandbox: the code goes in, nothing runs, the box is discarded. */
export function FigSandbox() {
  return (
    <Figure>
      {[0, 1, 2, 3, 4].map((i) => <Box key={i} x={-60} y={-60} z={-40 + i * 9} w={120} d={120} h={0.01} />)}
      <Box x={-60} y={-60} z={10} w={120} d={120} h={50} />
      <Box x={-24} y={-24} z={60} w={48} d={48} h={22} accent />
      {[-36, -12, 12, 36].map((o) => (
        <m.line key={o} {...base} stroke={STROKE} strokeDasharray="2 4" variants={fade}
          x1={iso(o, -60, 60)[0]} y1={iso(o, -60, 60)[1]} x2={iso(o, -60, 10)[0]} y2={iso(o, -60, 10)[1]} />
      ))}
    </Figure>
  );
}

/** FIG 0.2 — stacked cards: each finding, explained. */
export function FigExplain() {
  return (
    <Figure>
      {[0, 1, 2, 3].map((i) => <Box key={i} x={-70 + i * 10} y={-50 + i * 10} z={i * 26} w={110} d={70} h={6} accent={i === 3} />)}
      {[0, 1, 2].map((i) => {
        const [x1, y1] = iso(-20, 10 + i * 12, 84);
        const [x2, y2] = iso(40 - i * 15, 10 + i * 12, 84);
        return <m.line key={i} {...base} stroke={ACCENT} strokeWidth={1.5} strokeLinecap="round" variants={draw} x1={x1} y1={y1} x2={x2} y2={y2} />;
      })}
    </Figure>
  );
}

/** FIG 0.3 — one prompt in, a fixed layer out. */
export function FigFix() {
  return (
    <Figure>
      <Box x={-90} y={-40} z={-6} w={150} d={80} h={0.01} />
      {Array.from({ length: 9 }).map((_, i) => (
        <Box key={i} x={-80 + i * 14} y={-30} z={0} w={6} d={60} h={30 + i * 8} accent={i === 8} />
      ))}
    </Figure>
  );
}
