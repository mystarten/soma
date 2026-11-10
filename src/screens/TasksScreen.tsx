import TodoPanel from '../components/vie/TodoPanel'
import DeadlinesPanel from '../components/vie/DeadlinesPanel'

export default function TasksScreen() {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
      <TodoPanel initialView="all" />
      <DeadlinesPanel full />
    </div>
  )
}
