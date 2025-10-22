# Design Constraints Modal - Implementation Plan

## Overview
A beautiful modal that lets users define design constraints (colors, typography, mood) BEFORE building, ensuring AI creates exactly the visual style they want.

**Scope:** MVP with Colors + Typography + Mood
**Location:** Floating button bottom-right, new query screen only
**Persistence:** Per-project in database
**Behavior:** Optional - if not set, AI chooses freely

---

## Part 1: User Experience Flow

### Scenario: User Creates New Project

1. User is on new query screen (no project selected)
2. Sees "Design" button floating bottom-right
3. Clicks button → Modal opens
4. Sets preferences:
   - Primary color: #FF6B6B
   - Secondary: #4ECDC4
   - Accent: #FFE66D
   - Neutrals: #F7F7F7, #333333
   - Heading font: Inter
   - Body font: System UI
   - Mood: [Modern, Professional, Trustworthy]
5. Clicks "Apply" → Modal closes
6. Types prompt: "Build a SaaS dashboard"
7. Submits → Design preferences injected into system prompt
8. AI builds with EXACT color palette and fonts specified

### Scenario: Continuation Build

1. User opens existing project
2. Design preferences loaded from DB
3. User can modify them via Design button (optional)
4. Continuation builds use updated preferences

### Scenario: User Skips Design Setup

1. User doesn't click Design button
2. Types prompt and submits
3. AI chooses colors/fonts freely (current behavior)

---

## Part 2: Component Architecture

```
page.tsx
├─ DesignPreferencesContext (wraps entire app)
│  └─ Provides: designPrefs, setDesignPrefs, saveDesignPrefs
│
├─ Floating "Design" Button
│  ├─ Only renders when: !currentProject && !isGenerating
│  └─ Opens: DesignConstraintsModal
│
└─ DesignConstraintsModal
   ├─ ColorPaletteSection
   │  └─ ColorPicker (x5) - primary, secondary, accent, neutrals
   ├─ TypographySection
   │  └─ FontSelector (x2) - heading, body
   ├─ MoodSection
   │  └─ MoodTags (multi-select)
   ├─ LivePreview (shows colors + fonts in action)
   └─ Actions (Apply, Reset)
```

---

## Part 3: Database Schema Changes

### Add to Projects Table

```sql
ALTER TABLE projects
ADD COLUMN design_preferences JSONB;
```

**Drizzle Schema:**
```typescript
// schema.ts
export const projects = pgTable('projects', {
  // ... existing columns
  designPreferences: jsonb('design_preferences').$type<DesignPreferences>(),
});
```

**Type Definition:**
```typescript
// types/design.ts
export interface DesignPreferences {
  colors: {
    primary: string;      // Hex color
    secondary: string;
    accent: string;
    neutralLight: string;
    neutralDark: string;
  };
  typography: {
    heading: string;      // Font name
    body: string;
  };
  mood: string[];         // Array of mood tags
  version?: number;       // For future schema changes
}
```

---

## Part 4: Component Specifications

### 1. ColorPicker Component

**Props:**
```typescript
interface ColorPickerProps {
  label: string;           // "Primary", "Secondary", etc.
  description?: string;    // Help text
  value: string;          // Hex color
  onChange: (color: string) => void;
}
```

**UI:**
```
┌─────────────────────────────────┐
│ Primary                         │
│ Main brand color for CTAs       │
│ ┌──────┐  #FF6B6B               │
│ │ ████ │  [____________]        │
│ └──────┘  ↑ Paste hex here      │
└─────────────────────────────────┘
```

