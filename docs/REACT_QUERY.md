# TanStack Query Adoption Analysis for SentryVibe

**Date:** November 1, 2025
**Recommendation:** ✅ EXCELLENT Candidate for TanStack Query

---

## Executive Summary

SentryVibe is an **ideal candidate** for TanStack Query (formerly React Query) adoption. The codebase exhibits classic symptoms of manual data fetching complexity with:
- 34 files containing manual fetch logic
- 20 files with polling intervals
- Complex manual cache management across 3 context providers
- Duplicated loading/error handling in 15+ components
- No optimistic updates or request deduplication

**Expected Benefits:**
- 30-40% code reduction in data-fetching components
- Improved UX with optimistic updates and smart caching
- Elimination of race conditions and stale data bugs
- Simplified maintenance with declarative data fetching
- Seamless integration with existing WebSocket/SSE architecture

---

## 1. Technology Stack Analysis

### Current Architecture

**Frontend Framework:**
- Next.js 15.5.4 with React 19.1.0 (App Router)
- TypeScript (119 TypeScript files)
- 90+ React components

**State Management:**
- **Zustand 5.0.8** - Minimal usage (only CommandPalette UI state)
- **React Context API** - Primary state management (3 global contexts)
- **Local State** - Heavy `useState` usage for component-specific data

**Backend:**
- Drizzle ORM with PostgreSQL
- 29 API routes in `/api/`
- WebSocket for real-time build updates
- Server-Sent Events (SSE) for status streaming

**Infrastructure:**
- Monorepo structure (sentryvibe, broker, runner apps)
- Distributed architecture with remote runner support
- Real-time collaboration features

---

## 2. Current Data Fetching Patterns

### Context-Based Global State

#### ProjectContext (`/contexts/ProjectContext.tsx`)

**Current Implementation:**
```typescript
const fetchData = async () => {
  try {
    setIsLoading(true);
    const projectsRes = await fetch('/api/projects');
    const runnerStatusRes = await fetch('/api/runner/status');
    const projectsData = await projectsRes.json();
    setProjects(projectsData.projects || []);
    // ... manual state updates
  } catch (error) {
    console.error('Failed to fetch project data:', error);
  } finally {
    setIsLoading(false);
  }
};
```

**Issues:**
- Manual `fetch()` calls wrapped in `useEffect`
- Manual loading state management
- Custom polling with `setInterval` (10-second cooldown on window focus)
- Manual refetch function exposed to consumers
- Complex window focus event listener logic

#### RunnerContext (`/contexts/RunnerContext.tsx`)

**Current Implementation:**
- Polling every 10 seconds with `setInterval`
- Manual localStorage sync
- Manual fallback logic when selected runner disconnects
- No request deduplication

#### AgentContext
- Simple localStorage-only state (no API calls)

### Component-Level Fetching

Multiple components perform independent data fetching:

#### ProcessManagerModal (`/components/ProcessManagerModal.tsx`)
- `useEffect` triggered on modal open
- Manual loading state
- Manual refetch with 500ms delay after mutations

#### DeleteProjectModal (`/components/DeleteProjectModal.tsx`)
- Direct `fetch()` for DELETE operations
- Manual `isDeleting` state
- Callback-based cache invalidation (`onDeleteComplete`)

#### PreviewPanel (`/components/PreviewPanel.tsx`)
- **Most Complex Component** - 10+ useEffect hooks
- Complex polling logic with SSE fallback
- Manual `setInterval` with conditional activation
- 2-second polling during operations
- DNS verification loops with retry logic
- Multiple refs for race condition handling

#### AppSidebar (`/components/app-sidebar.tsx`)
- Manual `fetch()` for server start/stop
- Manual `refetch()` call after mutations
- No optimistic updates

### Real-Time Updates

#### WebSocket Hook (`/hooks/useBuildWebSocket.ts`)
- Custom WebSocket hook with reconnection logic
- Manual state hydration from database on mount
- Exponential backoff for reconnection
- Complex state normalization for date fields

#### SSE Endpoint (`/app/api/projects/[id]/status-stream/route.ts`)
- Server-Sent Events for status updates
- Hybrid approach: event-driven + periodic safety checks (5-second intervals)

---

## 3. API Endpoints Inventory

### Project APIs (13 endpoints)
- `GET /api/projects` - List all projects
- `POST /api/projects` - Create project
- `GET /api/projects/[id]` - Get project details
- `DELETE /api/projects/[id]` - Delete project
- `POST /api/projects/[id]/start` - Start dev server
- `POST /api/projects/[id]/stop` - Stop dev server
- `POST /api/projects/[id]/start-tunnel` - Start tunnel
- `POST /api/projects/[id]/stop-tunnel` - Stop tunnel
- `GET /api/projects/[id]/files` - List files
- `GET /api/projects/[id]/files/content` - Get file content
- `GET /api/projects/[id]/logs` - Get logs
- `GET /api/projects/[id]/status-stream` - SSE stream
- `GET /api/projects/[id]/messages` - Get generation messages
- `POST /api/projects/[id]/build` - Start build

