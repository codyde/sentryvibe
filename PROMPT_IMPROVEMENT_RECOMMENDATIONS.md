# Prompt Improvement Recommendations

Based on comprehensive analysis of bolt.diy vs your current prompts.

---

## 🌟 TIER 1: MUST ADD (High Impact)

### 1. **Holistic Thinking Requirement**

**From bolt.diy:**
```
CRITICAL: Think HOLISTICALLY and COMPREHENSIVELY BEFORE creating code:
- Consider ALL relevant files in the project
- Review ALL previous file changes and user modifications
- Analyze the entire project context and dependencies
- Anticipate potential impacts on other parts of the system
```

**Why add:** Prevents tunnel vision. Claude often creates files in isolation without considering existing code.

**Where to add:** Top of your workflow section, before todo creation

**Example for your prompt:**
```
🧠 HOLISTIC THINKING - BEFORE ANY CODE

Before writing ANY code, you MUST:
1. Consider the ENTIRE project structure
   - What files already exist?
   - What components depend on each other?
   - How will this change affect other files?

2. Review existing code
   - Read package.json for dependencies
   - Check tsconfig.json for settings
   - Understand the current architecture

3. Plan dependencies
   - What new dependencies are needed?
   - Are there version conflicts?
   - Do imports need updating?

NEVER write code in isolation. Always think about the full project.
```

---

### 2. **Full File Content Requirement**

**From bolt.diy:**
```
CRITICAL: Always provide the FULL, updated content of files:
- Include ALL code, even if parts are unchanged
- NEVER use placeholders like "// rest of the code remains the same..."
- ALWAYS show the complete, up-to-date file contents
- Avoid any form of truncation or summarization
```

**Why add:** Your biggest issue! Claude constantly uses placeholders causing incomplete files.

**Where to add:** After scaffolding instructions

**Example for your prompt:**
```
📄 COMPLETE FILE CONTENTS - NO SHORTCUTS

When writing or updating files:
✅ CORRECT: Write the ENTIRE file from start to finish
❌ WRONG: // ... rest of code remains the same
❌ WRONG: // [previous code here]
❌ WRONG: /* keeping existing implementation */

EVERY file you write must be COMPLETE and ready to use.
No placeholders. No shortcuts. Full code every time.

Example - If updating App.tsx:
- Read the current App.tsx
- Make your changes
- Write the COMPLETE new App.tsx
- Include imports, all functions, export - everything!
```

---

### 3. **Dependencies-First Strategy**

**From bolt.diy:**
```
Prioritize installing required dependencies by updating package.json FIRST.
- If package.json exists, dependencies auto-install IMMEDIATELY as first action
- Update package.json FIRST so deps install in parallel
- Avoid npm i <pkg> commands - add all to package.json upfront
```

**Why add:** Prevents missing dependency errors and ensures everything installs together.

**Where to add:** In your scaffolding/workflow section

**Example for your prompt:**
```
📦 DEPENDENCIES FIRST - CRITICAL STRATEGY

When adding dependencies:
1. ALWAYS update package.json FIRST
   - Add ALL dependencies you'll need upfront
   - Don't install packages one by one

2. Example pattern:
   ✅ CORRECT:
   - Update package.json (add react-query, zustand, etc.)
   - Run: cd ${projectName} && npm install
   - Then create files that use those dependencies

   ❌ WRONG:
   - Create file using react-query
   - Run: npm install react-query
   - Create file using zustand
   - Run: npm install zustand

3. List dependencies comprehensively:
   - UI libraries
   - State management
   - Data fetching
   - Utilities
   - Type definitions (@types/*)
```

---

### 4. **Design Excellence Standards**

**From bolt.diy (condensed):**
```
Overall Goal: Create visually stunning, unique, highly interactive, content-rich, and production-ready applications. Avoid generic templates.

Visual Identity:
- Distinctive art direction (unique shapes, grids, illustrations)
- Premium typography with refined hierarchy
- Microbranding (custom icons, buttons, animations)
- High-quality visual assets

Layout & Structure:
- Systemized spacing (8pt grid, design tokens)
- Fluid, responsive grids
- Atomic design principles
- Effective whitespace

UX & Interaction:
- Intuitive navigation
- Smooth microinteractions and animations
- Predictive patterns (skeleton loaders)
- Engaging copywriting

Content Richness:
- Feature-rich screens (NO blank screens)
- Populate lists (5-10 items minimum)
- All UI states (loading, empty, error, success)
- Domain-relevant fake content
```

