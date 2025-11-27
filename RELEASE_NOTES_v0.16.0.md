# SentryVibe v0.16.0 - Major UX Overhaul

**Release Date:** November 26, 2025
**Previous Version:** v0.15.3
**Type:** Minor Release (Major UX improvements)

---

## 🎉 Overview

This release represents a comprehensive UX overhaul across the entire SentryVibe platform, focusing on improved discoverability, reduced friction, and more intuitive workflows. Every major interface component has been redesigned based on user feedback and best practices from industry-leading tools.

---

## ✨ Major Features

### 1. **Redesigned Sidebar with Smart Organization**

The sidebar has been completely rebuilt with a focus on simplicity and speed:

- **Instant Search** - Filter projects by name, slug, or framework as you type
- **Simplified Categories** - Removed confusing "Activity Feed" duplication; now just "Active" and "Projects"
- **Sort Options** - Sort by Recent (default), Name, or Framework
- **Runner in Footer** - One-click dropdown to switch runners (no more modal)
- **Framework Badges** - See what tech stack each project uses at a glance
- **Live Status Indicators** - Color-coded dots and text (🟢 Running, 🟡 Starting, 🔴 Failed)
- **Inline Actions** - Start/Stop/Open buttons always visible (no hover required)
- **Optimistic Updates** - UI updates immediately when you click Start/Stop

**Before:** 3 overlapping sections (Activity Feed, Active, Recent), hidden runner selector, hover-only actions
**After:** 2 clear sections, footer runner dropdown, always-visible actions

### 2. **Enhanced CMD+K Command Palette**

The command palette is now more powerful and intuitive:

- **Toast Notifications** - See confirmation when actions complete (no more silent closes)
- **Fixed Escape Behavior** - ESC goes back (not closes) when in project drill-down
- **Inline Status Display** - See running status directly in project list
- **Keyboard Hints** - Footer shows ↑↓ Navigate, ↵ Select, ⎋ Back/Close, ⌘+Click multi-select
- **Recent Commands** - Last 5 commands appear at top (localStorage)
- **Cmd+Click Multi-Select** - No more "Enable Bulk Mode" toggle - just Cmd+Click projects
- **Better Breadcrumbs** - Live status indicators in project action view
- **Chevron Indicators** - Visual cue that projects are expandable

**Before:** Silent actions, no command history, manual bulk mode toggle
**After:** Rich feedback, smart history, intuitive multi-select

### 3. **Improved Delete Confirmation**

Deletion is now safer and less frustrating:

- **Hold-to-Delete Button** - Must hold for 1.5 seconds (prevents accidental clicks)
- **Safer Default** - Files are kept by default (opt-in to delete)
- **Clear Radio Options** - "Keep files" vs "Delete everything" with descriptions
- **File Path Shown** - Know exactly where files are located
- **Success Toast** - Confirmation message after deletion
- **Visual Progress** - Button fills up as you hold

**Before:** Type exact name/slug to confirm, files deleted by default
**After:** Hold button to confirm, files kept by default

### 4. **Streamlined Running Services Modal**

Renamed from "System Monitor" with focused purpose:

- **Runner Selection Removed** - Now in sidebar footer (no duplication)
- **Live Timestamps** - "Updated 3 seconds ago" refreshes every second
- **Full Tunnel URLs** - No more truncation at 200px
- **Copy Buttons** - One-click copy for tunnel URLs
- **Better Visual Hierarchy** - Clearer service grouping
- **Open Buttons** - Quick access to localhost and tunnel URLs

**Before:** Mixed runner/process view, truncated URLs, manual refresh
**After:** Focused on services only, full URLs, live timestamps

### 5. **Preview Panel Improvements**

The preview experience is now more flexible:

- **Terminal as 3rd Tab** - Moved from fixed bottom panel to Preview/Editor/Terminal tabs
- **More Vertical Space** - Removing bottom terminal gives ~240px more height
- **Fixed Tunnel URL Display** - Always shows tunnel when available (was localhost-only)
- **Fixed-Width URL Bar** - 512px prevents button wrapping to second row
- **HoverCard for Full URL** - Hover to see complete URL (no truncation)
- **Icon-Only Select Element** - Cleaner toolbar, tooltip on hover
- **Blue Indicator** - Dot changes blue when tunnel is active

**Before:** Terminal takes bottom space, localhost-only URL, text wrapping
**After:** Full-height tabs, tunnel-aware URLs, fixed layout

---

## 🎨 Agent Prompt Enhancements

Adopted best practices from Bolt.new and refined existing patterns:

### New Prompt Sections:

1. **🧠 Architectural Thinking** - Forces holistic planning before creating todos
2. **📦 Dependency Law** - Install all deps once upfront (not mid-build)
3. **🛑 Dev Server Discipline** - Start server once at end (no mid-build restarts)
4. **🔄 Continuation Guidance** - Resume cleanly if response gets cut off
5. **🚀 Template Originality** - Explicitly instructs to create fresh designs (not copy templates)
6. **📐 Code Formatting Standards** - 2-space indent, consistent style rules

**Impact:** Agents now create more thoughtful architectures, avoid wasted reinstalls, and generate unique designs instead of template clones.

---

## 🐛 Bug Fixes

- **Fixed start server status updates** - UI now shows "Starting..." immediately with polling
- **Fixed tunnel URL display** - Tunnel URLs now appear in preview URL bar (was showing localhost only)
- **Fixed Sentry issue SENTRYVIBE-4K** - Framework logo createElement error
- **Fixed layout wrapping** - URL bar no longer causes buttons to wrap to second row
- **Fixed Escape key in CMD+K** - Now goes back instead of closing palette

---

## 🗑️ Deprecated

- **Activity Feed component** - Merged into "Active" section (removed duplication)
- **"Enable Bulk Mode" command** - Replaced with Cmd+Click multi-select
- **System Monitor name** - Renamed to "Running Services" (clearer)
- **Type-to-confirm deletion** - Replaced with hold-to-delete

---

## 📦 New Components

- `ProjectList.tsx` - Unified project list with search/sort
- `ProjectCard.tsx` - Simplified card with framework badges and inline actions
- `toast.tsx` - Toast notification system (success/error/warning/info)

---

## 🔧 Technical Improvements

- **Optimistic UI Updates** - Start/stop actions update UI immediately, then poll for final state
- **localStorage Integration** - Recent commands persist across sessions
- **Better TypeScript Types** - Fixed type errors in dashboard page, modals
- **Reduced Re-renders** - Memoized command generation in CMD+K
- **Event Tracking** - Recent commands tracked for better UX

---

## 📊 Stats

- **15 files modified**
- **1,657 lines added**
- **489 lines removed**
- **3 new components**
- **Net: +1,168 lines** (mostly UI improvements)

---

## 🚀 Upgrade Guide

No breaking changes. Simply pull the latest version:

```bash
git pull origin main
pnpm install  # Update dependencies if needed
```

If you're using the CLI, run:

```bash
sentryvibe upgrade
```

---

## 🙏 Acknowledgments

This release incorporates UX patterns and best practices from:
- **Bolt.new** - Holistic thinking, dependency management patterns
- **User feedback** - Addressing pain points in sidebar navigation and command discovery
- **Sentry best practices** - Better error tracking and observability

---

## 📝 Full Changelog

See all commits: [v0.15.3...v0.16.0](https://github.com/codyde/sentryvibe/compare/v0.15.3...v0.16.0)

---

**Enjoy the improved SentryVibe experience!** 🎊
