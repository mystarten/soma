import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useSoma } from '../hooks/useSoma'
import type { WhoopImportPreview } from '../types'
import { Badge, Button, Card, Stat, useToast } from '../components/ui/primitives'
import { buildWhoopPreview, type WhoopFileInput } from '../engine/whoop'
import { looksLikeZip, readZip } from '../lib/unzip'
import { recordImport, saveCheckIns, saveWorkouts } from '../db/repo'
import { uid } from '../db/db'
import { parseDay } from '../engine/time'
import { WORKOUT_KIND_LABEL } from '../engine/muscleMap'
import { navigate } from '../lib/router'

const KIND_LABEL: Record<string, string> = {
  cycles: 'Cycles physiologiques',
  sleeps: 'Nuits',
  workouts: 'Séances',
  journal: 'Journal',
  unknown: 'Non reconnu',
}

export default function WhoopImport() {
  const data = useSoma()
  const [preview, setPreview] = useState<WhoopImportPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    setError(null)
    try {
      const inputs: WhoopFileInput[] = []
      for (const file of Array.from(files)) {
        if (/\.zip$/i.test(file.name)) {
          const buf = await file.arrayBuffer()
          if (!looksLikeZip(buf)) throw new Error(`${file.name} n’est pas une archive zip valide.`)
          for (const entry of await readZip(buf)) {
            if (/\.csv$/i.test(entry.name)) {
              inputs.push({ name: entry.name.split('/').pop() ?? entry.name, text: await entry.text() })
            }
          }
        } else if (/\.csv$/i.test(file.name)) {
          inputs.push({ name: file.name, text: await file.text() })
        }
      }
      if (!inputs.length) throw new Error('Aucun fichier CSV trouvé dans la sélection.')
      setPreview(
        buildWhoopPreview(inputs, { checkins: data.checkins, workouts: data.workouts }),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lecture impossible.')
      setPreview(null)
    } finally {
      setBusy(false)
    }
  }

  const apply = async () => {
    if (!preview) return
    setBusy(true)
    try {
      if (preview.days.length) await saveCheckIns(preview.days)
      if (preview.workouts.length) await saveWorkouts(preview.workouts)
      await recordImport({
        id: uid('imp'),
        importedAt: new Date().toISOString(),
        files: preview.filesRead.map((f) => f.name),
        dayCount: preview.days.length,
        workoutCount: preview.workouts.length,
        nightCount: preview.nights,
      })
      toast.show(`${preview.days.length} jours et ${preview.workouts.length} séances importés`)
      setPreview(null)
      window.setTimeout(() => navigate('accueil'), 700)
    } finally {
      setBusy(false)
    }
  }

  const incomplete = useMemo(
    () => (preview?.workouts ?? []).filter((w) => !w.sets?.length && w.kind !== 'course' && w.kind !== 'cardio'),
    [preview],
  )

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
      {toast.node}

      <Card title="Import WHOOP" subtitle="Tout est lu dans ton navigateur, rien n’est envoyé ailleurs">
        <ol className="mt-2 space-y-1 text-xs text-mist-300">
          <li>1. Dans l’app WHOOP : Plus → Paramètres de l’app → Données → Créer un export.</li>
          <li>2. Tu reçois un e-mail avec un zip.</li>
          <li>3. Dépose ici le zip, ou les CSV qu’il contient.</li>
        </ol>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[0.65rem] text-mist-700">
          {['physiological_cycles.csv', 'sleeps.csv', 'workouts.csv', 'journal_entries.csv'].map(
            (f) => (
              <code key={f} className="rounded-md bg-white/5 px-1.5 py-0.5">
                {f}
              </code>
            ),
          )}
        </div>

        <label className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-white/15 bg-white/3 px-4 py-8 text-center transition hover:border-[var(--accent)]">
          <svg viewBox="0 0 24 24" className="h-7 w-7 text-accent">
            <path
              d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-sm text-mist-100">Choisir le zip ou les CSV</span>
          <span className="text-[0.68rem] text-mist-700">
            Plusieurs fichiers acceptés en une fois
          </span>
          <input
            type="file"
            accept=".csv,.zip,text/csv,application/zip"
            multiple
            className="hidden"
            onChange={(e) => void onFiles(e.target.files)}
          />
        </label>

        {busy && <p className="mt-3 text-center text-xs text-accent">Lecture en cours…</p>}
        {error && (
          <p className="mt-3 rounded-xl bg-[#ff5a5a14] p-3 text-xs text-[#ff8f8f] hairline">{error}</p>
        )}
      </Card>

      {preview && (
        <>
          <Card title="Aperçu avant validation">
            <div className="mt-2 grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-white/4 p-3 hairline">
                <Stat label="Jours" value={preview.days.length} />
              </div>
              <div className="rounded-xl bg-white/4 p-3 hairline">
                <Stat label="Nuits" value={preview.nights} />
              </div>
              <div className="rounded-xl bg-white/4 p-3 hairline">
                <Stat label="Séances" value={preview.workouts.length} />
              </div>
            </div>

            <div className="mt-3 space-y-1.5">
              {preview.filesRead.map((f) => (
                <div
                  key={f.name}
                  className="flex items-center justify-between gap-3 rounded-xl bg-white/4 px-3 py-2 text-xs hairline"
                >
                  <span className="min-w-0 truncate text-mist-100">{f.name}</span>
                  <span className="flex shrink-0 items-center gap-2 text-mist-700">
                    {f.rows} lignes
                    <Badge color={f.kind === 'unknown' ? '#ffc24b' : '#35e3ff'}>
                      {KIND_LABEL[f.kind]}
                    </Badge>
                  </span>
                </div>
              ))}
            </div>

            {preview.skippedDuplicates > 0 && (
              <p className="mt-3 text-xs text-mist-500">
                {preview.skippedDuplicates} entrée(s) déjà présentes seront ignorées. Tes saisies
                manuelles ne sont jamais écrasées.
              </p>
            )}
            {preview.warnings.map((w) => (
              <p key={w} className="mt-2 text-xs text-[#ffc24b]">
                {w}
              </p>
            ))}

            {preview.days.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-[0.68rem] tracking-wider text-mist-500 uppercase">
                  Période détectée
                </div>
                <div className="text-sm text-mist-100">
                  {format(parseDay(preview.days[0].day), 'd MMMM yyyy', { locale: fr })} →{' '}
                  {format(parseDay(preview.days[preview.days.length - 1].day), 'd MMMM yyyy', {
                    locale: fr,
                  })}
                </div>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <Button variant="primary" full onClick={apply} disabled={busy}>
                Valider l’import
              </Button>
              <Button variant="ghost" onClick={() => setPreview(null)}>
                Annuler
              </Button>
            </div>
          </Card>

          {preview.workouts.length > 0 && (
            <Card
              title="Séances détectées"
              subtitle={`${incomplete.length} sans détail d’exercices`}
            >
              <div className="mt-2 max-h-72 space-y-1.5 overflow-y-auto">
                {preview.workouts.slice(0, 40).map((w) => (
                  <div
                    key={w.id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-white/4 px-3 py-2 text-xs hairline"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-mist-100">
                        {w.title || WORKOUT_KIND_LABEL[w.kind]}
                      </span>
                      <span className="text-mist-700">
                        {format(new Date(w.startedAt), "d MMM 'à' HH:mm", { locale: fr })} ·{' '}
                        {w.durationMin} min
                        {w.whoopStrain ? ` · strain ${w.whoopStrain.toFixed(1)}` : ''}
                      </span>
                    </span>
                    <Badge>{WORKOUT_KIND_LABEL[w.kind]}</Badge>
                  </div>
                ))}
              </div>
              {incomplete.length > 0 && (
                <p className="mt-3 rounded-xl bg-accent/8 p-3 text-xs text-mist-300 hairline">
                  Après l’import, ces séances comptent déjà via leur durée, leur strain et leur type,
                  avec une répartition musculaire par défaut. Ouvre-les depuis Séances pour ajouter
                  les exercices et affiner le corps 3D.
                </p>
              )}
            </Card>
          )}
        </>
      )}

      <Card title="Ce qui est repris" subtitle="Correspondance des colonnes">
        <ul className="mt-2 space-y-1 text-[0.72rem] text-mist-500">
          <li>Recovery score % → récupération · Resting heart rate → FC repos · HRV → HRV</li>
          <li>Day Strain → charge du jour (0 → 21)</li>
          <li>
            Sleep performance, Asleep / Light / Deep (SWS) / REM / Awake duration, Sleep efficiency,
            Sleep consistency, Sleep debt, Sleep onset, Wake onset → sommeil
          </li>
          <li>Respiratory rate, Blood oxygen, Skin temp → métriques annexes</li>
          <li>
            workouts.csv → séances (Activity name converti, durée, FC moyenne et max, zones 1 à 5,
            distance, dénivelé)
          </li>
          <li>journal_entries.csv → notes du jour</li>
        </ul>
      </Card>
    </div>
  )
}
