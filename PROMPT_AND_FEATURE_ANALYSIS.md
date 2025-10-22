# System Prompt & Feature Analysis
**Research Source:** https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools

Analysis of Lovable, Bolt, v0, Replit, and Same.dev to identify:
1. Prompt improvements for SentryVibe
2. New tools/features to enhance generation flow

---

## PART 1: PROMPT IMPROVEMENTS

### What You're Already Doing Well ✅

| Feature | Your Prompt | Industry Standard |
|---------|-------------|-------------------|
| Step-by-step execution | ✅ NEW (just added) | ✅ Same.dev, Bolt |
| Design constraints | ✅ 3-5 colors, 2 fonts | ✅ v0 |
| Minimal chatter | ✅ 2-3 sentences max | ✅ Lovable (2 lines max) |
| TodoWrite tracking | ✅ Mandatory | ✅ v0 TodoManager |
| No decorative filler | ✅ NEW (just added) | ✅ v0 |

### Missing Prompt Patterns (High Value)

#### 1. **Context Awareness Before Action** (Lovable, v0)

**What they do:**
```
BEFORE any file operation:
1. Check if file content is already in context
2. Use SearchRepo/GrepRepo to understand existing patterns
3. Read related files to understand dependencies
4. THEN make changes
```

**Why it matters:**
- Reduces hallucinations
- Ensures consistency with existing code
- Avoids breaking changes

**Add to your prompt:**
```
BEFORE modifying any file:
1. Use Grep to search for similar patterns in the codebase
2. Use Read to understand the file's current state
3. Consider dependencies and imports
4. THEN make targeted changes

NEVER modify files without understanding the surrounding context.
```

---

#### 2. **Line-Based Editing Over Full Rewrites** (Lovable)

**What they do:**
Lovable has `lov-line-replace` tool that replaces specific line ranges instead of rewriting entire files.

**Your current approach:**
- Edit tool does string replacement
- Write tool rewrites entire files

**Why it matters:**
- Faster for small changes
- Reduces context usage
- Less likely to break unrelated code

**Potential addition:**
Add guidance to prefer Edit tool over Write tool for existing files.

---

#### 3. **Autonomous Completion Signal** (Same.dev, Bolt)

**What they do:**
```
"Keep going until user's query is completely resolved, before ending your turn"
```

**Your current approach:**
Stop after todos complete, which is good, but could be more explicit about "don't stop mid-task"

**Add to your prompt:**
```
NEVER stop mid-task or wait for user confirmation unless:
1. You need critical information only the user has
2. You encounter an unrecoverable error
3. The user's request is ambiguous (ask clarifying questions FIRST)

Keep executing until ALL work is 100% complete.
```

---

#### 4. **Search Before Build** (v0)

**What they do:**
v0 has `SearchRepo` subagent that explores the codebase before making architectural decisions.

**Add to your prompt:**
```
For existing projects (continuation builds):
1. Use Grep to find similar components/patterns first
2. Match existing naming conventions
3. Follow existing project structure
4. Reuse existing utilities/helpers

For new projects:
1. Think about the full project structure upfront
2. Create modular, reusable components from the start
```

---

#### 5. **Error Recovery Patterns** (Lovable, Same.dev)

**What they do:**
```
When errors occur:
1. Read console logs
2. Read network requests
3. Search for similar error patterns in codebase
4. Fix and verify
```

**Add to your prompt:**
```
When encountering errors during dependency installation or dev server start:
1. Read the full error message carefully
2. Use Grep to search for related configuration files
3. Fix the root cause (missing deps, config issues)
4. Re-test to verify fix
5. NEVER mark todo complete if errors persist
```

---

## PART 2: NEW FUNCTIONALITY TO ADD

### Tier 1: High-Impact, Easy to Implement

#### 1. **Line-Based Replace Tool** (Lovable inspired)

**What it is:**
A tool that replaces content between specific line numbers instead of string matching.

**Why add it:**
- More precise for large files
- Faster than full rewrites
- Less context usage

**Implementation:**
```typescript
interface LineReplaceParams {
  file_path: string;
  first_line: number;
  last_line: number;
  new_content: string;
}
```

