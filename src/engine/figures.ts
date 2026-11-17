/* Petits bonshommes animés pour chaque exercice : deux ou trois positions, dessinées sur 120 × 90, vue de profil
   (de face pour les planches latérales). Chaque position donne les articulations ; l'animation passe de l'une à l'autre. */

export type Pt = [number, number]

export interface Pose {
  h: Pt /* tête */
  s: Pt /* épaule */
  e: Pt /* coude */
  w: Pt /* main */
  p: Pt /* bassin */
  k: Pt /* genou */
  f: Pt /* pied */
  /** Bout du pied (relevés de pointes de pieds). */
  t?: Pt
  /** Traits libres : l'autre jambe, une barre portée, etc. */
  x?: Pt[][]
}

export type Shape = { kind: 'line'; a: Pt; b: Pt } | { kind: 'rect'; x: number; y: number; w: number; h: number }

export interface Figure {
  id: string
  frames: Pose[]
  shapes: Shape[]
  ground?: boolean
  tip: string
}

const P = (h: Pt, s: Pt, e: Pt, w: Pt, p: Pt, k: Pt, f: Pt, extra?: { t?: Pt; x?: Pt[][] }): Pose => ({ h, s, e, w, p, k, f, ...extra })
const bar = (x1: number, x2: number, y: number): Shape => ({ kind: 'line', a: [x1, y], b: [x2, y] })
const vline = (x: number, y1: number, y2: number): Shape => ({ kind: 'line', a: [x, y1], b: [x, y2] })

const STAND = P([60, 18], [60, 28], [58, 42], [58, 54], [60, 52], [60, 66], [60, 80])

