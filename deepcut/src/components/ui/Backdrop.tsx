/** Fixed atmospheric layer: drifting dust specks and pixel rock strata. Purely decorative. */
function lcg(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

const rand = lcg(7);
const SPECKS = Array.from({ length: 26 }, () => ({
  left: rand() * 100,
  top: rand() * 100,
  size: rand() < 0.2 ? 3 : 2,
  delay: -rand() * 18,
  dur: 14 + rand() * 12,
  warm: rand() < 0.35,
}));

/* Stepped rock silhouettes, 3 layers, built once. */
function strata(seed: number, base: number, amp: number) {
  const r = lcg(seed);
  let d = `M0 40 L0 ${base}`;
  let y = base;
  for (let x = 0; x <= 400; x += 8) {
    if (r() < 0.45) y = Math.max(base - amp, Math.min(base + amp, y + (r() < 0.5 ? -2 : 2)));
    d += ` L${x} ${y} L${x + 8} ${y}`;
  }
  return d + ' L400 40 Z';
}
const LAYERS = [strata(3, 14, 6), strata(11, 22, 5), strata(23, 30, 4)];

export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      {SPECKS.map((p, i) => (
        <i
          key={i}
          className={`speck${p.warm ? ' speck--warm' : ''}`}
          style={{ left: `${p.left}%`, top: `${p.top}%`, width: p.size, height: p.size, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s` }}
        />
      ))}
      <svg className="strata" viewBox="0 0 400 40" preserveAspectRatio="none" shapeRendering="crispEdges">
        <path d={LAYERS[0]} fill="#1b1e24" />
        <path d={LAYERS[1]} fill="#15171c" />
        <path d={LAYERS[2]} fill="#101216" />
      </svg>
    </div>
  );
}