**Complexity:** LOW (can build on existing Edit tool)

---

#### 2. **Console Log Reader Tool** (Lovable)

**What it is:**
Tool to read the dev server's console output in real-time.

**Why add it:**
- Agent can see runtime errors without user reporting them
- Enables self-healing (see error → fix error)
- Better debugging experience

**Implementation:**
Already capturing process output in process-manager.ts, just expose it as a tool:
```typescript
interface ReadConsoleLogsParams {
  project_id: string;
  search?: string; // Optional filter
  lines?: number; // Last N lines
}
```

**Complexity:** LOW (infrastructure already exists)

---

#### 3. **Network Request Reader Tool** (Lovable)

**What it is:**
Tool to see failed API calls, 404s, CORS errors from the running app.

**Why add it:**
- Agent can debug API integration issues
- See what requests are failing
- Fix CORS, auth, endpoint issues autonomously

**Implementation:**
Could use browser devtools protocol or proxy the dev server to capture requests.

**Complexity:** MEDIUM (need to capture network traffic)

---

#### 4. **Search/Grep Repository Tool** (v0, Lovable)

**What it is:**
More powerful version of Grep that searches BEFORE making changes.

**Why add it:**
- Find existing patterns to match
- Discover similar components
- Understand codebase conventions

**You already have Grep!** Just needs prompt guidance to use it more.

**Complexity:** NONE (just prompt improvement)

---

#### 5. **Screenshot/InspectSite Tool** (v0)

**What it is:**
Take screenshots of the running app to verify visual bugs or reference designs.

**Why add it:**
- Verify the UI looks correct
- Debug layout issues
- Compare before/after for element changes

**Implementation:**
Use Puppeteer/Playwright to screenshot localhost:PORT

**Complexity:** MEDIUM (need headless browser)

---

### Tier 2: Medium Impact, More Complex

#### 6. **File Copy Tool** (Lovable)

**What it is:**
Copy files or directories to new locations.

**Why add it:**
- Duplicate components with variations
- Create template files
- Clone directory structures

**Implementation:**
Simple fs.copyFile wrapper

**Complexity:** LOW

---

#### 7. **Dependency Search Tool** (v0's SearchWeb)

**What it is:**
Search npm registry or package docs before adding dependencies.

**Why add it:**
- Find the right package for a task
- Check package popularity/maintenance
- Read package documentation

**Implementation:**
Fetch from npm registry API or use WebSearch with npm filter

**Complexity:** LOW

---

#### 8. **Versioning/Snapshot Tool** (Same.dev)

**What it is:**
Create snapshots of the project at key milestones to enable rollback.

**Why add it:**
- Undo breaking changes
- Compare before/after
- Safe experimentation

**Implementation:**
Git commits with tags or DB snapshots

**Complexity:** MEDIUM

---

#### 9. **Generate Design Inspiration Tool** (v0)

**What it is:**
Before building UI, generate detailed visual specifications and creative direction.

**Why add it:**
- Forces upfront design thinking
- Creates cohesive visual language
- Generates color palettes, typography scales

**Implementation:**
Call Claude/GPT with design-focused prompt before main build:
```
Input: "Dashboard for SaaS analytics"
Output: {
  colorPalette: { primary: "#FF6B6B", accent: "#4ECDC4", ... },
  typography: { heading: "Inter", body: "System UI" },
  spacing: "8pt system",
  mood: "Professional, data-driven, trustworthy"
}
```

**Complexity:** MEDIUM (need design-focused LLM call)

---

### Tier 3: Lower Priority / Out of Scope

#### ❌ Supabase Integration (Lovable, v0)
**Why skip:** You're focused on frontend, not backend/database

#### ❌ Docker Containers (Same.dev)
**Why skip:** You explicitly said no platform/container changes

#### ❌ Image Generation (Lovable, v0)
**Why skip:** Can achieve with Pexels URLs (simpler, faster)

#### ❌ Stripe Integration (Lovable)
**Why skip:** Out of scope for prototyping tool

---

## PART 3: RECOMMENDED IMPLEMENTATION PRIORITY

### Phase 1: Quick Wins (This Week)

