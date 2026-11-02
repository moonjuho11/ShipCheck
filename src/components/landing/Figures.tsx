/** Linear-style isometric line art. Stroke-only, so it reads as a technical drawing. */
const S = { fill: "none", stroke: "rgb(255 255 255 / 0.32)", strokeWidth: 1, strokeLinejoin: "round" as const };

function iso(x: number, y: number, z: number): [number, number] {
  return [150 + (x - y) * 0.866, 120 + (x + y) * 0.5 - z];
}
const pts = (...p: [number, number, number][]) => p.map((q) => iso(...q).join(",")).join(" ");

function Box({ x, y, z, w, d, h, accent = false }: { x: number; y: number; z: number; w: number; d: number; h: number; accent?: boolean }) {
  const st = accent ? { ...S, stroke: "rgb(62 232 143 / 0.8)" } : S;
  return (
    <g>
      <polygon {...st} points={pts([x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h])} />
      <polyline {...st} points={pts([x, y + d, z + h], [x, y + d, z], [x + w, y + d, z], [x + w, y, z], [x + w, y, z + h])} />
      <line {...st} x1={iso(x + w, y + d, z)[0]} y1={iso(x + w, y + d, z)[1]} x2={iso(x + w, y + d, z + h)[0]} y2={iso(x + w, y + d, z + h)[1]} />
    </g>
  );
}

/** FIG 0.1 — a sealed sandbox: the code goes in, nothing runs, the box is discarded. */
export function FigSandbox() {
  return (
    <svg viewBox="0 0 300 240" className="h-full w-full">
      {[0, 1, 2, 3, 4].map((i) => <Box key={i} x={-60} y={-60} z={-40 + i * 9} w={120} d={120} h={0.01} />)}
      <Box x={-60} y={-60} z={10} w={120} d={120} h={50} />
      <Box x={-24} y={-24} z={60} w={48} d={48} h={22} accent />
      {[-36, -12, 12, 36].map((o) => (
        <line key={o} {...S} strokeDasharray="2 4" x1={iso(o, -60, 60)[0]} y1={iso(o, -60, 60)[1]} x2={iso(o, -60, 10)[0]} y2={iso(o, -60, 10)[1]} />
      ))}
    </svg>
  );
}

/** FIG 0.2 — stacked cards: each finding, explained. */
export function FigExplain() {
  return (
    <svg viewBox="0 0 300 240" className="h-full w-full">
      {[0, 1, 2, 3].map((i) => <Box key={i} x={-70 + i * 10} y={-50 + i * 10} z={i * 26} w={110} d={70} h={6} accent={i === 3} />)}
      {[0, 1, 2].map((i) => {
        const [x1, y1] = iso(-50 + 30, -20 + 30 + i * 12, 84);
        const [x2, y2] = iso(-50 + 30 + 60 - i * 15, -20 + 30 + i * 12, 84);
        return <line key={i} stroke="rgb(62 232 143 / 0.6)" strokeWidth="1.5" strokeLinecap="round" x1={x1} y1={y1} x2={x2} y2={y2} />;
      })}
    </svg>
  );
}

/** FIG 0.3 — one prompt in, a fixed layer out. */
export function FigFix() {
  return (
    <svg viewBox="0 0 300 240" className="h-full w-full">
      {Array.from({ length: 9 }).map((_, i) => (
        <Box key={i} x={-80 + i * 14} y={-30} z={i % 3 === 0 ? 0 : 0} w={6} d={60} h={30 + i * 8} accent={i === 8} />
      ))}
      <Box x={-90} y={-40} z={-6} w={150} d={80} h={0.01} />
    </svg>
  );
}