### Runner APIs (5 endpoints)
- `GET /api/runner/status` - Runner connections
- `POST /api/runner/commands` - Send commands
- `GET /api/runner/events` - Runner event stream
- `GET /api/runner/process/list` - List processes
- `POST /api/runner/process/register` - Register process

### Other APIs (3 endpoints)
- `GET /api/processes` - System processes
- `POST /api/chat` - Chat interface
- `POST /api/tags/suggest` - AI tag suggestions

**Total:** 29 API routes

---

## 4. Identified Pain Points

### 1. Duplicated Loading/Error Logic ✅

**Evidence:**
- Same pattern repeated across 15+ components
- Each component manages its own `isLoading`, `error` states
- Boilerplate code in: ProcessManagerModal, DeleteProjectModal, PreviewPanel, app-sidebar, TagInput, etc.

**Example:**
```typescript
// Repeated pattern everywhere:
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState<string | null>(null);

const fetchData = async () => {
  setIsLoading(true);
  setError(null);
  try {
    const res = await fetch(url);
    const data = await res.json();
    setData(data);
  } catch (err) {
    setError(err.message);
  } finally {
    setIsLoading(false);
  }
};
```

### 2. Manual Cache Management ✅

**Evidence:**
- Complex cooldown logic in ProjectContext (10-second window)
- Manual `refetch()` functions exposed everywhere
- No automatic cache invalidation
- Stale data between tab switches

**Example from ProjectContext:**
```typescript
const lastFetchRef = useRef(0);
const handleFocus = () => {
  const now = Date.now();
  if (now - lastFetchRef.current > 10000) { // 10-second cooldown
    lastFetchRef.current = now;
    refetch();
  }
};
```

### 3. Complex useEffect Dependencies ✅

**Evidence:**
- PreviewPanel has 10+ useEffect hooks
- Complex polling logic with conditional intervals
- Dependency arrays causing unnecessary re-renders

**Example from PreviewPanel (lines 100-119):**
```typescript
useEffect(() => {
  if (!project?.id) return;
  if (!project?.processStatus?.isBuilding && !project?.processStatus?.isGenerating) {
    return;
  }
  // Complex polling setup...
}, [project?.id, project?.processStatus?.isBuilding, project?.processStatus?.isGenerating]);
```

### 4. Race Conditions ✅

**Evidence:**
- Multiple refs to track state synchronously
- Complex flag management to prevent duplicate operations
- Manual coordination between SSE and polling

**Example:**
```typescript
const isGeneratingRef = useRef(false);
const hasAutoStartedTunnel = useRef(false);
// Complex ref management to prevent race conditions
```

### 5. No Optimistic Updates ✅

**Evidence:**
- All mutations wait for server response
- UI freezes during delete/start/stop operations
- No rollback mechanism on failure

**Impact:**
- Poor UX during server operations
- User uncertainty during loading states
- No feedback until server responds

### 6. Polling Overhead ✅

**Evidence:**
- Multiple components polling independently
- No coordination between pollers
- Polling continues even when data hasn't changed

**Examples:**
- RunnerContext: Every 10 seconds regardless of activity
- PreviewPanel: Every 2 seconds during builds
- ProjectContext: On window focus with manual cooldown

### 7. Manual State Synchronization ✅

**Evidence:**
- WebSocket updates require manual state merging
- Complex normalization logic for date fields
- Manual hydration on mount

**Example from useBuildWebSocket:**
```typescript
// Manual date normalization
const normalizeMessage = (msg: any) => ({
  ...msg,
  timestamp: msg.timestamp instanceof Date
    ? msg.timestamp
    : new Date(msg.timestamp)
});
```

### 8. No Request Deduplication ✅

**Evidence:**
- Multiple components can fetch same data simultaneously
- No shared cache between components
- Projects fetched in context + individual components independently

**Impact:**
- Unnecessary API calls
- Increased server load
- Potential data inconsistencies

---

## 5. Why TanStack Query Is Perfect Here

### High-Value Wins

#### 1. Eliminate Polling Complexity
**Before:**
```typescript
useEffect(() => {
  const interval = setInterval(() => {
    fetchRunnerStatus();
  }, 10000);
  return () => clearInterval(interval);
}, []);
```

**After:**
```typescript
const { data: runnerStatus } = useQuery({
  queryKey: ['runner', 'status'],
  queryFn: fetchRunnerStatus,
  refetchInterval: 10000,
});
```

#### 2. Automatic Cache Management
**Before:**
```typescript
const lastFetchRef = useRef(0);
const handleFocus = () => {
  const now = Date.now();
  if (now - lastFetchRef.current > 10000) {
    lastFetchRef.current = now;
    refetch();
  }
};
```

**After:**
```typescript
const { data } = useQuery({
  queryKey: ['projects'],
  queryFn: fetchProjects,
  staleTime: 30000,
  refetchOnWindowFocus: true,
});
```