export const FIGURES: Figure[] = [
  {
    id: 'traction',
    shapes: [bar(30, 90, 6)],
    frames: [
      P([66, 20], [60, 26], [60, 16], [60, 6], [60, 50], [58, 64], [62, 76]),
      P([64, 9], [60, 16], [54, 22], [60, 6], [60, 40], [57, 54], [62, 66]),
    ],
    tip: 'Mains un peu plus larges que les épaules. Pars bras tendus, tire jusqu’à passer le menton au-dessus de la barre, puis redescends en contrôlant.',
  },
  {
    id: 'dips',
    shapes: [bar(58, 102, 42)],
    frames: [
      P([81, 16], [78, 26], [79, 34], [80, 42], [72, 50], [64, 62], [60, 74]),
      P([80, 30], [78, 38], [68, 46], [80, 42], [72, 60], [64, 70], [60, 80]),
    ],
    tip: 'Épaules basses, descends jusqu’à ce que les coudes soient à 90°, puis repousse jusqu’à tendre les bras. Buste légèrement penché en avant.',
  },
  {
    id: 'pompes',
    ground: true,
    shapes: [],
    frames: [
      P([94, 44], [84, 48], [85, 63], [86, 77], [53, 62], [38, 69], [22, 76]),
      P([94, 64], [84, 66], [74, 72], [86, 77], [53, 70], [38, 73], [22, 76]),
    ],
    tip: 'Corps gainé en ligne droite, coudes à 45°, poitrine près du sol, puis pousse fort. En version diamant, les mains sont rapprochées sous la poitrine.',
  },
  {
    id: 'gainage',
    ground: true,
    shapes: [],
    frames: [
      P([94, 54], [84, 58], [84, 76], [98, 76], [54, 64], [38, 70], [22, 76]),
      P([94, 53], [84, 57], [84, 76], [98, 76], [54, 62], [38, 69], [22, 76]),
    ],
    tip: 'Coudes sous les épaules, corps en ligne droite, ventre et fessiers contractés. Ne creuse pas le dos.',
  },
  {
    id: 'gainage-lateral',
    ground: true,
    shapes: [],
    frames: [
      P([22, 50], [26, 60], [24, 78], [40, 78], [60, 62], [78, 70], [96, 78], { x: [[[26, 60], [26, 38]]] }),
      P([22, 52], [26, 62], [24, 78], [40, 78], [60, 70], [78, 74], [96, 78], { x: [[[26, 62], [26, 40]]] }),
    ],
    tip: 'Coude sous l’épaule, hanches hautes, corps aligné de la tête aux pieds. Fais autant de temps de chaque côté.',
  },
  {
    id: 'hollow',
    ground: true,
    shapes: [],
    frames: [
      P([24, 68], [34, 72], [24, 66], [14, 60], [60, 76], [78, 70], [96, 62]),
      P([24, 66], [34, 70], [24, 64], [14, 58], [60, 76], [78, 68], [96, 58]),
    ],
    tip: 'Dos plaqué au sol, bras tendus derrière la tête, jambes tendues levées : tout le corps forme une banane.',
  },
  {
    id: 'lsit',
    shapes: [bar(30, 52, 54)],
    frames: [
      P([40, 26], [40, 34], [40, 44], [40, 54], [42, 54], [60, 54], [78, 54]),
      P([40, 25], [40, 33], [40, 43], [40, 53], [42, 52], [60, 52], [78, 52]),
    ],
    tip: 'Bras tendus, épaules abaissées, jambes tendues et serrées à l’horizontale. Pousse fort dans les barres.',
  },
  {
    id: 'releves-jambes',
    shapes: [bar(30, 90, 6)],
    frames: [
      P([66, 20], [60, 26], [60, 16], [60, 6], [60, 50], [60, 64], [60, 78]),
      P([66, 20], [60, 26], [60, 16], [60, 6], [60, 50], [78, 50], [96, 50]),
    ],
    tip: 'Suspendu bras tendus, relève les jambes tendues jusqu’à l’horizontale sans balancer, puis redescends lentement.',
  },
  {
    id: 'crunch',
    ground: true,
    shapes: [],
    frames: [
      P([30, 74], [40, 76], [36, 66], [28, 70], [66, 76], [84, 60], [92, 76]),
      P([52, 52], [54, 60], [48, 54], [46, 48], [66, 76], [84, 60], [92, 76]),
    ],
    tip: 'Dos au sol, enroule le haut du corps pour décoller les épaules. Souffle en montant, redescends sans te relâcher.',
  },
  {
    id: 'superman',
    ground: true,
    shapes: [],
    frames: [
      P([80, 72], [72, 76], [86, 74], [100, 74], [48, 76], [32, 76], [18, 76]),
      P([82, 66], [72, 70], [88, 66], [102, 60], [48, 76], [32, 72], [18, 64]),
    ],
    tip: 'Allongé sur le ventre, lève en même temps bras et jambes tendus, regard vers le sol, et tiens la position.',
  },
  {
    id: 'mollets',
    ground: true,
    shapes: [],
    frames: [STAND, P([60, 13], [60, 23], [58, 37], [58, 49], [60, 45], [60, 59], [60, 73])],
    tip: 'Monte sur la pointe des pieds le plus haut possible, marque une pause en haut, puis descends lentement.',
  },
  {
    id: 'charniere',
    ground: true,
    shapes: [],
    frames: [
      P([62, 18], [60, 28], [58, 42], [58, 54], [60, 52], [60, 66], [60, 80], { x: [[[48, 28], [72, 28]]] }),
      P([93, 38], [84, 40], [80, 50], [86, 42], [52, 52], [56, 66], [58, 80], { x: [[[78, 38], [94, 42]]] }),
    ],
    tip: 'Dos droit, pousse les fesses vers l’arrière et penche le buste, jambes presque tendues. Reviens en poussant les hanches vers l’avant.',
  },
  {
    id: 'pont',
    ground: true,
    shapes: [],
    frames: [
      P([22, 70], [30, 72], [38, 76], [48, 78], [52, 76], [68, 62], [76, 78]),
      P([22, 70], [30, 72], [38, 76], [48, 78], [52, 58], [70, 60], [76, 78]),
    ],
    tip: 'Dos au sol, pieds à plat. Monte le bassin en serrant les fessiers jusqu’à aligner genoux, hanches et épaules.',
  },
  {
    id: 'pistol',
    ground: true,
    shapes: [],
    frames: [
      P([60, 18], [60, 28], [70, 36], [80, 34], [60, 52], [60, 66], [60, 80], { x: [[[60, 52], [80, 52], [96, 52]]] }),
      P([66, 40], [62, 50], [76, 50], [88, 52], [56, 68], [70, 66], [58, 80], { x: [[[56, 68], [76, 68], [94, 66]]] }),
    ],
    tip: 'Une jambe tendue devant toi, descends lentement sur l’autre, talon au sol, puis remonte. Fais les deux côtés.',
  },
  {
    id: 'fentes',
    ground: true,
    shapes: [],
    frames: [
      P([60, 18], [60, 28], [58, 42], [58, 54], [60, 52], [60, 66], [60, 80], { x: [[[60, 52], [60, 66], [60, 80]]] }),
      P([60, 30], [58, 40], [56, 52], [56, 62], [58, 62], [76, 60], [78, 80], { x: [[[58, 62], [44, 74], [30, 78]]] }),
    ],
    tip: 'Grand pas en avant, genou avant au-dessus de la cheville, genou arrière vers le sol, puis remonte en poussant sur le pied avant.',
  },
  {
    id: 'corde',
    shapes: [{ kind: 'line', a: [60, 2], b: [60, 86] }],
    frames: [
      P([54, 34], [58, 42], [56, 34], [60, 28], [58, 64], [62, 72], [58, 82]),
      P([54, 20], [58, 28], [56, 20], [60, 14], [58, 50], [62, 58], [58, 68]),
    ],
    tip: 'Monte en alternant les mains et serre la corde entre les pieds pour te propulser avec les jambes.',
  },
  {
    id: 'muscle-up',
    shapes: [bar(30, 90, 22)],
    frames: [
      P([66, 35], [60, 40], [60, 31], [60, 22], [60, 62], [58, 74], [62, 86]),
      P([66, 29], [60, 34], [54, 28], [60, 22], [56, 54], [56, 68], [60, 80]),
      P([66, 9], [60, 12], [60, 17], [60, 22], [56, 34], [54, 48], [58, 62]),
    ],
    tip: 'Tire explosivement la barre vers le bas du ventre, bascule les poignets au-dessus de la barre, puis pousse jusqu’à tendre les bras.',
  },
  {
    id: 'front-lever',
    shapes: [bar(20, 50, 10)],
    frames: [
      P([20, 34], [30, 34], [30, 22], [30, 10], [60, 34], [78, 34], [96, 34]),
      P([20, 35], [30, 35], [30, 22], [30, 10], [60, 36], [78, 36], [96, 36]),
    ],
    tip: 'Corps horizontal sous la barre, bras tendus, omoplates abaissées, corps gainé comme une planche.',
  },
  {
    id: 'rameur',
    shapes: [bar(20, 100, 74), { kind: 'rect', x: 34, y: 66, w: 14, h: 6 }],
    frames: [
      P([56, 36], [52, 44], [64, 48], [78, 52], [40, 64], [66, 54], [70, 72]),
      P([30, 40], [34, 48], [46, 58], [56, 50], [42, 66], [68, 64], [88, 72]),
    ],
    tip: 'Pousse avec les jambes, puis le dos, puis tire la poignée vers le ventre. Reviens dans l’ordre inverse, sans te précipiter.',
  },
  {
    id: 'copenhagen',
    ground: true,
    shapes: [{ kind: 'rect', x: 88, y: 58, w: 26, h: 6 }, vline(94, 64, 82), vline(108, 64, 82)],
    frames: [
      P([22, 50], [26, 60], [24, 78], [40, 78], [58, 60], [74, 59], [90, 58], { x: [[[58, 60], [66, 72], [72, 80]]] }),
      P([22, 56], [26, 64], [24, 78], [40, 78], [58, 68], [74, 63], [90, 58], { x: [[[58, 68], [66, 76], [72, 80]]] }),
    ],
    tip: 'Planche latérale, pied du haut sur un banc, jambe du bas pliée dessous : monte le bassin et garde le corps aligné.',
  },
  {
    id: 'dragon-flag',
    shapes: [{ kind: 'rect', x: 10, y: 66, w: 30, h: 6 }],
    frames: [
      P([22, 62], [30, 66], [24, 70], [18, 62], [36, 44], [38, 30], [40, 16]),
      P([22, 62], [30, 66], [24, 70], [18, 62], [52, 58], [70, 52], [88, 46]),
    ],
    tip: 'Épaules sur le banc, corps tout droit : descends lentement en gardant hanches et jambes alignées, puis remonte sans plier.',
  },
  {
    id: 'pogos',
    ground: true,
    shapes: [],
    frames: [STAND, P([60, 6], [60, 16], [58, 30], [58, 42], [60, 40], [60, 54], [60, 68])],
    tip: 'Petits sauts très rapides sur les pointes, jambes presque tendues, genoux souples, contact très court avec le sol.',
  },
  {
    id: 'descente-marche',
    ground: true,
    shapes: [{ kind: 'rect', x: 14, y: 70, w: 40, h: 12 }],
    frames: [
      P([35, 20], [34, 28], [32, 40], [32, 50], [34, 44], [34, 58], [34, 70], { x: [[[34, 44], [48, 56], [58, 66]]] }),
      P([37, 24], [36, 32], [34, 44], [34, 54], [36, 48], [42, 60], [34, 70], { x: [[[36, 48], [52, 62], [62, 80]]] }),
    ],
    tip: 'Debout sur une marche, descends lentement une jambe vers le sol en gardant le genou aligné avec le pied, puis remonte.',
  },
  {
    id: 'pointes-pieds',
    shapes: [vline(96, 4, 84)],
    frames: [
      P([84, 18], [88, 30], [88, 44], [88, 56], [86, 54], [80, 66], [74, 80], { t: [62, 74] }),
      P([84, 18], [88, 30], [88, 44], [88, 56], [86, 54], [80, 66], [74, 80], { t: [62, 80] }),
    ],
    tip: 'Dos contre le mur, soulève les pointes de pieds en gardant les talons au sol, puis redescends en contrôlant.',
  },
]

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Par nom d'abord (plus précis), puis par identifiant d'exercice. */
const BY_NAME: [RegExp, string][] = [
  [/muscle.?up/, 'muscle-up'],
  [/front.?lever/, 'front-lever'],
  [/copenhag/, 'copenhagen'],
  [/dragon/, 'dragon-flag'],
  [/planche laterale|gainage lateral/, 'gainage-lateral'],
  [/hollow/, 'hollow'],
  [/l-?sit/, 'lsit'],
  [/releves? .*(jambes|genoux)|pieds a la barre|leg raise/, 'releves-jambes'],
  [/pointes? de pieds?/, 'pointes-pieds'],
  [/descente de marche|step.?down/, 'descente-marche'],
  [/pogo/, 'pogos'],
  [/rameur|rowing/, 'rameur'],
  [/good morning|souleve de terre|deadlift/, 'charniere'],
  [/pont fessier|hip thrust/, 'pont'],
  [/pistol/, 'pistol'],
  [/fentes?|bulgare|lunge/, 'fentes'],
  [/superman/, 'superman'],
  [/crunch/, 'crunch'],
  [/mollets?|calf/, 'mollets'],
  [/corde/, 'corde'],
  [/dips?\b/, 'dips'],
  [/pompes?|push.?up/, 'pompes'],
  [/gainage|planche/, 'gainage'],
  [/tractions?|pull.?up|chin.?up/, 'traction'],
]

