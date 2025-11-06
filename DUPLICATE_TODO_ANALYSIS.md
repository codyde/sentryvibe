# Duplicate TODO Section Analysis

## User's Observation
"It seemed like we show the current generation todo, and then when it finishes we added another one for the finalized state"

## Current Logic Flow

### When Build is Active
```
generationState: { id: "build-123", isActive: true, todos: [...] }
buildHistory: []

Renders:
- ✅ "Current Build" section (line 2910) - condition passes
- ❌ "Build History" section - empty
```

### When Build Completes
```typescript
// Line 1858: Mark as inactive
generationState: { id: "build-123", isActive: false, todos: [...] }

// Line 718: Archive effect triggers
buildHistory: [{ id: "build-123", isActive: false, todos: [...] }]

Renders:
- ❌ "Current Build" section (line 2910) - isActive=false, condition fails
- ✅ "Build History" section (line 2952) - shows archived build
```

## The Issue: Timing Race Condition?

### Scenario 1: State Updates Not Atomic
```
T1: isActive = false (updateGenerationState)
T2: Component re-renders
T3: Archive effect runs, adds to buildHistory  
T4: Component re-renders again

During T2-T3: 
- Current Build: Hidden (isActive=false) ✓
- History: Empty (not archived yet) ✓
Result: No duplicate ✓

During T4:
- Current Build: Hidden (isActive=false) ✓  
- History: Shows build ✓
Result: No duplicate ✓
```

**Conclusion: Should NOT show duplicates**

### Scenario 2: Both Sections Visible (User Perception)

Maybe the user sees:
1. Build in "Current Build" section while active
2. Build completes and moves to "Build History" section  
3. Perceives this as "adding another one"

But technically it's just **moving** from one section to another, not duplicating.

## Potential Bug: What If isActive Doesn't Update?

If `isActive` somehow stays `true` after completion:
```
generationState: { id: "build-123", isActive: true ← BUG!, todos: [...] }
buildHistory: [{ id: "build-123", isActive: false, todos: [...] }]

Renders:
- ✅ "Current Build" section - isActive=true, shows
- ✅ "Build History" section - shows archived build
Result: DUPLICATE! ❌
```

## The Fix: Filter buildHistory to Exclude Current generationState

Even if there's a race condition or bug, we can prevent duplicates by filtering:

```typescript
// Only show in history if it's NOT the current generationState
const buildHistoryToShow = buildHistory.filter(
  build => !generationState || build.id !== generationState.id
);
```

This ensures:
- If build is active: Shows in "Current Build" only
- If build is completed: Shows in "History" only  
- Never shows in both places simultaneously

## Recommendation

The user is likely correct that there's a visual issue. The safest fix is to **filter buildHistory** to exclude any build that matches the current `generationState.id`, regardless of `isActive` status.

This prevents duplicates even if:
- There's a timing race
- `isActive` isn't updated correctly
- State updates happen out of order
- Any other edge case

The build will ALWAYS show in exactly one place:
- Current (if it's the active generationState)
- History (if it's not the current generationState)