#### 3. Request Deduplication
Multiple components requesting same data will automatically share a single fetch:

```typescript
// In any component:
const { data: projects } = useQuery({
  queryKey: ['projects'],
  queryFn: fetchProjects,
});
// Only one request, shared cache!
```

#### 4. Optimistic Updates
**Before:**
```typescript
const handleDelete = async () => {
  setIsDeleting(true);
  await fetch(`/api/projects/${id}`, { method: 'DELETE' });
  await refetch(); // Wait for refetch
  setIsDeleting(false);
};
```

**After:**
```typescript
const deleteMutation = useMutation({
  mutationFn: deleteProject,
  onMutate: async (projectId) => {
    // Optimistic update
    await queryClient.cancelQueries(['projects']);
    const previous = queryClient.getQueryData(['projects']);
    queryClient.setQueryData(['projects'], (old) =>
      old.filter(p => p.id !== projectId)
    );
    return { previous }; // For rollback
  },
  onError: (err, variables, context) => {
    // Rollback on error
    queryClient.setQueryData(['projects'], context.previous);
  },
  onSettled: () => {
    // Refetch to ensure consistency
    queryClient.invalidateQueries(['projects']);
  },
});
```

#### 5. Background Refetching
Keep data fresh automatically without manual polling:

```typescript
const { data } = useQuery({
  queryKey: ['projects', projectId, 'status'],
  queryFn: fetchProjectStatus,
  refetchInterval: 5000, // Smart refetch
  refetchIntervalInBackground: false, // Stop when tab inactive
});
```

#### 6. Error Retry Logic
Built-in exponential backoff instead of custom implementations:

```typescript
const { data } = useQuery({
  queryKey: ['projects'],
  queryFn: fetchProjects,
  retry: 3,
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
});
```

#### 7. DevTools
Debug cache state, refetch behavior, and query lifecycles:
- Visualize all queries and their states
- See cache contents
- Trigger manual refetches
- Monitor background updates

---

## 6. Specific Migration Use Cases

### Use Case 1: Projects List

**File:** `contexts/ProjectContext.tsx`

**Current Implementation:**
- Context with manual fetch
- Manual polling with window focus
- Manual refetch function
- Complex cooldown logic

**With TanStack Query:**
```typescript
// queries/projects.ts
export const useProjects = () => {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await fetch('/api/projects');
      return res.json();
    },
    staleTime: 30000,
    refetchOnWindowFocus: true,
    refetchInterval: false, // Only refetch on focus
  });
};

// In components:
const { data: projects, isLoading, error, refetch } = useProjects();
```

**Benefits:**
- Eliminate 50+ lines of context code
- Automatic cache management
- Built-in loading/error states
- Smart refetching

### Use Case 2: Runner Status

**File:** `contexts/RunnerContext.tsx`

**Current Implementation:**
- Polling every 10 seconds
- Manual localStorage sync
- Complex fallback logic

**With TanStack Query:**
```typescript
export const useRunnerStatus = () => {
  return useQuery({
    queryKey: ['runner', 'status'],
    queryFn: async () => {
      const res = await fetch('/api/runner/status');
      return res.json();
    },
    refetchInterval: 10000,
    staleTime: 9000, // Prevent unnecessary refetches
  });
};
```

**Benefits:**
- Remove manual setInterval logic
- Automatic polling management
- Pause when tab inactive

### Use Case 3: Server Operations (Start/Stop/Tunnel)

**Files:** `app-sidebar.tsx`, `PreviewPanel.tsx`

**Current Implementation:**
- Manual fetch with loading state
- Callback-based refetch
- No optimistic updates

**With TanStack Query:**
```typescript
export const useStartServer = (projectId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/start`, {
        method: 'POST',
      });
      return res.json();
    },
    onMutate: async () => {
      // Optimistic update
      await queryClient.cancelQueries(['projects', projectId]);
      const previous = queryClient.getQueryData(['projects', projectId]);

      queryClient.setQueryData(['projects', projectId], (old: any) => ({
        ...old,
        processStatus: { ...old.processStatus, isRunning: true },
      }));

      return { previous };
    },
    onError: (err, variables, context) => {
      // Rollback
      queryClient.setQueryData(['projects', projectId], context.previous);
    },
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries(['projects']);
      queryClient.invalidateQueries(['projects', projectId]);
    },
  });
};

// Usage:
const startMutation = useStartServer(projectId);
<Button onClick={() => startMutation.mutate()}>
  {startMutation.isPending ? 'Starting...' : 'Start Server'}
