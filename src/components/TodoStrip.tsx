import React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Trash2, Check, Plus, ScrollText } from "lucide-react";

type Todo = {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
};

const STORAGE_KEY = "dyad_receipt_todos";

function useLocalTodos() {
  const [todos, setTodos] = React.useState<Todo[]>([]);

  React.useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed: Todo[] = JSON.parse(raw);
        setTodos(parsed);
      } catch {
        // ignore parse errors
      }
    }
  }, []);

  React.useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  }, [todos]);

  return { todos, setTodos };
}

const Ticket: React.FC<{
  todo: Todo;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}> = ({ todo, onToggle, onDelete }) => {
  return (
    <Card
      className="relative shrink-0 w-64 sm:w-72 bg-white text-gray-900 dark:bg-white dark:text-gray-900 border border-gray-200 shadow-sm overflow-hidden"
      style={{
        // subtle paper texture feel with gradient
        backgroundImage:
          "repeating-linear-gradient(0deg, rgba(0,0,0,0.02) 0px, rgba(0,0,0,0.02) 1px, transparent 1px, transparent 24px)",
      }}
    >
      <div className="px-4 py-3 border-b border-dashed border-gray-300 flex items-center justify-between">
        <span className="text-xs tracking-widest uppercase text-gray-500">
          Task
        </span>
        <span className="text-[10px] text-gray-400">
          {new Date(todo.createdAt).toLocaleDateString()}
        </span>
      </div>

      <div className="px-4 py-4">
        <p
          className={`text-sm leading-6 ${todo.done ? "line-through text-gray-400" : "text-gray-800"}`}
        >
          {todo.text}
        </p>
      </div>

      <div className="px-4 pb-4 flex items-center gap-2">
        <Button
          size="sm"
          variant={todo.done ? "secondary" : "default"}
          className="h-8"
          onClick={() => onToggle(todo.id)}
        >
          <Check className="h-4 w-4 mr-1" />
          {todo.done ? "Undo" : "Done"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50"
          onClick={() => onDelete(todo.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Perforation effect */}
      <div className="w-full border-t border-dashed border-gray-300" />
      <div className="absolute -left-3 top-16 h-6 w-6 rounded-full bg-gray-100 border border-gray-300" />
      <div className="absolute -right-3 top-16 h-6 w-6 rounded-full bg-gray-100 border border-gray-300" />
    </Card>
  );
};

const TodoStrip: React.FC = () => {
  const { todos, setTodos } = useLocalTodos();
  const [value, setValue] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const addTodo = () => {
    const text = value.trim();
    if (!text) return;
    const t: Todo = {
      id: crypto.randomUUID(),
      text,
      done: false,
      createdAt: Date.now(),
    };
    setTodos((prev) => [t, ...prev]);
    setValue("");
    inputRef.current?.focus();
  };

  const toggleTodo = (id: string) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    );
  };

  const deleteTodo = (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="w-full">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center mb-4">
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-gray-500" />
          <h2 className="text-lg font-semibold">Your Receipt Todos</h2>
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          ref={inputRef}
          placeholder="Add a new task..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addTodo();
          }}
          className="max-w-md"
        />
        <Button onClick={addTodo} disabled={!value.trim()}>
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>

      <div className="mt-6 overflow-x-auto">
        <div className="flex gap-4 pb-4 min-h-[180px]">
          {todos.length === 0 ? (
            <div className="text-sm text-gray-500 flex items-center">
              No tasks yet — add one to print it on your “receipt”.
            </div>
          ) : (
            todos.map((t) => (
              <Ticket
                key={t.id}
                todo={t}
                onToggle={toggleTodo}
                onDelete={deleteTodo}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default TodoStrip;