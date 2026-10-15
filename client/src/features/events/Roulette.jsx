import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/http';

const R = 98;
const SHADES = ['#17356A', '#1F4A93', '#2B5FBF'];
const SPIN_MS = 5200; // чуть больше CSS-перехода .wheel (5s)

const point = (deg, r) => { const t = (deg * Math.PI) / 180; return [r * Math.sin(t), -r * Math.cos(t)]; };
const restAngle = (i, a, jitter) => 360 - (i + 0.5) * a + jitter;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function Segment({ name, i, n }) {
  const a = 360 / n;
  let fill = SHADES[i % 3];
  if (i === n - 1 && i % 3 === 0 && n > 1) fill = '#3B7BFF';
  const [x1, y1] = point(i * a, R);
  const [x2, y2] = point((i + 1) * a, R);
  const label = name.length > 14 ? `${name.slice(0, 13)}…` : name;
  return (
    <>
      {n === 1
        ? <circle r={R} fill={fill} />
        : <path d={`M0 0 L${x1} ${y1} A${R} ${R} 0 ${a > 180 ? 1 : 0} 1 ${x2} ${y2} Z`} fill={fill} stroke="#0A1730" strokeWidth="1" />}
      <text transform={`rotate(${(i + 0.5) * a - 90}) translate(24 0)`} fill="#fff"
        fontSize={Math.max(4, Math.min(9, 150 / n))} dominantBaseline="middle">{label}</text>
    </>
  );
}

// Результат всегда выбирает сервер; колесо лишь красиво докручивается до него
export default function Roulette({ eventId, names, spunIndex, onSpun }) {
  const n = names.length;
  const a = 360 / n;
  const [rotation, setRotation] = useState(spunIndex >= 0 ? restAngle(spunIndex, a, 0) : 0);
  const [instant, setInstant] = useState(spunIndex >= 0);
  const [spinning, setSpinning] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);

  const segments = useMemo(() => names.map((name, i) => <Segment key={i} name={name} i={i} n={n} />), [names, n]);

  async function spin() {
    setSpinning(true); setError('');
    try {
      const { index } = await api(`/events/${eventId}/spin`, { method: 'POST' });
      const reduce = reducedMotion();
      setInstant(reduce);
      setRotation(360 * 6 + restAngle(index, a, (Math.random() - 0.5) * a * 0.6));
      timer.current = setTimeout(() => { setSpinning(false); onSpun(index); }, reduce ? 0 : SPIN_MS);
    } catch (e) {
      setError(e.message); setSpinning(false);
    }
  }

  const done = spunIndex >= 0;
  return (
    <section className="roulette" aria-labelledby="rt">
      <h2 id="rt">🎡 Пик на человека</h2>
      <p className="muted">Рулетку можно крутить один раз — результат сохраняется.</p>
      <div className="wheel-wrap">
        <div className="pointer" aria-hidden="true" />
        <svg className="wheel" viewBox="-100 -100 200 200" role="img" aria-label="Рулетка с людьми"
          style={{ transform: `rotate(${rotation}deg)`, transition: instant ? 'none' : undefined }}>
          {segments}
          <circle r="9" fill="#0A1730" stroke="#E4F0FF" strokeWidth="2" />
        </svg>
      </div>
      <p className="spin-result" aria-live="polite">
        {done ? `Вам выпал: ${names[spunIndex]}` : spinning ? 'Крутим…' : error}
      </p>
      {!done && <button type="button" className="btn" onClick={spin} disabled={spinning}>Крутить рулетку</button>}
    </section>
  );
}