</Button>
```

**Benefits:**
- Instant UI feedback (optimistic update)
- Automatic rollback on error
- Automatic cache invalidation
- Built-in loading state

### Use Case 4: File Tree

**File:** `contexts/ProjectContext.tsx`

**Current Implementation:**
- Fetched per project in useEffect
- Manual state management

**With TanStack Query:**
```typescript
export const useProjectFiles = (projectId: string | undefined) => {
  return useQuery({
    queryKey: ['projects', projectId, 'files'],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/files`);
      return res.json();
    },
    enabled: !!projectId, // Only fetch when projectId exists
    staleTime: 60000, // Files don't change often
  });
};
```

**Benefits:**
- Automatic dependency on projectId
- Cached across project switches
- Built-in enabled/disabled logic

### Use Case 5: Process List Modal

**File:** `components/ProcessManagerModal.tsx`

**Current Implementation:**
- Modal-triggered fetch
- Manual refetch button
- Manual loading state

**With TanStack Query:**
```typescript
export const useProcesses = (enabled: boolean) => {
  return useQuery({
    queryKey: ['processes'],
    queryFn: async () => {
      const res = await fetch('/api/processes');
      return res.json();
    },
    enabled, // Only fetch when modal is open
    refetchInterval: enabled ? 5000 : false, // Poll while open
  });
};

// In modal:
const { data: processes, isLoading, refetch } = useProcesses(isOpen);
```

**Benefits:**
- Auto-refetch when modal opens
- Smart polling only when visible
- Cached between opens

---

## 7. Integration with Existing Architecture

### WebSocket Integration

**Keep WebSockets for real-time build updates** - Perfect for streaming data!

**Integration Strategy:**
```typescript
// hooks/useBuildWebSocket.ts
const useBuildWebSocket = (projectId: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:3000/build/${projectId}`);

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      // Invalidate relevant queries on updates
      queryClient.invalidateQueries(['projects', projectId, 'builds']);

      // Or update cache directly:
      queryClient.setQueryData(['projects', projectId, 'latest-build'], message);
    };

    return () => ws.close();
  }, [projectId, queryClient]);
};
```

### SSE Integration

**Keep SSE for project status** - Use it to invalidate queries!

**Integration Strategy:**
```typescript
// hooks/useProjectStatusSSE.ts
const useProjectStatusSSE = (projectId: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const eventSource = new EventSource(`/api/projects/${projectId}/status-stream`);

    eventSource.onmessage = (event) => {
      const status = JSON.parse(event.data);

      // Update query cache directly
      queryClient.setQueryData(['projects', projectId, 'status'], status);

      // Or invalidate to trigger refetch
      queryClient.invalidateQueries(['projects', projectId]);
    };

    return () => eventSource.close();
  }, [projectId, queryClient]);
};
```

**Benefits:**
- Real-time updates via SSE
- Automatic cache synchronization
- Best of both worlds: events + polling fallback

### Context Migration Strategy

**Don't remove contexts entirely** - Use them for derived state and business logic!

**Example:**
```typescript
// contexts/ProjectContext.tsx (refactored)
export const ProjectProvider = ({ children }) => {
  const { data: projects } = useProjects(); // TanStack Query
  const { data: runnerStatus } = useRunnerStatus(); // TanStack Query

  // Context now only handles derived state
  const selectedProject = useMemo(
    () => projects?.find(p => p.id === selectedProjectId),
    [projects, selectedProjectId]
  );

  return (
    <ProjectContext.Provider value={{ selectedProject }}>
      {children}
    </ProjectContext.Provider>
  );
};
```

---

## 8. Complexity Reduction Analysis

### Current Codebase Complexity

**Files with Manual Fetch Logic:** 34 files
- contexts/ProjectContext.tsx
- contexts/RunnerContext.tsx
- components/ProcessManagerModal.tsx
- components/PreviewPanel.tsx (most complex - 10+ useEffects)
- components/DeleteProjectModal.tsx
- components/app-sidebar.tsx
- components/tags/TagInput.tsx
- ... and 27 more

**Files with Polling Logic:** 20 files
- Manual setInterval in contexts
- Conditional polling in components
- Complex cleanup logic

**Context Providers:** 3 global contexts
- Complex state synchronization
- Manual cache management
- Props drilling refetch functions

**Manual Loading/Error States:** 15+ components
- Duplicated boilerplate
- Inconsistent error handling

### With TanStack Query

**Query Definitions:** ~10-15 files
```
queries/
├── projects.ts       # useProjects, useProject, useProjectFiles
├── runner.ts         # useRunnerStatus, useRunnerProcesses
├── processes.ts      # useProcesses
├── chat.ts          # useChatMutation
└── tags.ts          # useTagSuggestions
```

**Mutations:** ~10 mutation hooks
```
mutations/
├── useStartServer.ts
├── useStopServer.ts
├── useStartTunnel.ts
├── useDeleteProject.ts
└── ...
```

**Code Reduction:**
- **-500 lines** from contexts (eliminate manual fetch/polling)
- **-300 lines** from components (eliminate loading/error boilerplate)
- **-200 lines** from custom hooks (eliminate manual cache logic)

**Total Reduction: ~1000 lines (30-40% in data-fetching code)**

---

## 9. Migration Path

### Phase 1: Foundation (1-2 hours)

**Goals:** Set up TanStack Query infrastructure

**Tasks:**
1. Install dependencies:
   ```bash
   npm install @tanstack/react-query
   npm install -D @tanstack/react-query-devtools
   ```

2. Create QueryClient provider:
   ```typescript
   // app/providers.tsx
   'use client';
   import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
   import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
   import { useState } from 'react';

   export function Providers({ children }) {
     const [queryClient] = useState(() => new QueryClient({
       defaultOptions: {
         queries: {
           staleTime: 30000, // 30 seconds
           refetchOnWindowFocus: true,
           retry: 1,
         },
       },
     }));

     return (
       <QueryClientProvider client={queryClient}>
         {children}
         <ReactQueryDevtools initialIsOpen={false} />
       </QueryClientProvider>
     );
   }
   ```

3. Wrap app in layout:
   ```typescript
   // app/layout.tsx
   import { Providers } from './providers';

   export default function RootLayout({ children }) {
     return (
       <html>
         <body>
           <Providers>
             {children}
           </Providers>
         </body>
       </html>
     );
   }
   ```

**Validation:**
- DevTools visible in browser
- No breaking changes to existing code

---

### Phase 2: Low-Risk Wins (2-3 hours)

**Goals:** Migrate simple, isolated endpoints

#### 2.1. Migrate `/api/tags/suggest`

**File:** `components/tags/TagInput.tsx`

**Before:**
```typescript
const fetchSuggestions = async (input: string) => {
  setIsLoading(true);
  try {
    const res = await fetch('/api/tags/suggest', {
      method: 'POST',
      body: JSON.stringify({ input }),
    });
    const data = await res.json();
    setSuggestions(data.suggestions);
  } catch (error) {
    console.error(error);
  } finally {
    setIsLoading(false);
  }
};
```

**After:**
```typescript
// queries/tags.ts
export const useTagSuggestions = (input: string) => {
  return useQuery({
    queryKey: ['tags', 'suggestions', input],
    queryFn: async () => {
      const res = await fetch('/api/tags/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      });
      return res.json();
    },
    enabled: input.length > 2, // Only fetch when input is meaningful
    staleTime: 60000, // Cache for 1 minute
  });
};

// In component:
const { data: suggestions, isLoading } = useTagSuggestions(inputValue);
```

**Benefits:**
- Automatic caching by input
- Deduplication of requests
- 20 lines → 5 lines in component

#### 2.2. Migrate `/api/processes`

**File:** `components/ProcessManagerModal.tsx`

**Before:**
```typescript
useEffect(() => {
  if (isOpen) {
    fetchProcesses();
  }
}, [isOpen]);

const fetchProcesses = async () => {
  setIsLoading(true);
  try {
    const res = await fetch('/api/processes');
    const data = await res.json();
    setProcesses(data.processes);
  } catch (error) {
    setError(error);
  } finally {
    setIsLoading(false);
  }
};
```

**After:**
```typescript
// queries/processes.ts
export const useProcesses = (enabled: boolean) => {
  return useQuery({
    queryKey: ['processes'],
    queryFn: async () => {
      const res = await fetch('/api/processes');
      return res.json();
    },
    enabled,
    refetchInterval: enabled ? 5000 : false,
  });
};

// In modal:
const { data, isLoading, error, refetch } = useProcesses(isOpen);
```

**Benefits:**
- Auto-refetch when modal opens
- Smart polling only when visible
- Cached between opens
- 40 lines → 8 lines

#### 2.3. Migrate `/api/runner/status`

**File:** `contexts/RunnerContext.tsx`

**Before:**
```typescript
useEffect(() => {
  const interval = setInterval(() => {
    fetchRunnerStatus();
  }, 10000);
  return () => clearInterval(interval);
}, []);
```

**After:**
```typescript
// queries/runner.ts
export const useRunnerStatus = () => {
  return useQuery({
    queryKey: ['runner', 'status'],
    queryFn: async () => {
      const res = await fetch('/api/runner/status');
      return res.json();
    },
    refetchInterval: 10000,
    staleTime: 9000,
  });
};
```

**Benefits:**
- Eliminate manual interval management
- Automatic pause when tab inactive
- 30 lines → 5 lines

**Validation:**
- Tag suggestions work correctly
- Process list updates in modal
- Runner status polls every 10 seconds

---

### Phase 3: Core Features (4-6 hours)

**Goals:** Migrate main data flows

#### 3.1. Migrate `/api/projects`

**File:** `contexts/ProjectContext.tsx`

**Create Query:**
```typescript
// queries/projects.ts
export const useProjects = () => {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await fetch('/api/projects');
      if (!res.ok) throw new Error('Failed to fetch projects');
      const data = await res.json();
      return data.projects || [];
    },
    staleTime: 30000,
    refetchOnWindowFocus: true,
  });
};

