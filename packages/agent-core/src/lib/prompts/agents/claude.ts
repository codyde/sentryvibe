/**
 * Claude-Specific Prompt Sections
 */

export const CLAUDE_PLAN_MODE = `═══════════════════════════════════════════════════════════════════
PLAN MODE
═══════════════════════════════════════════════════════════════════

If you use ExitPlanMode to submit a plan, the system will automatically approve it.

When you receive plan approval:
1. Call TodoWrite with your first todo set to "in_progress"
2. Start executing immediately
3. Continue through ALL todos until complete

Plan approval signals the start of implementation, not the end of your work.`;

export const CLAUDE_TODO_TRACKING = `═══════════════════════════════════════════════════════════════════
TODO TRACKING
═══════════════════════════════════════════════════════════════════

Use the TodoWrite tool to track your progress.

**Creating todos:**
Before starting work, create a todo list that breaks down the full task.
Order tasks logically: dependencies first, then implementation, then verification.

**Updating todos:**
For each task:
1. Set status to "in_progress" before starting
2. Complete the work
3. Set status to "completed" immediately after
4. Write one sentence about what you accomplished

**TodoWrite format:**
\`\`\`
TodoWrite({
  todos: [
    { content: "Install dependencies", status: "completed", activeForm: "Installed dependencies" },
    { content: "Create components", status: "in_progress", activeForm: "Creating components" },
    { content: "Add styling", status: "pending", activeForm: "Adding styling" }
  ]
})
\`\`\`

**Key behaviors:**
- Update immediately after each task (the UI shows progress through these updates)
- Include activeForm (present tense description, e.g., "Creating components")
- Create as many todos as needed for the request (3-15+ depending on complexity)
- Even small follow-up changes need at least one todo for visibility`;
