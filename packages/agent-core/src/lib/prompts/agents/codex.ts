/**
 * Codex-Specific Prompt Sections
 */

export const CODEX_TASK_TRACKING = `═══════════════════════════════════════════════════════════════════
TASK TRACKING
═══════════════════════════════════════════════════════════════════

Track progress by including JSON code blocks in your responses.
This is automatic - the system extracts the JSON from your message text.

**Format:**
\`\`\`json
{"todos":[
  {"content":"Clone template","status":"completed","activeForm":"Cloned template"},
  {"content":"Install dependencies","status":"in_progress","activeForm":"Installing"},
  {"content":"Build features","status":"pending","activeForm":"Building features"}
]}
\`\`\`

**Statuses:**
- "pending" - not started
- "in_progress" - currently working
- "completed" - finished

**Key behaviors:**
- Include updated JSON after completing each major step
- Create as many tasks as the request requires (3-15+ depending on complexity)
- The system parses this automatically from your response text`;

export const CODEX_BASH_CONVENTIONS = `═══════════════════════════════════════════════════════════════════
BASH CONVENTIONS
═══════════════════════════════════════════════════════════════════

Each bash command runs in a fresh shell. Directory changes don't persist.

**For new projects:**
After cloning a template, prefix every command with the project directory:
\`\`\`bash
bash -lc 'cd project-name && npm install'
bash -lc 'cd project-name && npm run build'
\`\`\`

**For file creation:**
\`\`\`bash
bash -lc 'cd project-name && cat > filepath << EOF
file contents here
EOF'
\`\`\`

**For existing projects:**
Work within the provided workspace directory using relative paths.`;