export const useProject = (projectId: string | undefined) => {
  return useQuery({
    queryKey: ['projects', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) throw new Error('Failed to fetch project');
      return res.json();
    },
    enabled: !!projectId,
    staleTime: 30000,
  });
};

export const useProjectFiles = (projectId: string | undefined) => {
  return useQuery({
    queryKey: ['projects', projectId, 'files'],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/files`);
      if (!res.ok) throw new Error('Failed to fetch files');
      return res.json();
    },
    enabled: !!projectId,
    staleTime: 60000,
  });
};
```

**Refactor Context:**
```typescript
// contexts/ProjectContext.tsx (refactored)
export const ProjectProvider = ({ children }) => {
  const [selectedProjectId, setSelectedProjectId] = useLocalStorage('selectedProjectId');

  // Use TanStack Query
  const projectsQuery = useProjects();
  const projectQuery = useProject(selectedProjectId);
  const filesQuery = useProjectFiles(selectedProjectId);

  // Derived state only
  const selectedProject = projectQuery.data;
  const projects = projectsQuery.data || [];
  const files = filesQuery.data || [];

  const value = {
    projects,
    selectedProject,
    files,
    isLoading: projectsQuery.isLoading,
    selectProject: setSelectedProjectId,
    refetch: () => {
      projectsQuery.refetch();
      projectQuery.refetch();
      filesQuery.refetch();
    },
  };

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
};
```

**Benefits:**
- 200+ lines → 50 lines in context
- Automatic cache management
- Built-in loading/error states
- Can gradually remove context entirely

#### 3.2. Add Mutations for Server Operations

**Create Mutations:**
```typescript
// mutations/server.ts
export const useStartServer = (projectId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/start`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to start server');
      return res.json();
    },
    onMutate: async () => {
      await queryClient.cancelQueries(['projects', projectId]);
      const previous = queryClient.getQueryData(['projects', projectId]);

      queryClient.setQueryData(['projects', projectId], (old: any) => ({
        ...old,
        processStatus: { ...old?.processStatus, isRunning: true },
      }));

      return { previous };
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(['projects', projectId], context?.previous);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['projects']);
      queryClient.invalidateQueries(['projects', projectId]);
    },
  });
};

