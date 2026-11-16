import { useEffect, useState } from 'react'
import { useSoma } from '../hooks/useSoma'
import { freeSpace, isQuotaError, storageReport } from '../db/maintenance'
import { navigate } from '../lib/router'

/**
 * Prévient quand le navigateur n'a plus de place : sans cela, les modifications (records, avancement,
 * synchro WHOOP…) échouent en silence. Propose un nettoyage sans perte de données.
 */
export default function StorageGuard() {
  const data = useSoma()
  const [full, setFull] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const syncQuota = data.syncState.kind === 'error' && /quota/i.test(data.syncState.message)

  useEffect(() => {
    const onReject = (e: PromiseRejectionEvent) => {
      if (isQuotaError(e.reason)) setFull(true)
    }
    const onError = (e: ErrorEvent) => {
      if (isQuotaError(e.error ?? e.message)) setFull(true)
    }
    window.addEventListener('unhandledrejection', onReject)
    window.addEventListener('error', onError)
    void storageReport().then((r) => {
      if (r.ratio !== null && r.ratio > 0.9) setFull(true)
    })
    return () => {
      window.removeEventListener('unhandledrejection', onReject)
      window.removeEventListener('error', onError)
    }
  }, [])

  if (!full && !syncQuota) return null
  return (
    <div role="alert" className="mb-3 rounded-xl bg-[#ff8f45]/12 px-3.5 py-3 text-sm text-mist-100 hairline" style={{ boxShadow: 'inset 0 0 0 1px #ff8f4555' }}>
      <p className="font-medium text-[#ff8f45]">Le navigateur n’a plus de place pour enregistrer</p>
      <p className="mt-0.5 text-xs text-mist-300">
        Tes modifications (records, avancement du programme, récupération WHOOP) peuvent ne pas être sauvegardées. Le plus souvent, c’est le disque de l’appareil qui est presque plein.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-ink-950"
          onClick={async () => {
            const r = await freeSpace()
            setMsg(`File de synchronisation : ${r.queueBefore} → ${r.queueAfter}. Si le problème continue, libère de l’espace disque sur l’appareil.`)
          }}
        >
          Libérer de l’espace
        </button>
        <button className="rounded-lg bg-white/8 px-3 py-1.5 text-xs text-mist-100" onClick={() => navigate('reglages')}>
          Voir les détails
        </button>
        {msg && <span className="text-xs text-mist-300">{msg}</span>}
      </div>
    </div>
  )
}
