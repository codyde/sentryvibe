# TodoVibe Integration Guide

## What is TodoVibe?

TodoVibe is a beautiful, animated component that displays task progress in real-time during project generation. It gives users visibility into what Claude is working on and creates a more engaging experience.

## Component Features

- ✨ **Smooth animations** with Framer Motion
- 📊 **Progress tracking** with percentage complete
- 🎨 **Status-specific styling** (pending, in-progress, completed)
- 🎉 **Completion celebration** when all tasks are done
- 🔄 **Real-time updates** as todos change

## Integration Steps

### 1. Import the Component

```typescript
import TodoVibe, { type TodoItem } from '@/components/TodoVibe';
```

### 2. Track Todo State

The component expects todo items in this format:

```typescript
interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm: string;
}
```

### 3. Example Usage in a Component

```typescript
'use client';

import { useState } from 'react';
import TodoVibe from '@/components/TodoVibe';

export default function ProjectGenerator() {
  const [todos, setTodos] = useState([
    {
      content: "Scaffold project with Vite",
      status: "pending",
      activeForm: "Scaffolding project with Vite"
    },
    {
      content: "Install dependencies",
      status: "pending",
      activeForm: "Installing dependencies"
    },
    {
      content: "Create components",
      status: "pending",
      activeForm: "Creating UI components"
    }
  ]);

  return (
    <div className="p-6">
      <TodoVibe todos={todos} title="Building Your App" />
    </div>
  );
}
```

### 4. Updating Todos from Stream

When receiving todos from the Claude agent stream:

```typescript
// In your stream processing code
if (message.type === 'todo-update') {
  const updatedTodos = message.todos;
  setTodos(updatedTodos);
}
```

## How It Works with Claude

### 1. Claude Creates Todos at Start

When a project generation starts, Claude will immediately call `TodoWrite`:

```typescript
TodoWrite({
  todos: [
    { content: "Scaffold project", status: "pending", activeForm: "Scaffolding project" },
    { content: "Install deps", status: "pending", activeForm: "Installing dependencies" },
    // ... more todos
  ]
});
```

### 2. Claude Updates Progress

As Claude works, it updates the status:

```typescript
// Before starting a task
TodoWrite({
  todos: [
    { content: "Scaffold project", status: "completed", activeForm: "..." },
    { content: "Install deps", status: "in_progress", activeForm: "Installing dependencies" },
    // ...
  ]
});
```

### 3. UI Updates in Real-Time

The TodoVibe component automatically:
- Shows spinning loader for `in_progress` tasks
- Shows checkmark for `completed` tasks
- Shows empty circle for `pending` tasks
- Updates progress bar percentage
- Shows celebration when 100% complete

## Styling

The component uses:
- **Purple gradient** for active tasks
- **Green accent** for completed tasks
- **Gray tones** for pending tasks
- **Framer Motion** for smooth animations
- **Tailwind CSS** for styling

## Customization

### Change Title

```typescript
<TodoVibe todos={todos} title="Custom Title" />
```

### Modify Colors

Edit the component file to change the color scheme:

```typescript
// In TodoVibe.tsx
// Purple/Pink gradient → Change to your brand colors
className="bg-gradient-to-r from-purple-500 to-pink-500"
```

## Example Flow

1. User clicks "Generate Project"
2. Claude immediately creates todo list → TodoVibe appears
3. Claude starts task 1 → Loader spins, progress bar moves
4. Task 1 completes → Checkmark appears, progress increases
5. All tasks complete → Celebration animation plays
6. User sees completed project with full confidence

## Benefits

- **Transparency**: Users see exactly what's happening
- **Engagement**: Animations keep users interested
- **Trust**: Clear progress builds confidence
- **Debugging**: Easy to see where issues occur

## Next Steps

To fully integrate TodoVibe:

1. ✅ Component created at `src/components/TodoVibe.tsx`
2. ✅ System prompts updated with todo instructions
3. ⏳ Wire up to project generation stream (needs UI integration)
4. ⏳ Add todo state management to generation page
5. ⏳ Parse todo messages from Claude agent stream

Example stream handling:

```typescript
// In your generation page
for await (const message of stream) {
  if (message.type === 'tool-output-available' && message.toolName === 'TodoWrite') {
    const todoData = JSON.parse(message.output);
    setTodos(todoData.todos);
  }
}
```

---

**Ready to use!** The component is built and the prompts are configured. Just wire it up to your project generation UI.