**Features:**
- Color swatch (clickable to open native color picker)
- Text input for hex paste/edit
- Validates hex format (#RRGGBB or #RGB)
- Live preview update

**Implementation:**
```typescript
<div>
  <label>{label}</label>
  <p>{description}</p>
  <div className="flex gap-2">
    {/* Color swatch - opens native picker */}
    <input
      type="color"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-12 h-12 cursor-pointer rounded"
    />
    {/* Hex input */}
    <input
      type="text"
      value={value}
      onChange={(e) => {
        if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) {
          onChange(e.target.value);
        }
      }}
      placeholder="#FF6B6B"
      className="flex-1 px-3 py-2 rounded"
    />
  </div>
</div>
```

---

### 2. FontSelector Component

**Props:**
```typescript
interface FontSelectorProps {
  label: string;        // "Heading Font" or "Body Font"
  value: string;        // Current font name
  onChange: (font: string) => void;
  type: 'heading' | 'body'; // For preset filtering
}
```

**UI:**
```
┌─────────────────────────────────┐
│ Heading Font                    │
│                                 │
│ [Search fonts... ▼]             │
│                                 │
│ ┌─ Popular ───────────────────┐ │
│ │ Inter                       │ │
│ │ Poppins                     │ │
│ │ Montserrat                  │ │
│ │ Space Grotesk               │ │
│ │ Playfair Display            │ │
│ └─────────────────────────────┘ │
│                                 │
│ ┌─ Search Results ────────────┐ │
│ │ (Shows after typing)        │ │
│ └─────────────────────────────┘ │
│                                 │
│ Preview:                        │
│ The Quick Brown Fox             │
│ (Rendered in selected font)     │
└─────────────────────────────────┘
```

**Preset Fonts:**
```typescript
const PRESET_FONTS = {
  heading: [
    "Inter",
    "Poppins",
    "Montserrat",
    "Space Grotesk",
    "Playfair Display"
  ],
  body: [
    "System UI",
    "Inter",
    "Open Sans",
    "Roboto",
    "Work Sans"
  ]
};
```

**Google Fonts Integration:**
```typescript
// Debounced search (500ms)
const searchGoogleFonts = async (query: string) => {
  const response = await fetch(
    `https://www.googleapis.com/webfonts/v1/webfontlist?key=${GOOGLE_FONTS_API_KEY}&sort=popularity`
  );
  const data = await response.json();

  return data.items
    .filter(font => font.family.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 10)
    .map(font => font.family);
};
```

**Implementation Notes:**
- Load Google Fonts API key from env
- Debounce search input (500ms)
- Show "Popular" section first
- Search results appear below presets
- Each option shows live preview in that font

---

### 3. MoodSelector Component

**Props:**
```typescript
interface MoodSelectorProps {
  selected: string[];    // Currently selected moods
  onChange: (moods: string[]) => void;
  maxSelections?: number; // Default 4
}
```

**UI:**
```
┌─────────────────────────────────────────┐
│ Style & Mood                            │
│ Select 2-4 words describing your style  │
│                                         │
│ [Modern] [Professional] [Playful]       │
│ [Minimal] [Trustworthy] [Friendly]      │
│ [Bold] [Elegant] [Energetic]            │
│ [Clean] [Sophisticated] [Vibrant]       │
│ [Warm] [Tech-forward] [Luxurious]       │
│                                         │
│ Selected: Modern, Professional (2/4)    │
└─────────────────────────────────────────┘
```

**Mood Options:**
```typescript
const MOOD_OPTIONS = [
  // Tone (5)
  "Modern", "Professional", "Playful", "Minimal", "Luxurious",
  // Feel (5)
  "Trustworthy", "Friendly", "Bold", "Elegant", "Energetic",
  // Visual (5)
  "Clean", "Sophisticated", "Vibrant", "Warm", "Tech-forward"
];
```

**Behavior:**
- Click to toggle selection
- Visual feedback (selected vs unselected states)
- Limit to 4 selections
- Show count: "Selected: 2/4"

---

### 4. LivePreview Component

**Purpose:** Show how colors + fonts look together

**UI:**
```
┌────────────────────────────────┐
│ Preview                        │
├────────────────────────────────┤
│ ┌────────────────────────────┐ │
│ │                            │ │
│ │  Dashboard Heading         │ │ ← Heading font + primary color
│ │                            │ │
│ │  This is body text with    │ │ ← Body font + neutral dark
│ │  your selected typography. │ │
│ │                            │ │
│ │  [Primary Button]          │ │ ← Primary bg + neutral light text
│ │  [Secondary]   [Accent]    │ │ ← Secondary + Accent colors
│ │                            │ │
│ └────────────────────────────┘ │
└────────────────────────────────┘
```

**Implementation:**
```typescript
<div className="p-6 rounded-lg border" style={{
  backgroundColor: colors.neutralLight
}}>
  <h2 style={{
    fontFamily: typography.heading,
    color: colors.neutralDark,
    fontSize: '2rem',
    fontWeight: 700
  }}>
    Dashboard Heading
  </h2>

  <p style={{
    fontFamily: typography.body,
    color: colors.neutralDark,
    marginTop: '1rem'
  }}>
    This is body text with your selected typography.
  </p>

  <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem' }}>
    <button style={{
      backgroundColor: colors.primary,
      color: colors.neutralLight,
      padding: '0.5rem 1rem',
      borderRadius: '0.5rem'
    }}>
      Primary Button
    </button>

    <button style={{
      backgroundColor: colors.secondary,
      color: colors.neutralLight,
      padding: '0.5rem 1rem',
      borderRadius: '0.5rem'
    }}>
      Secondary
    </button>

    <button style={{
      backgroundColor: colors.accent,
      color: colors.neutralDark,
      padding: '0.5rem 1rem',
      borderRadius: '0.5rem'
    }}>
      Accent
    </button>
  </div>