**Prompt Improvements:**
1. ✅ Add "Context Awareness Before Action" section
2. ✅ Add "Autonomous Completion Signal"
3. ✅ Add "Error Recovery Patterns"
4. ✅ Add "Search Before Build" guidance

**Estimated effort:** 1 hour (just prompt updates)

---

### Phase 2: High-Value Tools (Next Sprint)

**1. Console Log Reader Tool**
- Expose existing process output as tool
- Enable agent to see and fix runtime errors
- **Effort:** 2-4 hours

**2. Line-Based Replace Tool**
- More efficient editing for large files
- **Effort:** 2-3 hours

**3. File Copy Tool**
- Simple but useful for component duplication
- **Effort:** 1-2 hours

**Total effort:** ~1 day

---

### Phase 3: Advanced Features (Future)

**1. Screenshot/InspectSite Tool**
- Visual verification of builds
- **Effort:** 1-2 days

**2. Design Inspiration Generator**
- Pre-build design specification generation
- **Effort:** 1 day

**3. Network Request Reader**
- Debug API issues automatically
- **Effort:** 2-3 days

**Total effort:** ~1 week

---

## PART 4: SPECIFIC PROMPT ADDITIONS

### Addition #1: Context Awareness (CRITICAL)

Add this section after "STEP-BY-STEP TODO EXECUTION":

```markdown
═══════════════════════════════════════════════════════════════════
🔍 CONTEXT AWARENESS - READ BEFORE YOU WRITE
═══════════════════════════════════════════════════════════════════

BEFORE modifying ANY existing file:

1. **Search for patterns**: Use Grep to find similar code in the codebase
   - Example: Before adding a new component, search for existing components
   - Match naming conventions, import patterns, and structure

2. **Read related files**: Use Read to understand dependencies
   - Check imports and exports
   - Understand data flow
   - See how similar features are implemented

3. **Understand the context**: Consider impact on other files
   - Will this change break imports elsewhere?
   - Does this follow the project's architecture?
   - Are there existing utilities to reuse?

4. **Then make targeted changes**: Use Edit for surgical precision
   - Change only what needs changing
   - Preserve working code
   - Match existing code style

NEVER blindly modify files without understanding the surrounding context.
NEVER create duplicate utilities that already exist in the codebase.

Example workflow:
\`\`\`
[User asks to add authentication]
1. Grep for "auth" to find existing auth code
2. Read auth-related files to understand current approach
3. Read similar features to match patterns
4. Create new auth component following discovered patterns
\`\`\`
```

---

### Addition #2: Autonomous Completion (CRITICAL)

Add this to "STEP-BY-STEP TODO EXECUTION":

```markdown
**AUTONOMOUS EXECUTION:**

Keep working until the task is 100% complete. Do NOT stop to ask for user approval unless:
- ❓ You need critical information only the user can provide
- ❌ You encounter an unrecoverable error
- 🤔 The user's request is ambiguous (ask clarifying questions FIRST, then execute)

NEVER pause mid-task saying "Should I continue?" or "Would you like me to...?"
The user expects you to complete the full request autonomously.
```

---

### Addition #3: Error Recovery (CRITICAL)

Add after "COMPLETION CHECKLIST":

```markdown
═══════════════════════════════════════════════════════════════════
🚨 ERROR RECOVERY - FIX BEFORE COMPLETING
═══════════════════════════════════════════════════════════════════

When you encounter errors:

**During Dependency Installation:**
1. Read the full error message
2. Identify missing peer dependencies or version conflicts
3. Update package.json to fix conflicts
4. Re-run installation
5. Verify success before moving on

**During Dev Server Start:**
1. Capture the error output
2. Use Grep to search for related config files
3. Check for missing environment variables
4. Fix root cause (not just symptoms)
5. Re-test dev server
6. NEVER mark todo complete if server won't start

**During Build/Compile:**
1. Read the TypeScript/linting errors
2. Fix all errors in order of appearance
3. Re-run build
4. Verify clean build before marking complete

**Philosophy:** "Fix errors immediately. Never proceed with broken code."
```

---

## PART 5: TOOL COMPARISON MATRIX

