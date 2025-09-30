import { useState } from "react"
import { Trash2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"

interface Todo {
  id: number
  text: string
  completed: boolean
}

function App() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [input, setInput] = useState("")

  const addTodo = () => {
    if (input.trim()) {
      setTodos([...todos, { id: Date.now(), text: input, completed: false }])
      setInput("")
    }
  }

  const toggleTodo = (id: number) => {
    setTodos(todos.map(todo => 
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    ))
  }

  const deleteTodo = (id: number) => {
    setTodos(todos.filter(todo => todo.id !== id))
  }

  return (
    <div className="min-h-screen bg-[#f5f5dc] p-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white border-8 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-8 mb-8">
          <h1 className="text-6xl font-black mb-2 uppercase tracking-tight">
            TODO
          </h1>
          <p className="text-xl font-bold">GET THINGS DONE</p>
        </div>

        <div className="bg-[#ffeb3b] border-8 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 mb-8">
          <div className="flex gap-3">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && addTodo()}
              placeholder="What needs to be done?"
              className="flex-1 border-4 border-black font-bold text-lg h-14 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:translate-x-[2px] focus-visible:translate-y-[2px] focus-visible:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all"
            />
            <Button
              onClick={addTodo}
              className="border-4 border-black font-black text-lg h-14 px-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all active:translate-x-[4px] active:translate-y-[4px] active:shadow-none bg-[#ff5252] hover:bg-[#ff5252]"
            >
              <Plus className="h-6 w-6" />
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {todos.map((todo) => (
            <div
              key={todo.id}
              className={`bg-white border-8 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] ${
                todo.completed ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-center gap-4">
                <Checkbox
                  checked={todo.completed}
                  onChange={() => toggleTodo(todo.id)}
                  className="border-4 border-black h-8 w-8 rounded-none shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] checked:bg-black"
                />
                <span
                  className={`flex-1 text-xl font-bold ${
                    todo.completed ? "line-through" : ""
                  }`}
                >
                  {todo.text}
                </span>
                <Button
                  onClick={() => deleteTodo(todo.id)}
                  className="border-4 border-black font-black h-12 w-12 p-0 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all active:translate-x-[4px] active:translate-y-[4px] active:shadow-none bg-[#ff5252] hover:bg-[#ff5252]"
                >
                  <Trash2 className="h-5 w-5" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {todos.length === 0 && (
          <div className="bg-white border-8 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-12 text-center">
            <p className="text-2xl font-black uppercase">No todos yet!</p>
            <p className="text-lg font-bold mt-2">Add one above to get started</p>
          </div>
        )}

        <div className="mt-8 bg-[#4caf50] border-8 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6">
          <div className="flex justify-between items-center">
            <div className="font-black text-xl">
              TOTAL: {todos.length}
            </div>
            <div className="font-black text-xl">
              DONE: {todos.filter(t => t.completed).length}
            </div>
            <div className="font-black text-xl">
              LEFT: {todos.filter(t => !t.completed).length}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