</div>
```

---

## Part 5: Data Flow

### Step-by-Step Flow

#### 1. Initial Load (Existing Project)
```
page.tsx loads project
  ↓
Check if project.designPreferences exists
  ↓
If exists → Load into DesignPreferencesContext
If not → Context remains null
```

#### 2. User Opens Modal
```
User clicks "Design" button
  ↓
Modal opens with:
  - Current preferences (if exist)
  - OR sensible defaults for editing
```

#### 3. User Applies Preferences
```
User clicks "Apply"
  ↓
Modal calls onApply(preferences)
  ↓
Context updates: setDesignPrefs(preferences)
  ↓
If project exists:
  - Save to DB immediately
If new project:
  - Hold in memory until project created
```

#### 4. User Submits Build
```
User submits prompt
  ↓
Check if designPrefs exist in context
  ↓
If yes → Include in build request
If no → Don't include (AI chooses)
  ↓
Build API receives designPreferences
  ↓
Inject into system prompt sections
  ↓
AI sees exact color palette + fonts + mood
```

---

## Part 6: File Changes Needed

### Database

**File:** `packages/agent-core/src/lib/db/schema.ts`
```typescript
export const projects = pgTable('projects', {
  // ... existing columns
  designPreferences: jsonb('design_preferences').$type<DesignPreferences>(),
});
```

**Migration:** Will be auto-generated by Drizzle

---

### Types

**File:** `packages/agent-core/src/types/design.ts` (NEW)
```typescript
export interface DesignPreferences {
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    neutralLight: string;
    neutralDark: string;
  };
  typography: {
    heading: string;
    body: string;
  };
  mood: string[];
  version?: number; // For future schema changes
}

export const DEFAULT_COLORS = {
  primary: "#6366f1",      // Indigo
  secondary: "#8b5cf6",    // Purple
  accent: "#ec4899",       // Pink
  neutralLight: "#f9fafb", // Gray 50
  neutralDark: "#111827",  // Gray 900
};

export const DEFAULT_TYPOGRAPHY = {
  heading: "Inter",
  body: "System UI",
};

export const MOOD_OPTIONS = [
  // Tone
  "Modern", "Professional", "Playful", "Minimal", "Luxurious",
  // Feel
  "Trustworthy", "Friendly", "Bold", "Elegant", "Energetic",
  // Visual
  "Clean", "Sophisticated", "Vibrant", "Warm", "Tech-forward"
];

