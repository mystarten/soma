import type { BodyFatigue, MuscleZone } from '../../types'
import { SHELL, ZONES, type Part, type ZonePart } from './bodyParts'
import { fatigueColor } from '../../engine/fatigueConfig'
import { ZONE_LABEL } from '../../engine/fatigueConfig'

/* ──────────────────────────────────────────────────────────────────────────
   Repli 2D : silhouette face / dos construite depuis les MÊMES données que
   le modèle 3D (projection x / y). Utilisée si WebGL manque ou si l'option
   « Vue 2D » est choisie.
   ────────────────────────────────────────────────────────────────────────── */

const SX = 112
const SY = 88
const cx = (x: number) => 50 + x * SX
const cy = (y: number) => 162 - y * SY

function ellipseOf(part: Part, mirrored: boolean) {
  const x = cx(mirrored ? -part.p[0] : part.p[0])
  const y = cy(part.p[1])
  if (part.shape === 'capsule') {
    const [r, len] = part.cap ?? [0.04, 0.2]
    return { x, y, rx: r * SX, ry: (len / 2 + r) * SY }
  }
  return { x, y, rx: part.s[0] * SX, ry: part.s[1] * SY }
}

function ZoneShape({
  part,
  mirrored,
  body,
  selected,
  onSelect,
}: {
  part: ZonePart
  mirrored: boolean
  body: BodyFatigue
  selected: MuscleZone | null
  onSelect: (z: MuscleZone) => void
}) {
  const z = body[part.zone]
  const color = fatigueColor(z.value, z.hasHistory)
  const e = ellipseOf(part, mirrored)
  const isSel = selected === part.zone
  return (
    <g
      onClick={() => onSelect(part.zone)}
      className="cursor-pointer"
      role="button"
      aria-label={`${ZONE_LABEL[part.zone]} ${Math.round(z.value)} %`}
    >
      <ellipse
        cx={e.x}
        cy={e.y}
        rx={e.rx}
        ry={e.ry}
        fill={color}
        fillOpacity={z.hasHistory ? 0.45 : 0.18}
        stroke={color}
        strokeOpacity={isSel ? 1 : 0.65}
        strokeWidth={isSel ? 1.6 : 0.7}
        className={z.value >= 75 && z.hasHistory ? 'anim-pulse' : undefined}
      />
    </g>
  )
}

function Figure({
  face,
  body,
  selected,
  onSelect,
  title,
}: {
  face: 'front' | 'back'
  body: BodyFatigue
  selected: MuscleZone | null
  onSelect: (z: MuscleZone) => void
  title: string
}) {
  const zones = ZONES.filter((z) => z.face === face || z.face === 'both')
  return (
    <div className="flex-1">
      <svg viewBox="0 0 100 170" className="h-full w-full" style={{ maxHeight: '58vh' }}>
        <defs>
          <radialGradient id={`halo-${face}`} cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#35e3ff" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#35e3ff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="100" height="170" fill={`url(#halo-${face})`} />
        {/* Coque */}
        <g stroke="#7fd8ff" strokeOpacity="0.3" strokeWidth="0.6" fill="#7fd8ff" fillOpacity="0.045">
          {SHELL.flatMap((part, i) =>
            (part.mirror ? [false, true] : [false]).map((m) => {
              const e = ellipseOf(part, m)
              return <ellipse key={`${i}-${m}`} cx={e.x} cy={e.y} rx={e.rx} ry={e.ry} />
            }),
          )}
        </g>
        {/* Zones */}
        {zones.flatMap((part, i) =>
          (part.mirror ? [false, true] : [false]).map((m) => (
            <ZoneShape
              key={`${part.zone}-${i}-${m}`}
              part={part}
              mirrored={m}
              body={body}
              selected={selected}
              onSelect={onSelect}
            />
          )),
        )}
        <ellipse cx="50" cy="167" rx="30" ry="2" fill="none" stroke="#35e3ff" strokeOpacity="0.3" strokeWidth="0.4" />
      </svg>
      <div className="mt-1 text-center text-[0.65rem] tracking-[0.2em] text-mist-500 uppercase">
        {title}
      </div>
    </div>
  )
}

export default function Body2D({
  body,
  selected,
  onSelect,
  single,
}: {
  body: BodyFatigue
  selected: MuscleZone | null
  onSelect: (z: MuscleZone) => void
  single?: 'front' | 'back'
}) {
  if (single) {
    return (
      <div className="flex h-full w-full justify-center">
        <Figure
          face={single}
          body={body}
          selected={selected}
          onSelect={onSelect}
          title={single === 'front' ? 'Face' : 'Dos'}
        />
      </div>
    )
  }
  return (
    <div className="flex h-full w-full items-stretch gap-2">
      <Figure face="front" body={body} selected={selected} onSelect={onSelect} title="Face" />
      <Figure face="back" body={body} selected={selected} onSelect={onSelect} title="Dos" />
    </div>
  )
}
