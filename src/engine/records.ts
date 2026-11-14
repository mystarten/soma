import { RUN_5K_REFERENCE_ID } from '../db/seed'

/* Les records qu'on suit par défaut. Chacun est modifiable ; on peut en ajouter d'autres. */
export type RecordKind = 'reps' | 'hold' | 'time'

export const DEFAULT_RECORD_ROWS: { id: string; label: string; kind: RecordKind }[] = [
  { id: 'ex_tractions_pronation', label: 'Tractions strictes', kind: 'reps' },
  { id: 'ex_tractions_lestees', label: 'Tractions lestées', kind: 'reps' },
  { id: 'ex_pompes', label: 'Pompes', kind: 'reps' },
  { id: 'ex_dips', label: 'Dips', kind: 'reps' },
  { id: 'ex_dips_lestes', label: 'Dips lestés', kind: 'reps' },
  { id: 'ex_muscle_up', label: 'Muscle-up', kind: 'reps' },
  { id: 'ex_lsit', label: 'L-sit', kind: 'hold' },
  { id: 'ex_front_lever', label: 'Front lever', kind: 'hold' },
  { id: RUN_5K_REFERENCE_ID, label: '5 km', kind: 'time' },
]

export const isWeighted = (id: string) => id.includes('lest')
