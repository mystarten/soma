import ProgramPanel from '../components/program/ProgramPanel'

/** La page principale : le conseil du jour, ce qu'il reste à faire, le tableau du programme. */
export default function Main() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <ProgramPanel />
    </div>
  )
}
