# Tailwind CSS v4 Color Configuration Fix

## Problem
All projects deployed from this SentryVibe system were incorrectly configured with Tailwind CSS v3 color syntax (space-separated RGB values), which doesn't work in Tailwind CSS v4. This caused colors to not display correctly - only black and white were showing.

## Root Cause
The AI system prompts in `/src/app/api/projects/[id]/generate/route.ts` and `/src/app/api/claude-agent/route.ts` did NOT include specific instructions about Tailwind CSS v4's required color format.

Claude was generating `globals.css` files with the old Tailwind v3 syntax:
```css
:root {
  --primary: 117 83 255;  /* ❌ WRONG - Tailwind v3 format */
}
```

Instead of the correct Tailwind v4 format:
```css
:root {
  --primary: rgb(117 83 255);  /* ✅ CORRECT - Tailwind v4 format */
}
```

## Solution Applied
Added a new section to BOTH system prompts explaining Tailwind CSS v4 color requirements:

**Location 1:** `src/app/api/projects/[id]/generate/route.ts` (line ~625)
**Location 2:** `src/app/api/claude-agent/route.ts` (line ~419)

### New Section Added:
```
🌈 TAILWIND CSS v4 COLOR CONFIGURATION - CRITICAL 🌈

IMPORTANT: This project uses Tailwind CSS v4, which requires FUNCTION SYNTAX for colors:

✅ CORRECT formats in globals.css or app.css:
  --primary: rgb(117 83 255);
  --primary: oklch(0.64 0.21 276);

❌ WRONG formats (Tailwind v3 - DO NOT USE):
  --primary: 117 83 255;
  --primary: #7553FF;

When defining CSS variables for Tailwind colors:
1. Use rgb() or oklch() function syntax
2. Inside the function, use space-separated values (NO commas)
3. Apply this to ALL color variables in :root

Example correct globals.css:
:root {
  --background: rgb(18 12 37);
  --foreground: rgb(255 255 255);
  --primary: rgb(117 83 255);
  --border: rgb(78 42 154);
}

OR with OKLCH (modern, perceptually uniform):
:root {
  --background: oklch(0.24 0.05 294);
  --primary: oklch(0.64 0.21 276);
}

Both formats work, but you MUST use the function syntax in Tailwind v4!
```

## Expected Behavior Going Forward
- All new projects generated will use correct Tailwind v4 color syntax
- Claude will use either `rgb()` or `oklch()` function format
- Colors will display correctly from the start
- No more black-and-white-only projects!

## Manual Fix for Existing Projects
If you have existing projects with the wrong format, run this fix in each project's `globals.css` or `app/globals.css`:

Replace all color variables from:
```css
--primary: 117 83 255;
```

To:
```css
--primary: rgb(117 83 255);
```

## Files Modified
1. `/src/app/api/projects/[id]/generate/route.ts` - Generation prompt
2. `/src/app/api/claude-agent/route.ts` - Chat/follow-up prompt
3. `/src/app/globals.css` - Fixed this project's colors (example)

## Date Fixed
October 6, 2025
