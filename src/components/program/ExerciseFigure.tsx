import { figureFor, posePaths } from '../../engine/figures'

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Le petit bonhomme animé de l'exercice, avec le conseil d'exécution. Rien n'est affiché si l'exercice n'a pas de dessin. */
export default function ExerciseFigure({ exerciseId, name, compact }: { exerciseId?: string; name?: string; compact?: boolean }) {
  const fig = figureFor(exerciseId, name)
  if (!fig) return null
  const frames = fig.frames.map(posePaths)
  const n = frames[0].limbs.length
  /* aller-retour entre les positions : A B A (ou A B C B A) */
  const order = fig.frames.length === 2 ? [0, 1, 0] : [0, 1, 2, 1, 0]
  const keyTimes = order.map((_, i) => (i / (order.length - 1)).toFixed(3)).join(';')
  const splines = order.slice(1).map(() => '0.45 0 0.55 1').join(';')
  const anim = !reduced()
  const dur = '2.4s'
  const attrs = { dur, repeatCount: 'indefinite', calcMode: 'spline', keyTimes, keySplines: splines } as const
  return (
    <figure className="m-0 flex flex-col items-center gap-2" aria-label={`Position : ${name ?? 'exercice'}`}>
      <svg viewBox="0 0 120 90" className={compact ? 'h-24 w-auto' : 'h-40 w-auto max-w-full'} role="img" aria-hidden>
        {fig.ground && <line x1="4" y1="83" x2="116" y2="83" stroke="#ffffff22" strokeWidth="1.5" strokeLinecap="round" />}
        {fig.shapes.map((sh, i) =>
          sh.kind === 'line' ? (
            <line key={i} x1={sh.a[0]} y1={sh.a[1]} x2={sh.b[0]} y2={sh.b[1]} stroke="#8a9bb8" strokeWidth="2.5" strokeLinecap="round" />
          ) : (
            <rect key={i} x={sh.x} y={sh.y} width={sh.w} height={sh.h} rx="1.5" fill="#8a9bb833" stroke="#8a9bb8" strokeWidth="1" />
          ),
        )}
        {Array.from({ length: n }, (_, li) => (
          <path key={li} d={frames[0].limbs[li]} fill="none" stroke="var(--accent)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
            {anim && <animate attributeName="d" values={order.map((fi) => frames[fi].limbs[li]).join(';')} {...attrs} />}
          </path>
        ))}
        <circle cx={frames[0].head[0]} cy={frames[0].head[1]} r="5.2" fill="#03060c" stroke="var(--accent)" strokeWidth="2.6">
          {anim && <animate attributeName="cx" values={order.map((fi) => frames[fi].head[0]).join(';')} {...attrs} />}
          {anim && <animate attributeName="cy" values={order.map((fi) => frames[fi].head[1]).join(';')} {...attrs} />}
        </circle>
      </svg>
      {!compact && <figcaption className="max-w-xs text-center text-xs leading-relaxed text-mist-300">{fig.tip}</figcaption>}
    </figure>
  )
}
