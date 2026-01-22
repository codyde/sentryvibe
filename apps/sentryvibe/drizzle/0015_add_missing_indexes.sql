-- Add missing index on messages.project_id for performance
-- This index is critical for filtering messages by project
CREATE INDEX IF NOT EXISTS "messages_project_id_idx" ON "messages" ("project_id");
--> statement-breakpoint
-- Add composite index on generation_tool_calls for optimizing expensive queries
-- This index improves queries filtering by session_id, state, and todo_index
CREATE INDEX IF NOT EXISTS "generation_tool_calls_session_state_idx" ON "generation_tool_calls" ("session_id", "state", "todo_index");