export const PRESET_FONTS = {
  heading: ["Inter", "Poppins", "Montserrat", "Space Grotesk", "Playfair Display"],
  body: ["System UI", "Inter", "Open Sans", "Roboto", "Work Sans"],
};
```

---

### Components

#### **File:** `components/design/DesignConstraintsModal.tsx` (NEW)

**Props:**
```typescript
interface DesignConstraintsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPreferences: DesignPreferences | null;
  onApply: (preferences: DesignPreferences) => void;
}
```

**Structure:**
```typescript
export default function DesignConstraintsModal({ ... }) {
  const [colors, setColors] = useState(currentPreferences?.colors || DEFAULT_COLORS);
  const [typography, setTypography] = useState(currentPreferences?.typography || DEFAULT_TYPOGRAPHY);
  const [mood, setMood] = useState(currentPreferences?.mood || []);

  const handleApply = () => {
    onApply({ colors, typography, mood, version: 1 });
    onClose();
  };

  const handleReset = () => {
    setColors(DEFAULT_COLORS);
    setTypography(DEFAULT_TYPOGRAPHY);
    setMood([]);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Design Constraints</DialogTitle>
          <DialogDescription>
            Define your design preferences for consistent, on-brand builds
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Colors Section */}
          <ColorPaletteSection colors={colors} onChange={setColors} />

          {/* Typography Section */}
          <TypographySection typography={typography} onChange={setTypography} />

          {/* Mood Section */}
          <MoodSection selected={mood} onChange={setMood} />

          {/* Live Preview */}
          <LivePreview colors={colors} typography={typography} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleReset}>
            Reset to Defaults
          </Button>
          <Button onClick={handleApply}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

#### **File:** `components/design/ColorPicker.tsx` (NEW)

```typescript
interface ColorPickerProps {
  label: string;
  description?: string;
  value: string;
  onChange: (color: string) => void;
}

export default function ColorPicker({ label, description, value, onChange }: ColorPickerProps) {
  const [hexInput, setHexInput] = useState(value);

  const handleHexChange = (input: string) => {
    setHexInput(input);
    // Validate and update parent only if valid hex
    if (/^#[0-9A-Fa-f]{6}$/.test(input)) {
      onChange(input);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-200">{label}</label>
        {description && (
          <span className="text-xs text-gray-400">{description}</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Native color picker */}
        <input
          type="color"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setHexInput(e.target.value);
          }}
          className="w-12 h-12 rounded-md border border-white/10 cursor-pointer"
        />

        {/* Hex input */}
        <input
          type="text"
          value={hexInput}
          onChange={(e) => handleHexChange(e.target.value)}
          onBlur={() => setHexInput(value)} // Reset to valid value on blur
          placeholder="#FF6B6B"
          maxLength={7}
          className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-md
                     text-sm font-mono text-gray-200 focus:border-purple-500"
        />
      </div>
    </div>
  );
}
```

---

#### **File:** `components/design/FontSelector.tsx` (NEW)

```typescript
interface FontSelectorProps {
  label: string;
  value: string;
  onChange: (font: string) => void;
  type: 'heading' | 'body';
}

export default function FontSelector({ label, value, onChange, type }: FontSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Debounced Google Fonts search
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const fonts = await searchGoogleFonts(searchQuery);
        setSearchResults(fonts);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const presets = PRESET_FONTS[type];
  const allOptions = searchQuery ? searchResults : presets;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-200">{label}</label>

      {/* Search input */}
      <input
        type="text"
        placeholder="Search Google Fonts..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-md"
      />

      {/* Font list */}
      <div className="max-h-40 overflow-y-auto space-y-1">
        {!searchQuery && (
          <div className="text-xs text-gray-500 px-2 py-1">Popular</div>
        )}

        {allOptions.map(font => (
          <button
            key={font}
            onClick={() => {
              onChange(font);
              setSearchQuery(''); // Clear search after selection
            }}
            className={`
              w-full text-left px-3 py-2 rounded transition-colors
              ${value === font
                ? 'bg-purple-500/20 text-purple-300'
                : 'hover:bg-white/5 text-gray-300'}
            `}
            style={{ fontFamily: font }}
          >
            {font}
          </button>
        ))}

        {isSearching && (
          <div className="text-center py-2 text-gray-400">Searching...</div>
        )}
      </div>

      {/* Preview */}
      <div className="p-4 bg-white/5 rounded border border-white/10">
        <div
          className="text-gray-200"
          style={{
            fontFamily: value,
            fontSize: type === 'heading' ? '1.5rem' : '1rem',
            fontWeight: type === 'heading' ? 700 : 400
          }}
        >
          {type === 'heading' ? 'The Quick Brown Fox' : 'The quick brown fox jumps over the lazy dog'}
        </div>
      </div>
    </div>
  );
}

// API helper
async function searchGoogleFonts(query: string): Promise<string[]> {
  const response = await fetch(`/api/design/fonts/search?q=${encodeURIComponent(query)}`);
  const data = await response.json();
  return data.fonts || [];
}
```