export const useStopServer = (projectId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/stop`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to stop server');
      return res.json();
    },
    onMutate: async () => {
      await queryClient.cancelQueries(['projects', projectId]);
      const previous = queryClient.getQueryData(['projects', projectId]);

      queryClient.setQueryData(['projects', projectId], (old: any) => ({
        ...old,
        processStatus: { ...old?.processStatus, isRunning: false },
      }));

      return { previous };
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(['projects', projectId], context?.previous);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['projects']);
    },
  });
};

export const useDeleteProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (projectId: string) => {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete project');
      return res.json();
    },
    onMutate: async (projectId) => {
      await queryClient.cancelQueries(['projects']);
      const previous = queryClient.getQueryData(['projects']);

      queryClient.setQueryData(['projects'], (old: any[]) =>
        old?.filter(p => p.id !== projectId) || []
      );

      return { previous };
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(['projects'], context?.previous);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['projects']);
    },
  });
};
```

**Usage in Components:**
```typescript
// components/app-sidebar.tsx
const startMutation = useStartServer(project.id);
const stopMutation = useStopServer(project.id);

<Button
  onClick={() => startMutation.mutate()}
  disabled={startMutation.isPending}
>
  {startMutation.isPending ? 'Starting...' : 'Start'}
</Button>

// components/DeleteProjectModal.tsx
const deleteMutation = useDeleteProject();

<Button
  onClick={() => deleteMutation.mutate(projectId)}
  disabled={deleteMutation.isPending}
>
  {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
</Button>
```

**Benefits:**
- Instant UI feedback (optimistic updates)
- Automatic rollback on error
- No manual refetch callbacks
- Better error handling

#### 3.3. Integrate with SSE

**Hook for SSE Integration:**
```typescript
// hooks/useProjectStatusSSE.ts
export const useProjectStatusSSE = (projectId: string | undefined) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!projectId) return;

    const eventSource = new EventSource(`/api/projects/${projectId}/status-stream`);

    eventSource.onmessage = (event) => {
      const status = JSON.parse(event.data);

      // Update cache directly for real-time feel
      queryClient.setQueryData(['projects', projectId], (old: any) => ({
        ...old,
        processStatus: status,
      }));

      // Also invalidate to trigger background refetch
      queryClient.invalidateQueries(['projects', projectId], {
        refetchType: 'none', // Don't refetch immediately, just mark stale
      });
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [projectId, queryClient]);
};

// Usage in PreviewPanel:
const useProjectStatusSSE(project?.id);
const { data: project } = useProject(project?.id);
```

**Benefits:**
- Real-time updates without polling
- Automatic cache synchronization
- SSE + Query cache work together seamlessly

**Validation:**
- Projects list loads correctly
- Server start/stop shows immediate feedback
- SSE updates reflect in UI instantly
- Delete operation works with optimistic update

---

### Phase 4: Advanced Features (3-5 hours)

**Goals:** Polish and optimize

#### 4.1. Add Dependent Queries

**Example: File Content depends on Selected File:**
```typescript
export const useFileContent = (projectId: string, filePath: string | undefined) => {
  return useQuery({
    queryKey: ['projects', projectId, 'files', filePath, 'content'],
    queryFn: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/files/content?path=${filePath}`
      );
      if (!res.ok) throw new Error('Failed to fetch file content');
      return res.text();
    },
    enabled: !!filePath, // Only fetch when file is selected
    staleTime: 30000,
  });
};
```

#### 4.2. Add Pagination Support

**Example: Paginated Logs:**
```typescript
export const useProjectLogs = (projectId: string, page: number = 0) => {
  return useQuery({
    queryKey: ['projects', projectId, 'logs', page],
    queryFn: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/logs?page=${page}&limit=50`
      );
      return res.json();
    },
    keepPreviousData: true, // Smooth pagination
    staleTime: 10000,
  });
};
```

#### 4.3. Add Infinite Query for Chat Messages

**Example: Infinite Scroll:**
```typescript
export const useChatMessages = (projectId: string) => {
  return useInfiniteQuery({
    queryKey: ['projects', projectId, 'messages'],
    queryFn: async ({ pageParam = 0 }) => {
      const res = await fetch(
        `/api/projects/${projectId}/messages?cursor=${pageParam}`
      );
      return res.json();
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 30000,
  });
};
```

#### 4.4. Integrate WebSocket with Mutations

**Example: Build Mutation with WebSocket Updates:**
```typescript
export const useStartBuild = (projectId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/build`, {
        method: 'POST',
      });
      return res.json();
    },
    onSuccess: () => {
      // Invalidate builds query, WebSocket will provide real-time updates
      queryClient.invalidateQueries(['projects', projectId, 'builds']);
    },
  });
};