| Tool/Feature | Lovable | Bolt | v0 | Same.dev | SentryVibe | Should Add? |
|--------------|---------|------|----|---------|-----------| ------------|
| **File Operations** |
| Read file | ✅ lov-view | ✅ file | ✅ ReadFile | ✅ | ✅ Read | ✅ Already have |
| Write file | ✅ lov-write | ✅ file | ✅ (implicit) | ✅ edit_file | ✅ Write | ✅ Already have |
| Edit file | ✅ lov-line-replace | ❌ | ❌ | ✅ string_replace | ✅ Edit | ✅ Already have |
| Delete file | ✅ lov-delete | ✅ file | ✅ DeleteFile | ❌ | ❌ | ⭐ **ADD THIS** |
| Rename/Move file | ✅ lov-rename | ❌ | ✅ MoveFile | ❌ | ❌ | ⭐ **ADD THIS** |
| Copy file | ✅ lov-copy | ❌ | ❌ | ❌ | ❌ | ⭐ **ADD THIS** |
| **Code Search** |
| Grep search | ✅ lov-search-files | ❌ | ✅ GrepRepo | ❌ | ✅ Grep | ✅ Already have |
| List files | ❌ | ❌ | ✅ LSRepo | ❌ | ✅ Glob | ✅ Already have |
| Search subagent | ❌ | ❌ | ✅ SearchRepo | ❌ | ❌ | 🤔 Optional |
| **Debugging** |
| Console logs | ✅ lov-read-console-logs | ❌ | ❌ | ❌ | ❌ | ⭐⭐ **HIGH VALUE** |
| Network requests | ✅ lov-read-network-requests | ❌ | ❌ | ❌ | ❌ | ⭐ **MEDIUM VALUE** |
| Screenshot | ❌ | ❌ | ✅ InspectSite | ❌ | ❌ | ⭐ **MEDIUM VALUE** |
| **Dependencies** |
| Add package | ✅ lov-add-dependency | ✅ shell (npm i) | ❌ | ❌ | ✅ Bash | ✅ Already have |
| Remove package | ✅ lov-remove-dependency | ❌ | ❌ | ❌ | ❌ | 🤔 Optional |
| **Design** |
| Design inspiration | ❌ | ❌ | ✅ GenerateDesignInspiration | ❌ | ❌ | ⭐ **HIGH VALUE** |
| Image generation | ✅ imagegen | ❌ | ❌ | ❌ | ❌ | ❌ Skip (use Pexels) |
| **Web** |
| Web search | ✅ websearch | ❌ | ✅ SearchWeb | ✅ web_search | ✅ WebSearch | ✅ Already have |
| Fetch URL | ✅ lov-fetch-website | ❌ | ✅ FetchFromWeb | ✅ web_scrape | ✅ WebFetch | ✅ Already have |
| **Project Management** |
| Todo tracking | ❌ | ❌ | ✅ TodoManager | ❌ | ✅ TodoWrite | ✅ Already have |
| Versioning | ❌ | ❌ | ❌ | ✅ versioning | ❌ | 🤔 Optional |
| Deployment | ❌ | ❌ | ❌ | ✅ deploy | ❌ | ❌ Out of scope |

---

## PART 6: RECOMMENDED ADDITIONS (Prioritized)

### 🌟 TIER 1: Must-Have (Big Impact, Low Effort)

#### 1. **Console Log Reader Tool**

**What:**
```typescript
interface ReadConsoleLogsParams {
  project_id: string;
  lines?: number; // Last N lines, default 50
  search?: string; // Filter by keyword
}

// Returns:
{
  logs: string[]; // Recent console output
  errors: string[]; // Just the errors
  warnings: string[]; // Just the warnings
}
```

**Why:**
- Agent can see "Cannot find module 'react'" and fix it immediately
- No more "install dependencies and hope it works"
- Self-healing builds

**How to implement:**
You already capture stdout/stderr in `process-manager.ts`. Just:
1. Store last 500 lines in memory per project
2. Create API endpoint `/api/projects/[id]/console-logs`
3. Expose as tool to agent

**Effort:** 4 hours