**Backend API for Google Fonts:**

**File:** `app/api/design/fonts/search/route.ts` (NEW)
```typescript
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q') || '';

  if (query.length < 2) {
    return NextResponse.json({ fonts: [] });
  }

  try {
    const apiKey = process.env.GOOGLE_FONTS_API_KEY;
    const response = await fetch(
      `https://www.googleapis.com/webfonts/v1/webfontlist?key=${apiKey}&sort=popularity`
    );

    const data = await response.json();

    const fonts = data.items
      .filter((font: any) => font.family.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 10)
      .map((font: any) => font.family);

    return NextResponse.json({ fonts });
  } catch (error) {
    console.error('Google Fonts API error:', error);
    return NextResponse.json({ fonts: [] }, { status: 500 });
  }
}
```

---

#### **File:** `components/design/MoodSelector.tsx` (NEW)

```typescript
interface MoodSelectorProps {
  selected: string[];
  onChange: (moods: string[]) => void;
  maxSelections?: number;
}

export default function MoodSelector({
  selected,
  onChange,
  maxSelections = 4
}: MoodSelectorProps) {
  const toggleMood = (mood: string) => {
    if (selected.includes(mood)) {
      onChange(selected.filter(m => m !== mood));
    } else if (selected.length < maxSelections) {
      onChange([...selected, mood]);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-200">
          Style & Mood
        </label>
        <span className="text-xs text-gray-400">
          {selected.length}/{maxSelections} selected
        </span>
      </div>

      <p className="text-xs text-gray-400">
        Select 2-4 words describing your desired aesthetic
      </p>

      <div className="flex flex-wrap gap-2">
        {MOOD_OPTIONS.map(mood => {
          const isSelected = selected.includes(mood);
          const isDisabled = !isSelected && selected.length >= maxSelections;

          return (
            <button
              key={mood}
              onClick={() => toggleMood(mood)}
              disabled={isDisabled}
              className={`
                px-3 py-1.5 rounded-full text-sm transition-all
                ${isSelected
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500'
                  : isDisabled
                    ? 'bg-white/5 text-gray-600 border border-white/5 cursor-not-allowed'
                    : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-gray-200'
                }
              `}
            >
              {mood}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

---

## Part 7: System Prompt Injection

### How Design Constraints Get Into The Prompt

**File:** `packages/agent-core/src/lib/agents/claude-strategy.ts`

```typescript
function buildClaudeSections(context: AgentStrategyContext): string[] {
  const sections: string[] = [];

  // ... existing sections (project context, workspace rules, etc.)

  // NEW: Inject design constraints if provided
  if (context.designPreferences) {
    sections.push(buildDesignConstraintsSection(context.designPreferences));
  }

  return sections;
}

function buildDesignConstraintsSection(prefs: DesignPreferences): string {
  const colorList = Object.entries(prefs.colors)
    .map(([name, hex]) => `  - ${name}: ${hex}`)
    .join('\n');

  return `## Design Constraints (User-Specified)

CRITICAL: Follow these EXACT design specifications provided by the user:

**Color Palette (MANDATORY - DO NOT DEVIATE):**
${colorList}

You MUST use ONLY these colors. Define them as CSS custom properties:
\`\`\`css
:root {
  --color-primary: ${prefs.colors.primary};
  --color-secondary: ${prefs.colors.secondary};
  --color-accent: ${prefs.colors.accent};
  --color-neutral-light: ${prefs.colors.neutralLight};
  --color-neutral-dark: ${prefs.colors.neutralDark};
}
\`\`\`

**Typography (MANDATORY):**
- Heading Font: ${prefs.typography.heading} (use for all h1, h2, h3, h4)
- Body Font: ${prefs.typography.body} (use for paragraphs, labels, body text)

Import these fonts in your CSS or use @import from Google Fonts.

**Style Direction:**
The user wants a design that feels: ${prefs.mood.join(', ')}

Interpret these mood descriptors to guide your design decisions:
${prefs.mood.map(m => `- ${m}: ${getMoodGuidance(m)}`).join('\n')}

**Remember:**
- Use the exact hex values provided
- Do not add additional colors
- Use only the specified fonts
- Match the mood descriptors in your design choices`;
}

function getMoodGuidance(mood: string): string {
  const guidance: Record<string, string> = {
    "Modern": "Clean lines, ample white space, contemporary patterns",
    "Professional": "Polished, consistent, attention to detail",
    "Playful": "Rounded shapes, friendly interactions, lighthearted touches",
    "Minimal": "Essential elements only, generous spacing, restrained palette use",
    "Trustworthy": "Clear hierarchy, readable typography, familiar patterns",
    "Bold": "Strong contrasts, large typography, confident visual statements",
    "Elegant": "Refined details, subtle transitions, sophisticated spacing",
    "Warm": "Inviting colors, soft edges, approachable feel",
    "Tech-forward": "Sharp edges, monospace accents, futuristic elements",
    // ... etc
  };
  return guidance[mood] || "";
}
```

---

## Part 8: Integration Points

### page.tsx Changes

```typescript
// Add near other state
const [isDesignModalOpen, setIsDesignModalOpen] = useState(false);
const [designPreferences, setDesignPreferences] = useState<DesignPreferences | null>(null);

// Load design preferences when project changes
useEffect(() => {
  if (currentProject?.designPreferences) {
    setDesignPreferences(currentProject.designPreferences);
  } else {
    setDesignPreferences(null);
  }
}, [currentProject]);

// Save design preferences to DB
const saveDesignPreferences = async (prefs: DesignPreferences) => {
  setDesignPreferences(prefs);

  if (currentProject) {
    // Save to DB immediately for existing project
    await fetch(`/api/projects/${currentProject.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ designPreferences: prefs }),
    });
  }
  // For new projects, hold in state and save after project creation
};

// Include in build request
const startGeneration = async (projectId: string, prompt: string) => {
  // ... existing code

  const buildRequest = {
    prompt,
    operationType,
    runnerId: selectedRunnerId,
    agent: selectedAgentId,
    designPreferences, // ← NEW: Include if set
  };

  await fetch(`/api/projects/${projectId}/build`, {
    method: 'POST',
    body: JSON.stringify(buildRequest),
  });
};

// Render floating button + modal
return (
  <div>
    {/* Existing chat UI */}

    {/* Floating Design button - only on new query screen */}
    {!currentProject && !isGenerating && (
      <button
        onClick={() => setIsDesignModalOpen(true)}
        className="fixed bottom-24 right-6 px-4 py-2 bg-purple-500/20
                   hover:bg-purple-500/30 text-purple-300 border border-purple-500/50
                   rounded-lg transition-all shadow-lg"
      >
        Design
      </button>
    )}

    {/* Design Constraints Modal */}
    <DesignConstraintsModal
      isOpen={isDesignModalOpen}
      onClose={() => setIsDesignModalOpen(false)}
      currentPreferences={designPreferences}
      onApply={saveDesignPreferences}
    />
  </div>
);
```

---

### Build API Changes

**File:** `apps/sentryvibe/src/app/api/projects/[id]/build/route.ts`

```typescript
interface BuildRequest {
  prompt: string;
  operationType: string;
  runnerId?: string;
  agent?: AgentId;
  designPreferences?: DesignPreferences; // ← NEW
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as BuildRequest;

  // ... existing validation

  // Pass design preferences to runner
  await sendCommandToRunner(runnerId, {
    id: commandId,
    type: 'start-build',
    projectId: id,
    payload: {
      operationType: body.operationType,
      prompt: body.prompt,
      designPreferences: body.designPreferences, // ← NEW: Pass through
      // ... other fields
    },
  });
}
```

---

### Runner Changes

**File:** `apps/runner/src/index.ts`

Update RunnerCommand type:
```typescript
interface StartBuildPayload {
  operationType: string;
  prompt: string;
  designPreferences?: DesignPreferences; // ← NEW
  // ... existing fields
}
```

Pass to orchestrator:
```typescript
case "start-build": {
  const orchestration = await orchestrateBuild({
    projectId: command.projectId,
    prompt: command.payload.prompt,
    designPreferences: command.payload.designPreferences, // ← NEW
    // ... existing fields
  });
}
```

**File:** `apps/runner/src/lib/build-orchestrator.ts`

```typescript
export interface BuildContext {
  projectId: string;
  designPreferences?: DesignPreferences; // ← NEW
  // ... existing fields
}

// Pass to strategy
const strategyContext: AgentStrategyContext = {
  projectId,
  designPreferences: context.designPreferences, // ← NEW
  // ... existing fields
};
```

---

## Part 9: Visual Design of Modal

### Overall Style

**Colors:**
- Background: #1e1e1e (dark, consistent with your app)
- Border: #3e3e3e
- Input backgrounds: rgba(255,255,255,0.05)
- Input borders: rgba(255,255,255,0.1)
- Focus: Purple (#7553FF accent)

**Layout:**
- Width: 600px
- Padding: 24px
- Sections separated by 24px
- Rounded corners: 12px

**Animation:**
- Fade in backdrop
- Scale in modal (0.95 → 1.0)
- Duration: 200ms ease-out

---

## Part 10: Implementation Order

### Day 1: Foundation

**Morning (3-4 hours):**
1. Create types file (`types/design.ts`)
2. Update database schema
3. Run migration
4. Create DesignPreferencesContext

**Afternoon (3-4 hours):**
5. Create ColorPicker component
6. Create basic modal shell
7. Wire up color section

### Day 2: Complete MVP

**Morning (3-4 hours):**
8. Create FontSelector component
9. Add Google Fonts API endpoint
10. Wire up typography section

**Afternoon (3-4 hours):**
11. Create MoodSelector component
12. Create LivePreview component
13. Add floating Design button to page.tsx

### Day 3: Integration & Testing

**Morning (2-3 hours):**
14. Update build API to accept designPreferences
15. Update runner to pass through
16. Update claude-strategy to inject section

**Afternoon (2-3 hours):**
17. Test full flow (set preferences → build → verify AI used them)
18. Polish UI/UX
19. Bug fixes

**Total:** 2-3 days

---

## Part 11: Additional Considerations

### Font Loading

**Question:** How do we ensure Google Fonts load in generated projects?

**Solution:** Agent should add to generated code:
```html
<!-- In <head> -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap" rel="stylesheet">
```

Add to prompt injection:
```
**Font Import:**
Add this to your HTML <head> or CSS @import:
  @import url('https://fonts.googleapis.com/css2?family=${heading}:wght@300;400;600;700&family=${body}:wght@300;400;600&display=swap');
```

---

### Validation

**Color validation:**
- Must be valid hex (#RRGGBB or #RGB)
- Auto-format (add # if missing, uppercase)
- Show error for invalid hex

**Font validation:**
- Must be non-empty string
- If from search, verify it exists

**Mood validation:**
- Min 2 selections
- Max 4 selections
- Show helpful text: "Select at least 2"

---

### Default Values

When user opens modal for first time:
```typescript
const DEFAULT_PREFERENCES: DesignPreferences = {
  colors: {
    primary: "#6366f1",      // Indigo (safe, professional)
    secondary: "#8b5cf6",    // Purple
    accent: "#ec4899",       // Pink
    neutralLight: "#f9fafb", // Gray 50
    neutralDark: "#111827",  // Gray 900
  },
  typography: {
    heading: "Inter",
    body: "System UI",
  },
  mood: ["Modern", "Professional"], // Pre-select 2
  version: 1,
};
```

---

## Part 12: Testing Strategy

### Test Cases

**1. Happy Path:**
- Open modal → Set all preferences → Apply → Close
- Start build → Verify preferences injected
- Check generated code uses exact colors + fonts

**2. Partial Preferences:**
- Set only colors, skip typography/mood
- Verify AI uses colors but chooses fonts freely

**3. Reset:**
- Set preferences → Reset → Verify defaults restored

**4. Persistence:**
- Set preferences → Create project → Reload page
- Verify preferences loaded from DB

**5. Font Search:**
- Type "Robot" → Verify Roboto appears
- Type "Mont" → Verify Montserrat appears
- Debounce working (not searching on every keystroke)

**6. Mood Limits:**
- Select 4 moods → Verify 5th is disabled
- Deselect one → Verify others become enabled

---

## Part 13: File Structure

```
apps/sentryvibe/src/
├─ types/
│  └─ design.ts (NEW)
├─ components/
│  └─ design/ (NEW)
│     ├─ DesignConstraintsModal.tsx
│     ├─ ColorPicker.tsx
│     ├─ FontSelector.tsx
│     ├─ MoodSelector.tsx
│     └─ LivePreview.tsx
├─ app/
│  ├─ page.tsx (modified - add button + modal)
│  └─ api/
│     ├─ design/
│     │  └─ fonts/
│     │     └─ search/
│     │        └─ route.ts (NEW - Google Fonts proxy)
│     └─ projects/
│        └─ [id]/
│           ├─ build/
│           │  └─ route.ts (modified - accept designPreferences)
│           └─ route.ts (modified - PATCH designPreferences)
│
packages/agent-core/src/
├─ types/
│  └─ design.ts (NEW - shared types)
├─ lib/
│  ├─ db/
│  │  └─ schema.ts (modified - add column)
│  └─ agents/
│     └─ claude-strategy.ts (modified - inject section)
```

---

## Part 14: Environment Variables

**Add to .env:**
```bash
GOOGLE_FONTS_API_KEY=your_key_here
```

**Get API Key:**
1. Go to https://console.cloud.google.com/
2. Enable Google Fonts API
3. Create API key
4. Restrict to Fonts API only

---

## Summary: What We're Building

### The Feature

**A beautiful modal for defining design constraints before building.**

**Includes:**
- 5 color pickers (primary, secondary, accent, 2 neutrals)
- 2 font selectors (5 presets + Google Fonts search)
- Mood multi-select (15 options, max 4)
- Live preview card
- Per-project persistence
- Optional (AI chooses if not set)

**Impact:**
- Eliminates boring, generic designs
- Ensures brand consistency
- Gives users control over visual identity
- Enforces 3-5 color, 2 font constraints

**Effort:** 2-3 days

---

## Questions Before Implementation

1. **Google Fonts API Key:** Do you have one, or should I include instructions to get it?

2. **Modal Library:** Use shadcn/ui Dialog component (you already have it) or build custom?

3. **Color Picker:** Native HTML5 color input is good enough, or want something fancier (like react-colorful)?

4. **Save Timing:**
   - Auto-save on every change (real-time)?
   - Save only when user clicks "Apply"?

5. **Button Style:** Match your existing purple theme or different accent?

Ready to start building when you are! Should I begin with the database schema and types, or jump straight into the UI components?