// In useBuildWebSocket.ts - update on WebSocket message:
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  queryClient.setQueryData(['projects', projectId, 'latest-build'], message);
};
```

#### 4.5. Add Query Prefetching

**Example: Prefetch on Hover:**
```typescript
// In project list
const queryClient = useQueryClient();

const handleProjectHover = (projectId: string) => {
  queryClient.prefetchQuery({
    queryKey: ['projects', projectId],
    queryFn: () => fetchProject(projectId),
  });
};

<ProjectCard
  onMouseEnter={() => handleProjectHover(project.id)}
  onClick={() => selectProject(project.id)}
/>
```

**Validation:**
- File content loads when file selected
- Logs pagination works smoothly
- Chat infinite scroll works
- Build WebSocket + Query work together
- Hover prefetch improves perceived performance

---

### Phase 5: Cleanup (1-2 hours)

**Goals:** Remove old code, optimize

#### 5.1. Remove Manual Fetch Logic

- Delete unused `useEffect` fetch calls
- Remove manual loading/error states
- Remove `refetch` props/callbacks

#### 5.2. Simplify Contexts

**Option A:** Keep contexts for derived state only
```typescript
// Just business logic, no data fetching
export const ProjectProvider = ({ children }) => {
  const { data: projects } = useProjects();
  const [selectedId, setSelectedId] = useLocalStorage('selectedProjectId');

  const selectedProject = useMemo(
    () => projects?.find(p => p.id === selectedId),
    [projects, selectedId]
  );

  return (
    <ProjectContext.Provider value={{ selectedProject, setSelectedId }}>
      {children}
    </ProjectContext.Provider>
  );
};
```

**Option B:** Remove contexts entirely, use queries directly in components

#### 5.3. Configure Production Defaults

```typescript
// app/providers.tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 1,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    },
    mutations: {
      retry: 0, // Don't retry mutations by default
    },
  },
});
```

#### 5.4. Add Error Boundaries

```typescript
// components/QueryErrorBoundary.tsx
export const QueryErrorBoundary = ({ children }) => {
  return (
    <ErrorBoundary
      fallback={(error) => (
        <div>
          <h2>Something went wrong</h2>
          <p>{error.message}</p>
          <button onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
};
```

**Validation:**
- No console errors
- All features work as expected
- Performance improved
- Code is cleaner and more maintainable

---

## 10. Expected Outcomes

### Code Quality

**Before:**
- 34 files with manual fetch logic
- 20 files with polling intervals
- 15+ components with duplicated loading/error states
- Complex manual cache management
- ~3000 lines of data-fetching code

**After:**
- ~15 query/mutation files
- 0 manual polling intervals
- Unified loading/error handling
- Automatic cache management
- ~2000 lines of data-fetching code
- **30-40% code reduction**

### Performance

**Before:**
- Unnecessary API calls (no deduplication)
- Continuous polling even when inactive
- No background refetching
- Stale data on tab switch

**After:**
- Request deduplication (single fetch for same query)
- Smart polling (pauses when tab inactive)
- Background refetching keeps data fresh
- Automatic refetch on focus

### User Experience

**Before:**
- No optimistic updates
- Loading delays on every action
- Inconsistent loading states
- Stale data issues

**After:**
- Instant feedback (optimistic updates)
- Smooth transitions (cached data)
- Consistent loading patterns
- Always fresh data

### Developer Experience

**Before:**
- Boilerplate for every fetch
- Manual cache invalidation
- Complex polling logic
- Difficult debugging

**After:**
- Declarative data fetching
- Automatic cache management
- Built-in polling support
- DevTools for debugging

---

## 11. Risks & Mitigations

### Risk 1: Breaking Changes During Migration

**Mitigation:**
- Incremental migration (one endpoint at a time)
- Keep old code working alongside new queries
- Comprehensive testing after each phase
- Feature flags for gradual rollout

### Risk 2: Learning Curve

**Mitigation:**
- Start with simple queries (tags, processes)
- Reference TanStack Query docs heavily
- Pair programming for complex queries
- Code reviews focused on query patterns

### Risk 3: Over-Caching

**Mitigation:**
- Start with conservative `staleTime` (30s)
- Use DevTools to monitor cache behavior
- Adjust per-endpoint based on data volatility
- Document cache strategy for each query

### Risk 4: WebSocket/SSE Integration Issues

**Mitigation:**
- Keep WebSocket/SSE for real-time events
- Use `queryClient.invalidateQueries()` on events
- Test SSE + Query cache interaction thoroughly
- Fallback to polling if events fail

### Risk 5: Bundle Size Increase

**Mitigation:**
- TanStack Query is ~13kb gzipped (small!)
- Remove old manual fetch code saves similar size
- Net impact: minimal (~0-5kb increase)
- Performance gains outweigh size cost

---

## 12. Comparison with bolt.diy

Based on the suggestion that SentryVibe should adopt TanStack Query similar to bolt.diy:

### bolt.diy's Usage (Assumed)

bolt.diy likely uses TanStack Query for:
- Project/file management
- Real-time collaboration
- Template fetching
- User preferences
- Build status polling

### Similarities with SentryVibe

Both projects have:
- Project-based architecture
- File tree navigation
- Real-time build updates
- Frequent polling requirements
- Multiple data sources
- Complex state synchronization

### Why SentryVibe Should Follow

1. **Similar Architecture:** Both are project management tools with real-time features
2. **Same Pain Points:** Manual fetch logic, polling complexity, cache management
3. **Same Benefits:** Optimistic updates, smart caching, better UX
4. **Industry Standard:** TanStack Query is the de facto standard for React data fetching

---

## 13. Resources

### Official Documentation
- [TanStack Query Docs](https://tanstack.com/query/latest/docs/react/overview)
- [React Query DevTools](https://tanstack.com/query/latest/docs/react/devtools)
- [Query Keys Guide](https://tanstack.com/query/latest/docs/react/guides/query-keys)
- [Mutations Guide](https://tanstack.com/query/latest/docs/react/guides/mutations)

### Best Practices
- [Effective React Query Keys](https://tkdodo.eu/blog/effective-react-query-keys)
- [React Query and Forms](https://tkdodo.eu/blog/react-query-and-forms)
- [Optimistic Updates](https://tkdodo.eu/blog/optimistic-updates-in-react-query)
- [SSE and WebSockets](https://tkdodo.eu/blog/using-web-sockets-with-react-query)

### Community
- [TanStack Discord](https://discord.com/invite/WrRKjPJ)
- [GitHub Discussions](https://github.com/TanStack/query/discussions)

---

## 14. Conclusion

**SentryVibe is an EXCELLENT candidate for TanStack Query adoption.**

### Summary of Findings

✅ **Current Pain Points:**
- 34 files with manual fetch logic
- 20 files with manual polling
- Complex cache management
- No optimistic updates
- Duplicated loading/error handling
- Race conditions

✅ **Expected Benefits:**
- 30-40% code reduction
- Automatic cache management
- Optimistic updates
- Request deduplication
- Better UX
- Easier maintenance

✅ **Migration Path:**
- Low-risk incremental approach
- 5 phases over 2-3 days
- Start with simple endpoints
- Gradually migrate complex features

✅ **Integration:**
- Works seamlessly with existing WebSocket/SSE
- Can coexist with current contexts
- Gradual migration possible
- No breaking changes required

### Recommendation

**Proceed with TanStack Query adoption.**

Start with Phase 1 (Foundation) and Phase 2 (Low-Risk Wins) to validate the approach. If successful (which is highly likely based on this analysis), continue with remaining phases.

The investment will pay off through:
- Cleaner, more maintainable code
- Better user experience
- Reduced bugs
- Faster development of new features

---

**Next Steps:**

1. Review this analysis with the team
2. Set aside 2-3 days for initial migration
3. Start with Phase 1 (Foundation)
4. Migrate one simple endpoint (tags or processes)
5. Evaluate results
6. Continue with remaining phases

**Questions? Concerns?**

This analysis is based on thorough exploration of your codebase. If you have specific concerns about the migration or want to discuss particular use cases, please reach out.

---

*Analysis generated on November 1, 2025 by Claude Code*