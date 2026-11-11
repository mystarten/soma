/* Sons discrets du réseau : une courte note douce (WebAudio), désactivés par défaut. */

const KEY = 'soma-neural-sound'
let ctx: AudioContext | null = null

export const soundEnabled = (): boolean => {
  try {
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export const setSoundEnabled = (on: boolean) => {
  try {
    window.localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    /* sans stockage, le réglage ne survit pas au rechargement */
  }
}

const FREQ: Record<string, number> = { core: 220, root: 294, axe: 330, hub: 392, task: 440, note: 523, deadline: 587, link: 660 }

/** Une note de ~140 ms, plus aiguë pour les petits neurones. */
export function blip(kind: string, soft = false): void {
  if (!soundEnabled()) return
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    if (ctx.state === 'suspended') void ctx.resume()
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(FREQ[kind] ?? 440, t)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(soft ? 0.018 : 0.05, t + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.18)
  } catch {
    /* pas d'audio disponible : on reste muet */
  }
}
