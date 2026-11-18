import { useState } from 'react'
import { useSoma } from '../hooks/useSoma'
import { Button, Card, useToast } from './ui/primitives'
import ProgramJsonSheet from './program/ProgramJsonSheet'
import { programToJson, PROGRAM_FORMAT_DOC } from '../engine/programJson'
import { buildAiContext, buildTrackingExport } from '../engine/exportJson'
import { copyText } from '../lib/clipboard'
import { todayKey } from '../engine/time'

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** Réglages : écrire le programme avec une IA (format JSON), l'importer, exporter le suivi, copier le contexte pour une IA. */
export default function JsonTools() {
  const data = useSoma()
  const toast = useToast()
  const [importing, setImporting] = useState(false)
  const tracking = () => buildTrackingExport({ program: data.program, workouts: [...data.workouts, ...data.programMarks], exercises: data.exercises })
  return (
    <Card title="Programme et suivi en JSON" subtitle="Pour créer ou modifier ton programme avec une IA, et lui donner ton suivi">
      {toast.node}
      <div className="mt-3 flex flex-col gap-2.5">
        <Button onClick={async () => toast.show((await copyText(PROGRAM_FORMAT_DOC)) ? 'Consignes copiées : colle-les dans Claude' : 'Copie impossible')}>
          1. Copier les consignes pour l’IA
        </Button>
        <Button variant="primary" onClick={() => setImporting(true)}>
          2. Importer un programme (JSON)
        </Button>
        <Button
          disabled={!data.program}
          onClick={async () => toast.show((await copyText(buildAiContext(tracking()))) ? 'Contexte copié : colle-le dans Claude' : 'Copie impossible')}
        >
          Copier mon programme et mon suivi pour l’IA
        </Button>
        <div className="grid grid-cols-2 gap-2.5">
          <Button disabled={!data.program} onClick={() => data.program && download(`soma-programme-${todayKey()}.json`, JSON.stringify(programToJson(data.program), null, 2))}>
            Exporter le programme
          </Button>
          <Button onClick={() => download(`soma-suivi-${todayKey()}.json`, JSON.stringify(tracking(), null, 2))}>Exporter mon suivi</Button>
        </div>
        <p className="text-xs text-mist-500">Le suivi contient ton programme, les semaines faites, tes séances et tes notes. Colle-le dans une conversation avec Claude pour qu’elle t’aide à ajuster ton programme.</p>
      </div>
      {importing && <ProgramJsonSheet onClose={() => setImporting(false)} onDone={(m) => toast.show(m)} />}
    </Card>
  )
}
