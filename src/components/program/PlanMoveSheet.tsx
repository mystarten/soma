import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { DayKey, Workout } from '../../types'
import { previewBlock, previewMove, type PlanChange, type PlanContext, type PlanPreview } from '../../engine/planStore'
import { addDayKey, parseDay } from '../../engine/time'
import { applyPreview } from '../../db/planActions'
import { saveSettings, saveWorkout } from '../../db/repo'
import { Button, Field, Sheet, TextInput } from '../ui/primitives'

const fmtDay = (d: DayKey) => format(parseDay(d), 'EEE d MMM', { locale: fr })

function Changes({ p, extra }: { p: PlanPreview; extra?: string }) {
  const lines: PlanChange[] = [...p.headline, ...p.diff.changes]
  const isStreet = (c: PlanChange) => /^[TMP]\d/.test(c.label)
  const street = p.diff.changes.filter(isStreet).length
  const others = p.diff.changes.length - street
  return (
    <div className="space-y-3">
      <p className="text-sm text-mist-300">
        {street + others > 0 ? `${street ? `${street} autre${street > 1 ? 's' : ''} séance${street > 1 ? 's' : ''} de street ${street > 1 ? 'seront décalées' : 'sera décalée'} pour garder l’ordre et les règles de repos` : 'Aucune autre séance de street ne change'}${others ? `, et ${others} autre${others > 1 ? 's' : ''} séance${others > 1 ? 's s’ajustent' : ' s’ajuste'} autour (abdos, jambes, course…)` : ''}.` : 'Aucune autre séance ne change.'}
        {extra ? ` ${extra}` : ''}
      </p>
      <ul className="divide-y divide-white/6">
        {lines.map((c, i) => (
          <li key={i} className="py-2.5 text-sm text-mist-100">
            <b className="text-accent">{c.label}</b>{' '}
            {c.type === 'move' ? `${fmtDay(c.from!)} → ${fmtDay(c.to!)}` : c.type === 'add' ? `ajoutée le ${fmtDay(c.to!)}` : `retirée (prévue le ${fmtDay(c.from!)})`}
          </li>
        ))}
      </ul>
      {p.warnings.map((w, i) => (
        <p key={i} className={`text-xs ${w.hard ? 'text-[#ff8f8f]' : 'text-[#ffd98a]'}`}>⚠ {fmtDay(w.day)} : {w.text} (tu peux appliquer quand même)</p>
      ))}
    </div>
  )
}

/** Décaler une séance de 1 jour, de 2 jours ou à une date précise ; l'épingler ; voir ce que ça change avant d'appliquer. */
export function PlanMoveSheet({ ctx, workout, onClose, onDone }: { ctx: PlanContext; workout: Workout; onClose: () => void; onDone: (message: string) => void }) {
  const [target, setTarget] = useState<DayKey | null>(null)
  const [custom, setCustom] = useState(addDayKey(workout.day, 1))
  const [busy, setBusy] = useState(false)
  const preview = useMemo(() => (target ? previewMove(ctx, workout.id, target) : null), [ctx, workout.id, target])
  const auto = !!workout.plan?.auto
  const pinned = !auto || !!workout.plan?.locked
  const name = workout.title ?? 'Séance'

  if (target && preview) {
    return (
      <Sheet
        open
        onClose={onClose}
        title={`Décaler ${name}`}
        footer={
          'error' in preview ? (
            <Button full onClick={() => setTarget(null)}>Retour</Button>
          ) : (
            <div className="grid grid-cols-[1fr_auto] gap-2.5">
              <Button
                variant="primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  await applyPreview(preview, ctx.workouts, ctx.today)
                  onDone(`${name} décalée au ${fmtDay(target)}`)
                  onClose()
                }}
              >
                Appliquer
              </Button>
              <Button onClick={() => setTarget(null)}>Annuler</Button>
            </div>
          )
        }
      >
        {'error' in preview ? <p role="alert" className="rounded-xl bg-[#ff5a5a]/12 px-3 py-2.5 text-sm text-[#ff8f8f]">{preview.error}</p> : <Changes p={preview} extra="La séance décalée est épinglée à sa nouvelle date." />}
      </Sheet>
    )
  }

  return (
    <Sheet open onClose={onClose} title={name}>
      <div className="space-y-3 pb-2">
        <p className="text-sm text-mist-300">Prévue le {fmtDay(workout.day)}{workout.plan?.reason ? ` · ${workout.plan.reason}` : ''}</p>
        <div className="grid grid-cols-2 gap-2.5">
          <Button full onClick={() => setTarget(addDayKey(workout.day, 1))}>Décaler de 1 jour</Button>
          <Button full onClick={() => setTarget(addDayKey(workout.day, 2))}>Décaler de 2 jours</Button>
        </div>
        <Field label="Ou à une date précise">
          <div className="grid grid-cols-[1fr_auto] gap-2.5">
            <TextInput type="date" value={custom} onChange={(e) => setCustom(e.target.value)} />
            <Button disabled={!custom || custom === workout.day} onClick={() => setTarget(custom)}>Voir</Button>
          </div>
        </Field>
        {auto && (
          <Button
            full
            onClick={async () => {
              await saveWorkout({ ...workout, plan: { ...workout.plan, locked: !pinned } })
              onDone(pinned ? 'Séance libérée' : 'Séance épinglée')
              onClose()
            }}
          >
            {pinned ? '📌 Désépingler (l’algo peut la déplacer)' : '📌 Épingler (elle ne bougera plus)'}
          </Button>
        )}
        {!auto && <p className="text-xs text-mist-500">📌 Posée par toi : l’algorithme n’y touche pas.</p>}
      </div>
    </Sheet>
  )
}

/** Un imprévu : le jour devient indisponible, ses séances sont replacées automatiquement (après aperçu). */
export function PlanBlockSheet({ ctx, day, onClose, onDone }: { ctx: PlanContext; day: DayKey; onClose: () => void; onDone: (message: string) => void }) {
  const preview = useMemo(() => previewBlock(ctx, day), [ctx, day])
  const [busy, setBusy] = useState(false)
  return (
    <Sheet
      open
      onClose={onClose}
      title={`Indisponible le ${fmtDay(day)}`}
      footer={
        <div className="grid grid-cols-[1fr_auto] gap-2.5">
          <Button
            variant="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await saveSettings({ planBlocked: [...new Set([...(ctx.settings.planBlocked ?? []), day])] })
              await applyPreview(preview, ctx.workouts, ctx.today)
              onDone(`${fmtDay(day)} marqué indisponible`)
              onClose()
            }}
          >
            Appliquer
          </Button>
          <Button onClick={onClose}>Annuler</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-mist-300">L’algorithme ne te suggérera plus rien ce jour-là. Tes séances déjà placées restent où elles sont : déplace-les toi-même si besoin.</p>
        {preview.diff.changes.length > 0 && <Changes p={preview} />}
      </div>
    </Sheet>
  )
}