const BY_ID: Record<string, string> = {
  ex_tractions_pronation: 'traction',
  ex_tractions_lestees: 'traction',
  ex_tractions_serrees: 'traction',
  ex_dips: 'dips',
  ex_dips_lestes: 'dips',
  ex_pompes: 'pompes',
  ex_pompes_diamant: 'pompes',
  ex_gainage: 'gainage',
  ex_gainage_lateral: 'gainage-lateral',
  ex_hollow_body: 'hollow',
  ex_lsit: 'lsit',
  ex_releves_jambes: 'releves-jambes',
  ex_crunch: 'crunch',
  ex_superman: 'superman',
  ex_mollets: 'mollets',
  ex_souleve_terre: 'charniere',
  ex_hip_thrust: 'pont',
  ex_pistol_squats: 'pistol',
  ex_fentes: 'fentes',
  ex_corde_grimper: 'corde',
  ex_muscle_up: 'muscle-up',
  ex_front_lever: 'front-lever',
}

/** Le dessin d'un exercice, ou null s'il n'y en a pas (on n'affiche alors rien plutôt qu'un dessin faux). */
export function figureFor(exerciseId: string | undefined, name: string | undefined): Figure | null {
  const n = norm(name ?? '')
  let id: string | undefined
  for (const [re, fid] of BY_NAME) if (re.test(n)) { id = fid; break }
  if (!id && exerciseId) id = BY_ID[exerciseId]
  return FIGURES.find((f) => f.id === id) ?? null
}

/** Chemins SVG d'une position. */
export function posePaths(p: Pose): { limbs: string[]; head: Pt } {
  const line = (...pts: Pt[]) => `M${pts.map((q) => `${q[0]} ${q[1]}`).join(' L')}`
  const limbs = [line(p.s, p.p), line(p.s, p.e, p.w), line(p.p, p.k, p.f)]
  if (p.t) limbs.push(line(p.f, p.t))
  for (const x of p.x ?? []) limbs.push(line(...x))
  return { limbs, head: p.h }
}