**Why add:** Elevates output quality dramatically. Users want production-ready, not prototypes.

**Where to add:** New section after workflow, before Sentry

**Example for your prompt:**
```
🎨 DESIGN & UX EXCELLENCE

Create production-ready applications that look professional:

Visual Design:
- Use a cohesive color system (primary, secondary, accent, + status colors)
- Modern typography (16px+ body, clear hierarchy)
- Subtle shadows and rounded corners (8-12px)
- Smooth animations and transitions

Content & Features:
- NEVER create blank/empty screens
- Populate with realistic demo data (5-10 items minimum)
- Include ALL UI states:
  * Loading: Skeleton loaders or spinners
  * Empty: Helpful empty states with CTAs
  * Error: Clear error messages with retry
  * Success: Confirmation feedback

Layout:
- Responsive design (mobile-first)
- 8px grid system for consistent spacing
- Proper whitespace for readability
- Accessible (WCAG AA minimum)

Component Quality:
- Hover states on interactive elements
- Focus states for keyboard navigation
- Disabled states when appropriate
- Loading states for async actions

Example: Todo list should include:
- 5-7 sample todos with different states
- Add todo form with validation
- Empty state when list is empty
- Loading state when fetching
- Error state if fetch fails
```

---

## 🎯 TIER 2: SHOULD ADD (Good Impact)

### 5. **Chain of Thought Planning**

**From bolt.diy:**
```
Before providing a solution, BRIEFLY outline your implementation steps:
- List concrete steps you'll take
- Identify key components needed
- Note potential challenges
- Be concise (2-4 lines maximum)
```

**Why add:** Helps Claude plan systematically and gives users confidence.

**Example:**
```
💭 BRIEF PLANNING FIRST

Before writing code, state your plan briefly:

User: "Create a todo list app"
You: "I'll:
1. Scaffold Vite + React + TypeScript
2. Create Todo type, TodoList and TodoItem components
3. Add localStorage persistence
4. Style with Tailwind

Starting now..."

Keep it to 2-4 lines max. Then execute.
```

---

### 6. **Code Modularity Standards**

**From bolt.diy:**
```
Use coding best practices and split functionality into smaller modules:
- Files should be as small as possible
- Extract functionality into separate modules
- Keep files under 250 lines when possible
- Organize by feature, not by type
```

**Why add:** Prevents giant unmaintainable files.

**Example:**
```
📁 CODE ORGANIZATION & MODULARITY

File Size & Structure:
- Keep files under 250 lines
- One component per file
- Extract utilities to separate files
- Group by feature, not type

Structure Pattern:
${projectName}/
├── src/
│   ├── components/
│   │   ├── TodoList/
│   │   │   ├── TodoList.tsx (component)
│   │   │   ├── TodoItem.tsx (sub-component)
│   │   │   └── useTodos.ts (custom hook)
│   │   └── Header.tsx
│   ├── lib/
│   │   ├── api.ts (API functions)
│   │   └── storage.ts (localStorage utils)
│   ├── types/
│   │   └── index.ts (TypeScript types)
│   └── App.tsx

NEVER create 500+ line files. Split early, split often.
```

---

### 7. **Stock Photos from Pexels**

**From bolt.diy:**
```
Unless specified by user, ALWAYS use stock photos from Pexels where appropriate, only valid URLs you know exist. NEVER download images, only link to them.
```

**Why add:** Makes demos look professional instantly.

**Example:**
```
🖼️ IMAGES & ASSETS

For demo/prototype applications:
- Use Pexels stock photos (link only, never download)
- Use valid URLs you know exist
- Choose images relevant to the domain

Examples:
- Food app: https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg
- Social app: https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg
- E-commerce: https://images.pexels.com/photos/90946/pexels-photo-90946.jpeg

For icons: Use lucide-react (already available via npm)
```

---

## ⚡ TIER 3: NICE TO HAVE (Polish)

### 8. **Action Ordering Emphasis**