---

#### 2. **Delete File Tool**

**What:**
```typescript
interface DeleteFileParams {
  file_path: string;
}
```

**Why:**
- Remove generated files that aren't needed
- Clean up during refactoring
- Currently agent can create but not delete (frustrating!)

**How to implement:**
1. Add to runner tools alongside Read/Write/Edit
2. Add safety check (can't delete outside workspace)
3. Require confirmation for critical files (package.json, etc.)

**Effort:** 2 hours

---

#### 3. **Move/Rename File Tool**

**What:**
```typescript
interface MoveFileParams {
  old_path: string;
  new_path: string;
}
```

**Why:**
- Reorganize project structure
- Rename components to match conventions
- Currently have to delete + recreate (loses git history)

**How to implement:**
1. Use `fs.rename()` or `mv` command
2. Update imports automatically? (advanced)
3. Safety checks (no overwrites without confirmation)

**Effort:** 3 hours

---

#### 4. **Prompt Enhancement: Context-First Editing**

**What:**
Add explicit "use Grep before Edit" guidance to prompt.

**Why:**
- Reduces hallucinations
- Ensures consistency
- Discovers reusable code

**How to implement:**
Update `CLAUDE_SYSTEM_PROMPT` with Section 1 from above.

**Effort:** 30 minutes

---

### 🔥 TIER 2: High Value (Medium Effort)

#### 5. **Generate Design Inspiration Tool**

**What:**
Before building UI, call a design-focused LLM to generate:
```json
{
  "colorPalette": {
    "primary": "#FF6B6B",
    "secondary": "#4ECDC4",
    "neutrals": ["#333333", "#F7F7F7"],
    "accents": ["#FFE66D"]
  },
  "typography": {
    "headingFont": "Inter",
    "bodyFont": "System UI",
    "scale": {
      "h1": "3rem",
      "h2": "2rem",
      "h3": "1.5rem",
      "body": "1rem"
    }
  },
  "spacing": "8pt system",
  "mood": ["modern", "trustworthy", "energetic"],
  "inspiration": "Inspired by Stripe's clarity and Notion's warmth"
}
```

**Why:**
- Ensures cohesive design from the start
- Provides specific constraints (not just "make it pretty")
- Eliminates boring, generic designs

**How to implement:**
1. Create separate API endpoint `/api/design/inspire`
2. Call Haiku with design-focused prompt
3. Return structured design spec
4. Inject into main build prompt as design constraints

**Effort:** 1 day

**IMPACT:** This would be HUGE for design quality

---

#### 6. **Screenshot Tool (Visual Verification)**

**What:**
Take screenshot of running app at specific breakpoints.

**Why:**
- Verify responsive design works
- Debug layout issues
- Compare before/after for element changes

**How to implement:**
1. Use Puppeteer in runner
2. Screenshot localhost:PORT
3. Return base64 image to agent
4. Agent can "see" the UI and verify

**Effort:** 2 days

---

#### 7. **Network Request Inspector**

**What:**
Monitor HTTP requests from the dev server:
- Failed requests (404, 500)
- CORS errors
- Slow requests

**Why:**
- Debug API integration issues
- Fix CORS problems automatically
- Optimize slow endpoints

**How to implement:**
1. Proxy the dev server through an inspection layer
2. Capture request/response data
3. Store last 100 requests
4. Expose as tool

**Effort:** 3 days

**Alternative:** Use browser DevTools Protocol to read from user's browser

---

### 🚀 TIER 3: Advanced (Nice to Have)

#### 8. **Import Auto-Update Tool**

**What:**
When renaming/moving files, automatically update all imports.

**Why:**
- Prevents broken imports
- Enables safe refactoring

**How to implement:**
Use TypeScript Language Server to find all references, update them.

**Effort:** 1 week (complex)

---

#### 9. **Git Snapshot/Versioning**

**What:**
Create git commits at key milestones with revert capability.

**Why:**
- Undo breaking changes
- Experiment safely
- Track progress

**How to implement:**
1. Auto-commit after each todo completes
2. Expose "revert to version" UI
3. Use git tags for easy navigation

**Effort:** 3-4 days

---

## PART 7: FINAL RECOMMENDATIONS

### DO THESE NOW (Prompt Updates)

1. ✅ Add "Context Awareness Before Action" section
2. ✅ Add "Autonomous Completion Signal"
3. ✅ Add "Error Recovery Patterns"
4. ✅ Add "Search Before Build" guidance

**Time:** 1 hour
**Impact:** Immediate improvement in code quality and consistency

---

### DO THESE NEXT (Tools - Week 1)

1. ⭐⭐ **Console Log Reader Tool** - Self-healing builds
2. ⭐ **Delete File Tool** - Complete CRUD operations
3. ⭐ **Move/Rename File Tool** - Better refactoring

**Time:** 1-2 days
**Impact:** Dramatically better error handling and UX

---

### DO THESE LATER (Tools - Month 1)

1. ⭐⭐ **Design Inspiration Generator** - Much better design quality
2. ⭐ **Screenshot Tool** - Visual verification
3. 🤔 **Network Request Inspector** - API debugging

**Time:** 1 week
**Impact:** Best-in-class design quality and debugging

---

## PART 8: COMPARISON SCORECARD

### Your Current State vs Industry Leaders

| Category | SentryVibe | Lovable | Bolt | v0 | Same.dev |
|----------|-----------|---------|------|----|---------|
| **Prompt Quality** |
| Step-by-step execution | ✅ NEW | ✅ | ✅ | ✅ | ✅ |
| Design constraints | ✅ NEW | ✅ | ✅ | ✅ | ⚠️ |
| Context awareness | ❌ **ADD** | ✅ | ⚠️ | ✅ | ⚠️ |
| Error recovery | ❌ **ADD** | ✅ | ⚠️ | ⚠️ | ✅ |
| **Tools Available** |
| File CRUD (full) | ⚠️ Missing delete/move | ✅ | ⚠️ | ✅ | ⚠️ |
| Console logs | ❌ **HIGH VALUE** | ✅ | ❌ | ❌ | ❌ |
| Network debugging | ❌ | ✅ | ❌ | ❌ | ❌ |
| Screenshot | ❌ | ❌ | ❌ | ✅ | ❌ |
| Design inspiration | ❌ **HIGH VALUE** | ❌ | ❌ | ✅ | ❌ |
| Code search | ✅ Grep | ✅ | ❌ | ✅ | ⚠️ |
| **Generation Quality** |
| Design excellence | ✅ NEW | ✅ | ✅ | ✅ | ⚠️ |
| Minimal chatter | ✅ NEW | ✅ | ✅ | ⚠️ | ⚠️ |
| Autonomous completion | ❌ **ADD** | ✅ | ✅ | ✅ | ✅ |

**Legend:**
- ✅ = Excellent
- ⚠️ = Partial/Needs improvement
- ❌ = Missing

---

## QUICK START PLAN

### This Week: Prompt Improvements (1 hour)

Update `packages/agent-core/src/lib/prompts.ts`:

1. Add "Context Awareness Before Action" section (after line 52)
2. Add "Autonomous Completion" to Step-by-Step section (line 12)
3. Add "Error Recovery Patterns" (after line 105)
4. Test with a new build and verify improvements

### Next Week: Essential Tools (1-2 days)

1. **Console Log Reader** - See runtime errors
2. **Delete File** - Complete CRUD
3. **Move File** - Better refactoring

### Next Month: Advanced Features (1 week)

1. **Design Inspiration Generator** - Pre-build design specs
2. **Screenshot Tool** - Visual verification
3. **Network Request Inspector** - API debugging

---

## QUESTIONS FOR YOU

Before I draft the prompt improvements:

1. **Console Log Reader**: Do you want this to be real-time (SSE stream) or on-demand (tool call)?
2. **Design Inspiration**: Should this run automatically for all new projects, or only when user doesn't provide specific design direction?
3. **Screenshot Tool**: Should this be automatic (screenshot after each todo) or manual (agent decides when to screenshot)?
4. **File operations**: Delete/Move/Copy - should we require confirmation for potentially destructive operations?

Let me know your preferences and I can start drafting the detailed implementation plan!