**From bolt.diy:**
```
The order of actions is VERY IMPORTANT:
- Create files BEFORE running commands that use them
- Update package.json FIRST (deps install in parallel)
- Configuration files before initialization commands
```

**Why add:** Prevents "file not found" and dependency errors.

---

### 9. **Explicit Non-Verbosity Rule**

**From bolt.diy:**
```
ULTRA IMPORTANT: Do NOT be verbose and DO NOT explain anything unless the user is asking for more information.

Think first and reply with code/actions immediately.
```

**Why add:** Reduces token usage and speeds up responses.

---

### 10. **Concrete Examples Section**

**From bolt.diy:** Has 3 full examples showing the complete flow

**Why add:** Claude learns patterns better from examples than instructions.

---

## ❌ DON'T ADD (Not Relevant)

### WebContainer Constraints
- Python limitations, no pip
- No g++, no native binaries
- Shell command limitations
**Why skip:** You have a real filesystem, not webcontainer

### Artifact Format
- boltArtifact, boltAction tags
- file/shell/start action types
**Why skip:** You're using Claude Code SDK tools, not artifacts

### Supabase-Specific Instructions
- Migration double-writes
- RLS policies
**Why skip:** You use NeonDB, different workflow

### Message Formatting
- allowedHTMLElements
**Why skip:** You use markdown in React components

---

## 🎯 RECOMMENDED ADDITIONS (Priority Order)

1. **Holistic Thinking** (TIER 1) - Most important! Prevents isolated thinking
2. **Full File Content** (TIER 1) - Solves your placeholder problem
3. **Dependencies First** (TIER 1) - Prevents missing deps
4. **Design Excellence** (TIER 1) - Makes output production-quality
5. **Chain of Thought** (TIER 2) - Improves planning
6. **Code Modularity** (TIER 2) - Prevents giant files
7. **Pexels Photos** (TIER 2) - Professional demos
8. **Action Ordering** (TIER 3) - Minor improvements
9. **Non-Verbosity** (TIER 3) - Token optimization

---

## 📝 Suggested Structure for Enhanced Prompt

```
Your current working directory (CWD): ${projectsDir}
Project to create: ${projectName}

🧠 HOLISTIC THINKING
[Think about entire project before coding]

🎯 TASK MANAGEMENT - TODO VIBES
[Your current section - keep this!]

📄 COMPLETE FILE CONTENTS - NO PLACEHOLDERS
[Never use "// rest of code"]

🔧 TYPESCRIPT TYPE IMPORTS
[Your current section - keep this!]

📦 DEPENDENCIES FIRST STRATEGY
[Update package.json before creating files]

🛠️ CRITICAL WORKFLOW
[Your current scaffolding/CLI instructions - keep this!]

🎨 DESIGN & UX EXCELLENCE
[Production-ready design standards]

📁 CODE ORGANIZATION
[File size limits, modularity]

🖼️ IMAGES & ASSETS
[Pexels photos for demos]

🚨 PATH REQUIREMENTS
[Your current path handling - keep this!]

💻 DEV SERVER TESTING
[Your current testing workflow - keep this!]

🎁 SENTRY INTEGRATION
[Your current Sentry offer - keep this!]
```

---

## My Recommendations

**START WITH THESE 4:**

1. ✅ **Holistic Thinking** - Add at the very top
2. ✅ **Full File Content** - Critical for quality
3. ✅ **Dependencies First** - Prevents errors
4. ✅ **Design Excellence** - Makes output shine

These four will give you 80% of bolt.diy's quality improvements while staying focused on your use case.

**THEN ADD IF YOU WANT:**

5. Chain of Thought (nice for transparency)
6. Code Modularity (prevents giant files)
7. Pexels Photos (pro-looking demos)

---

## Questions for You

1. **Holistic Thinking** - Add this? (I highly recommend YES)
2. **Full File Content** - Add this? (I highly recommend YES - solves placeholder problem)
3. **Dependencies First** - Add this? (Recommend YES)
4. **Design Excellence** - Add full design guidelines? Or keep it simple?
5. **Chain of Thought** - Want Claude to briefly explain plan before executing?
6. **Code Modularity** - Add file size limits and organization rules?
7. **Pexels Photos** - Want demos to use stock photos?

Let me know which ones you want, and I'll integrate them into your prompts! 🚀
