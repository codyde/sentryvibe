"use client";

import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";
import TabbedPreview from "@/components/TabbedPreview";
import TerminalOutput from "@/components/TerminalOutput";
import ProcessManagerModal from "@/components/ProcessManagerModal";
import RenameProjectModal from "@/components/RenameProjectModal";
import DeleteProjectModal from "@/components/DeleteProjectModal";
import SummaryCard from "@/components/SummaryCard";
import CodeBlock from "@/components/CodeBlock";
import BuildProgress from "@/components/BuildProgress";
import ChatUpdate from "@/components/ChatUpdate";
import ProjectMetadataCard from "@/components/ProjectMetadataCard";
import { BuildChatTabs } from "@/components/BuildChatTabs";
import { ActiveTodoIndicator } from "@/components/ActiveTodoIndicator";
import { BuildCompleteCard } from "@/components/BuildCompleteCard";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { CommandPaletteProvider } from "@/components/CommandPaletteProvider";
import { useProjects, type Project } from "@/contexts/ProjectContext";
import { useRunner } from "@/contexts/RunnerContext";
import { useAgent } from "@/contexts/AgentContext";
import type {
  GenerationState,
  ToolCall,
  BuildOperationType,
  CodexSessionState,
  TodoItem,
} from "@/types/generation";
import {
  saveGenerationState,
  deserializeGenerationState,
} from "@sentryvibe/agent-core/lib/generation-persistence";
import {
  detectOperationType,
  createFreshGenerationState,
  validateGenerationState,
  createInitialCodexSessionState,
} from "@sentryvibe/agent-core/lib/build-helpers";
import { processCodexEvent } from "@sentryvibe/agent-core/lib/agents/codex/events";
import ElementChangeCard from "@/components/ElementChangeCard";
import { TagInput } from "@/components/tags/TagInput";
import type { AppliedTag } from "@sentryvibe/agent-core/types/tags";
import type { TagOption } from "@sentryvibe/agent-core/config/tags";
import { parseModelTag } from "@sentryvibe/agent-core/lib/tags/model-parser";
import { getClaudeModelLabel } from "@sentryvibe/agent-core/client";
import { deserializeTags, serializeTags } from "@sentryvibe/agent-core/lib/tags/serialization";
import { useBuildWebSocket } from "@/hooks/useBuildWebSocket";
import { WebSocketStatus } from "@/components/WebSocketStatus";
import { useProjectStatusSSE } from "@/hooks/useProjectStatusSSE";
import dynamic from "next/dynamic";
import {
  messageCollection,
  upsertMessage,
} from "@/collections";
import type { Message, MessagePart, ElementChange } from "@/types/messages";

// Dynamic import for ChatInterface - client-only component using TanStack DB
// ssr: false prevents Next.js pre-rendering, solving useSyncExternalStore issue
const ChatInterface = dynamic(
  () => import("@/components/ChatInterface").then((mod) => ({ default: mod.ChatInterface })),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-400">Loading chat...</div>
      </div>
    ),
  }
);

const DEBUG_PAGE = false; // Set to true to enable verbose page logging

function HomeContent() {
  const [input, setInput] = useState("");

  // MIGRATION: Side-by-side approach
  // Keep legacy state during migration, will remove after testing
  const [messages_LEGACY, setMessages] = useState<Message[]>([]);

  const [activeTab_LEGACY, setActiveTab_LEGACY] = useState<'chat' | 'build'>('chat');
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzingTemplate, setIsAnalyzingTemplate] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<{
    name: string;
    framework: string;
    analyzedBy: string;
  } | null>(null);
  const [templateProvisioningInfo, setTemplateProvisioningInfo] = useState<{
    templateName?: string;
    framework?: string;
    downloadPath?: string;
    timestamp?: Date;
  } | null>(null);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [renamingProject, setRenamingProject] = useState<{ id: string; name: string } | null>(null);
  const [deletingProject, setDeletingProject] = useState<{ id: string; name: string; slug: string } | null>(null);
  const [appliedTags, setAppliedTags] = useState<AppliedTag[]>([]);
  const [terminalDetectedPort, setTerminalDetectedPort] = useState<
    number | null
  >(null);
  const [generationState, setGenerationState] =
    useState<GenerationState | null>(null);
  const [isStartingServer, setIsStartingServer] = useState(false);
  const [isStoppingServer, setIsStoppingServer] = useState(false);
  const [isStartingTunnel, setIsStartingTunnel] = useState(false);
  const [isStoppingTunnel, setIsStoppingTunnel] = useState(false);
  const generationStateRef = useRef<GenerationState | null>(generationState);
  const [generationRevision, setGenerationRevision] = useState(0);
  
  // WebSocket connection for real-time updates (primary source)
  // Enable if: project exists AND (actively generating OR has active session in state)
  const hasActiveSession = generationState?.isActive === true;
  const {
    state: wsState,
    isConnected: wsConnected,
    isReconnecting: wsReconnecting,
    error: wsError,
    reconnect: wsReconnect,
    sentryTrace: wsSentryTrace,
  } = useBuildWebSocket({
    projectId: currentProject?.id || '',
    sessionId: undefined, // Subscribe to all sessions for this project
    enabled: !!currentProject && (isGenerating || hasActiveSession),
  });

  // SSE connection for real-time project status updates
  // This eliminates the need for manual polling in server operations
  useProjectStatusSSE(currentProject?.id, !!currentProject);

  // MIGRATION: TanStack DB Collections moved to ChatInterface component
  // useLiveQuery is now in client-only component (no SSR issues)
  const messages = messages_LEGACY;
  const activeTab = activeTab_LEGACY;


  const updateGenerationState = useCallback(
    (
      updater:
        | ((prev: GenerationState | null) => GenerationState | null)
        | GenerationState
        | null
    ) => {
      setGenerationState((prev) => {
        const next =
          typeof updater === "function"
            ? (
                updater as (
                  prev: GenerationState | null
                ) => GenerationState | null
              )(prev)
            : updater;

        generationStateRef.current = next;
        setGenerationRevision((rev) => rev + 1);
        return next;
      });
    },
    []
  );

  // Element changes tracked separately for Build tab
  const [activeElementChanges, setActiveElementChanges] = useState<
    ElementChange[]
  >([]);

  // History tracking - per project to preserve when switching
  const [buildHistoryByProject, setBuildHistoryByProject] = useState<
    Map<string, GenerationState[]>
  >(new Map());
  const [elementChangeHistoryByProject, setElementChangeHistoryByProject] =
    useState<Map<string, ElementChange[]>>(new Map());

  // Current project's history (derived from maps)
  const buildHistory = currentProject
    ? buildHistoryByProject.get(currentProject.id) || []
    : [];
  const elementChangeHistory = currentProject
    ? elementChangeHistoryByProject.get(currentProject.id) || []
    : [];

  // Track if component has mounted to avoid hydration errors
  const [isMounted, setIsMounted] = useState(false);
  const [isLoadingProject, setIsLoadingProject] = useState(false);

  // Don't read sessionStorage during SSR - prevents hydration mismatch
  const [activeView, setActiveView] = useState<"chat" | "build">("chat");
  const hasStartedGenerationRef = useRef<Set<string>>(new Set());
  const isGeneratingRef = useRef(false); // Sync flag for immediate checks
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const selectedProjectSlug = searchParams?.get("project") ?? null;
  const { projects, refetch, runnerOnline, setActiveProjectId } = useProjects();
  const { selectedRunnerId, availableRunners } = useRunner();
  const { selectedAgentId, selectedClaudeModelId, claudeModels } = useAgent();
  const selectedClaudeModel = claudeModels.find(
    (model) => model.id === selectedClaudeModelId,
  );
  const selectedClaudeModelLabel = selectedClaudeModel?.label ?? "Claude Haiku 4.5";

  // Restore view preference from sessionStorage after mount (avoids hydration error)
  useEffect(() => {
    setIsMounted(true);
    const stored = sessionStorage.getItem("preferredView") as
      | "chat"
      | "build"
      | null;
    if (stored) {
      setActiveView(stored);
    }
  }, []);

  // Load tags from existing project or initialize defaults for new project
  useEffect(() => {
    if (currentProject?.tags) {
      // Load tags from existing project
      const loadedTags = deserializeTags(currentProject.tags as any);
      setAppliedTags(loadedTags);
    } else if (!selectedProjectSlug && availableRunners.length > 0 && appliedTags.length === 0) {
      // Set default tags ONLY if no tags are currently applied
      // This prevents overwriting user's tag selections when availableRunners updates
      const defaultRunnerId = availableRunners[0]?.runnerId || selectedRunnerId;
      const defaultTags: AppliedTag[] = [
        {
          key: 'runner',
          value: defaultRunnerId,
          appliedAt: new Date()
        },
        {
          key: 'model',
          value: 'claude-haiku-4-5', // Default to Haiku for cost savings
          appliedAt: new Date()
        }
      ];
      setAppliedTags(defaultTags);
      console.log('[page] ✓ Default tags set: runner=%s, model=claude-haiku-4-5', defaultRunnerId);
    }
  }, [currentProject, selectedProjectSlug, availableRunners, selectedRunnerId, appliedTags.length]);

  useEffect(() => {
    generationStateRef.current = generationState;
  }, [generationState]);
  
  // Sync WebSocket state to local state (both hydrated and live updates)
  // IMPORTANT: Merge WebSocket updates with existing state to preserve metadata
  useEffect(() => {
    if (wsState) {
      if (DEBUG_PAGE) console.log('🔌 WebSocket state update:', {
        isConnected: wsConnected,
        hasState: !!wsState,
        agentId: wsState.agentId,
        claudeModelId: wsState.claudeModelId,
        projectName: wsState.projectName,
        todosLength: wsState.todos?.length,
      });
      
      setGenerationState((prevState) => {
        // If no previous state, use WebSocket state as-is
        if (!prevState) {
          if (DEBUG_PAGE) console.log('   No previous state, using WebSocket state directly');
          return wsState;
        }
        
        // Merge WebSocket updates with existing state
        // This preserves fields like agentId, claudeModelId that may not be in WebSocket updates
        const merged = {
          ...prevState,
          ...wsState,
          // Ensure critical metadata is never lost (use WebSocket value OR previous value)
          agentId: wsState.agentId || prevState.agentId,
          claudeModelId: wsState.claudeModelId || prevState.claudeModelId,
          projectId: wsState.projectId || prevState.projectId,
          projectName: wsState.projectName || prevState.projectName,
          operationType: wsState.operationType || prevState.operationType,
        };
        
        if (DEBUG_PAGE) console.log('   Merged state:', {
          agentId: merged.agentId,
          claudeModelId: merged.claudeModelId,
          projectName: merged.projectName,
        });
        
        return merged;
      });
    }
  }, [wsState, wsConnected]);

  const ensureGenerationState = useCallback(
    (prevState: GenerationState | null): GenerationState | null => {
      // Capture values BEFORE any type narrowing/early returns
      const existingState =
        prevState || generationStateRef.current || generationState;
      const previousOperationType = existingState?.operationType;
      const previousAgentId = existingState?.agentId;
      const previousClaudeModelId = existingState?.claudeModelId;

      if (prevState) return prevState;
      if (generationStateRef.current) return generationStateRef.current;
      if (generationState) return generationState;
      if (currentProject) {
        return createFreshGenerationState({
          projectId: currentProject.id,
          projectName: currentProject.name,
          operationType: previousOperationType ?? "initial-build",
          agentId: previousAgentId ?? selectedAgentId,
          claudeModelId:
            selectedAgentId === "claude-code"
              ? previousClaudeModelId ?? selectedClaudeModelId
              : undefined,
        });
      }
      return null;
    },
    [
      generationState,
      currentProject,
      selectedAgentId,
      selectedClaudeModelId,
    ]
  );

  const updateCodexState = useCallback(
    (mutator: (state: CodexSessionState) => CodexSessionState) => {
      updateGenerationState((prev) => {
        const baseState = ensureGenerationState(prev);
        if (!baseState) return prev;

        const existingCodex =
          baseState.codex ?? createInitialCodexSessionState();
        const workingCodex: CodexSessionState = {
          ...existingCodex,
          phases: existingCodex.phases.map((phase) => ({ ...phase })),
          executionInsights: existingCodex.executionInsights
            ? existingCodex.executionInsights.map((insight) => ({ ...insight }))
            : [],
        };

        const nextCodex = mutator(workingCodex);
        const updated: GenerationState = {
          ...baseState,
          agentId: baseState.agentId ?? "openai-codex",
          codex: {
            ...nextCodex,
            phases: nextCodex.phases.map((phase) => ({ ...phase })),
            executionInsights: nextCodex.executionInsights
              ? nextCodex.executionInsights.map((insight) => ({ ...insight }))
              : [],
            lastUpdatedAt: new Date(),
          },
        };

        if (DEBUG_PAGE) console.log("🌀 Codex state updated:", {
          phases: updated.codex?.phases.map((p) => `${p.id}:${p.status}`),
        });

        // Note: No saveGenerationState() - persistent processor handles all DB writes
        // Frontend just receives WebSocket updates (read-only)
        return updated;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Use ref to access latest projects without triggering effects
  const projectsRef = useRef(projects);
  projectsRef.current = projects;

  const isLoading = isCreatingProject || isGenerating;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const isNearBottom = useCallback(() => {
    if (!scrollContainerRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } =
      scrollContainerRef.current;
    const threshold = 100; // pixels from bottom
    return scrollHeight - scrollTop - clientHeight < threshold;
  }, []);

  // Handle tab switching
  const switchTab = useCallback((tab: "chat" | "build") => {
    setActiveView(tab);
    sessionStorage.setItem("preferredView", tab);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "1") {
        e.preventDefault();
        switchTab("chat");
      } else if ((e.metaKey || e.ctrlKey) && e.key === "2") {
        e.preventDefault();
        switchTab("build");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [switchTab]);

  // Listen for selection change requests from SelectionMode
  useEffect(() => {
    const handleSelectionChange = (e: CustomEvent) => {
      const { element, prompt } = e.detail;
      if (DEBUG_PAGE) console.log("🎯 Selection change received:", { element, prompt });

      if (!currentProject) {
        if (DEBUG_PAGE) console.warn("⚠️ No current project for element change");
        return;
      }

      // Switch to Build tab to show element change
      switchTab("build");

      // Create element change
      const changeId = `element-change-${Date.now()}`;
      const newChange: ElementChange = {
        id: changeId,
        elementSelector: element?.selector || "unknown",
        changeRequest: prompt,
        elementInfo: {
          tagName: element?.tagName,
          className: element?.className,
          textContent: element?.textContent,
        },
        status: "processing",
        toolCalls: [],
      };

      setActiveElementChanges((prev) => [...prev, newChange]);

      // Start element change stream
      startElementChange(currentProject.id, prompt, element, changeId);
    };

    window.addEventListener(
      "selection-change-requested",
      handleSelectionChange as EventListener
    );
    return () =>
      window.removeEventListener(
        "selection-change-requested",
        handleSelectionChange as EventListener
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject]);

  // Auto-switch to Build when todos first populate
  const previousTodoCountRef = useRef(0);
  const codexAutoSwitchRef = useRef(false);
  useEffect(() => {
    codexAutoSwitchRef.current = false;
  }, [generationState?.id]);
  useEffect(() => {
    const currentTodoCount = generationState?.todos?.length || 0;

    if (DEBUG_PAGE) console.log("👀 Todo count tracker:", {
      current: currentTodoCount,
      previous: previousTodoCountRef.current,
      activeView,
      shouldSwitch: currentTodoCount > 0 && previousTodoCountRef.current === 0,
    });

    // If we just got our first todo, switch to build tab (regardless of current tab)
    if (currentTodoCount > 0 && previousTodoCountRef.current === 0) {
      if (DEBUG_PAGE) console.log("📊 First todos arrived! Switching to Build tab");
      switchTab("build");
    }

    previousTodoCountRef.current = currentTodoCount;
  }, [generationState?.todos?.length, activeView, switchTab]);

  useEffect(() => {
    const isCodex =
      (generationState?.agentId ?? selectedAgentId) === "openai-codex";
    if (!isCodex) {
      codexAutoSwitchRef.current = false;
      return;
    }
    if (!generationState?.codex?.lastUpdatedAt) return;
    if (codexAutoSwitchRef.current) return;
    if (DEBUG_PAGE) console.log("🌀 Codex activity detected, switching to Build tab");
    switchTab("build");
    codexAutoSwitchRef.current = true;
  }, [
    generationState?.codex?.lastUpdatedAt,
    generationState?.agentId,
    selectedAgentId,
    switchTab,
  ]);

  // Archive completed builds to history (per project)
  useEffect(() => {
    if (!generationState || generationState.isActive || !currentProject) {
      return;
    }

    const isCodexBuildState =
      (generationState.agentId ?? selectedAgentId) === "openai-codex";
    const hasCodexData = isCodexBuildState && !!generationState.codex;
    const hasTodoHistory =
      Array.isArray(generationState.todos) && generationState.todos.length > 0;

    if (!hasCodexData && !hasTodoHistory) {
      return;
    }

    const projectHistory = buildHistoryByProject.get(currentProject.id) || [];
    const alreadyArchived = projectHistory.some(
      (b) => b.id === generationState.id
    );

    if (!alreadyArchived) {
      if (DEBUG_PAGE) console.log(
        "📚 Archiving completed build to history:",
        generationState.id
      );
      setBuildHistoryByProject((prev) => {
        const newMap = new Map(prev);
        newMap.set(currentProject.id, [generationState, ...projectHistory]);
        return newMap;
      });
    }
  }, [generationState, currentProject, buildHistoryByProject, selectedAgentId]);

  // Calculate badge values
  const buildProgress = generationState
    ? Math.round(
        (generationState.todos.filter((t) => t.status === "completed").length /
          generationState.todos.length) *
          100
      ) || 0
    : 0;

  // Only auto-scroll if user is near bottom or if loading (new message streaming)
  useEffect(() => {
    if (isLoading || isNearBottom()) {
      scrollToBottom();
    }
  }, [messages, isLoading, generationRevision, isNearBottom, scrollToBottom]);

  const lastLoadedProjectRef = useRef<string | null>(null);
  const lastLoadTimeRef = useRef<number>(0);

  const loadMessages = useCallback(
    async (projectId: string) => {
      if (DEBUG_PAGE) console.log("📥 Loading messages for project:", projectId);
      if (DEBUG_PAGE) console.log("   Generating ref?", isGeneratingRef.current);

      // Only block if ACTIVELY generating right now
      if (isGeneratingRef.current) {
        if (DEBUG_PAGE) console.log("🛑 BLOCKED - currently generating");
        return;
      }

      // Debounce: Skip if we just loaded messages for this project recently (within 2 seconds)
      const now = Date.now();
      if (
        lastLoadedProjectRef.current === projectId &&
        now - lastLoadTimeRef.current < 2000
      ) {
        if (DEBUG_PAGE) console.log("⏭️  SKIPPED - messages loaded recently");
        return;
      }

      lastLoadedProjectRef.current = projectId;
      lastLoadTimeRef.current = now;
      setIsLoadingProject(true);

      try {
        const res = await fetch(`/api/projects/${projectId}/messages`);
        const data = await res.json();

        if (data.messages) {
          if (DEBUG_PAGE) console.log(`   Found ${data.messages.length} messages in DB`);

          if (data.messages.length === 0) {
            if (DEBUG_PAGE) console.log("   ℹ️  No messages in DB, keeping current messages");
            return; // Don't wipe existing messages if DB is empty
          }

          const regularMessages: Message[] = [];
          const archivedElementChanges: ElementChange[] = [];

          data.messages.forEach(
            (msg: {
              id: string;
              role: "user" | "assistant";
              content: MessagePart[];
            }) => {
              const parts = Array.isArray(msg.content) ? msg.content : [];

              // Check if this is an element change message
              const elementChangePart = parts.find(
                (p) => p.type === "element-change"
              );
              if (
                elementChangePart &&
                (
                  elementChangePart as unknown as {
                    elementChange: ElementChange;
                  }
                ).elementChange
              ) {
                // Add to element change history instead of messages
                archivedElementChanges.push(
                  (
                    elementChangePart as unknown as {
                      elementChange: ElementChange;
                    }
                  ).elementChange
                );
              } else {
                // Regular message
                regularMessages.push({
                  id: msg.id,
                  projectId: projectId, // Add for TanStack DB Message type
                  role: msg.role,
                  parts,
                  timestamp: Date.now(), // Add for TanStack DB Message type
                });
              }
            }
          );

          if (DEBUG_PAGE) console.log(
            "   ✅ Loaded:",
            regularMessages.length,
            "messages,",
            archivedElementChanges.length,
            "element changes"
          );

          // MIGRATION: With TanStack DB, this manual loading is replaced by QueryCollection
          // The messageCollection automatically fetches from PostgreSQL via queryCollectionOptions
          // This loadMessages function can be deleted after migration complete

          // Legacy hydration (keeping during migration)
          setMessages(regularMessages);

          if (archivedElementChanges.length > 0) {
            setElementChangeHistoryByProject((prev) => {
              const newMap = new Map(prev);
              newMap.set(projectId, archivedElementChanges);
              return newMap;
            });
          }

          if (Array.isArray(data.sessions)) {
            const hydratedSessions: GenerationState[] = [];

            data.sessions.forEach((entry: unknown) => {
              const typedEntry = entry as {
                session?: Record<string, unknown>;
                hydratedState?: Record<string, unknown>;
              };
              const session = typedEntry.session;
              const raw = typedEntry.hydratedState as
                | Record<string, unknown>
                | undefined;

              const rebuild = (): GenerationState | null => {
                if (!raw) return null;

                try {
                  const toolsByTodo: Record<number, ToolCall[]> = {};
                  if (raw.toolsByTodo) {
                    Object.entries(
                      raw.toolsByTodo as Record<string, unknown[]>
                    ).forEach(([key, tools]) => {
                      const todoIndex = parseInt(key, 10);
                      toolsByTodo[todoIndex] = (tools || []).map(
                        (tool: unknown) => {
                          const t = tool as Record<string, unknown>;
                          return {
                            ...t,
                            startTime: t.startTime
                              ? new Date(t.startTime as string | number)
                              : new Date(),
                            endTime: t.endTime
                              ? new Date(t.endTime as string | number)
                              : undefined,
                          } as ToolCall;
                        }
                      );
                    });
                  }

                  const textByTodo: Record<
                    number,
                    GenerationState["textByTodo"][number]
                  > = {};
                  if (raw.textByTodo) {
                    Object.entries(
                      raw.textByTodo as Record<string, unknown[]>
                    ).forEach(([key, notes]) => {
                      const todoIndex = parseInt(key, 10);
                      textByTodo[todoIndex] = (notes || []).map(
                        (note: unknown) => {
                          const n = note as Record<string, unknown>;
                          return {
                            ...n,
                            timestamp: n.timestamp
                              ? new Date(n.timestamp as string | number)
                              : new Date(),
                          } as GenerationState["textByTodo"][number][number];
                        }
                      );
                    });
                  }

                  const todos: TodoItem[] = Array.isArray(raw.todos)
                    ? raw.todos.map((todo: unknown) => {
                        const typedTodo = todo as {
                          content?: string;
                          status?: string;
                          activeForm?: string;
                        };
                        return {
                          content: typedTodo.content ?? "",
                          status: typedTodo.status ?? "pending",
                          activeForm:
                            typedTodo.activeForm ?? typedTodo.content ?? "",
                        } as TodoItem;
                      })
                    : [];

                  return {
                    id:
                      (raw.id as string) ??
                      (session?.buildId as string) ??
                      `build-${(session?.id as number) ?? Date.now()}`,
                    projectId:
                      (raw.projectId as string) ??
                      (session?.projectId as string) ??
                      projectId,
                    projectName:
                      (raw.projectName as string) ??
                      (session?.projectName as string) ??
                      currentProject?.name ??
                      "Untitled Project",
                    operationType:
                      (raw.operationType as BuildOperationType) ??
                      (session?.operationType as BuildOperationType) ??
                      "continuation",
                    agentId: raw.agentId as GenerationState['agentId'] | undefined,
                    claudeModelId: raw.claudeModelId as GenerationState['claudeModelId'] | undefined,
                    todos,
                    toolsByTodo,
                    textByTodo,
                    activeTodoIndex:
                      typeof raw.activeTodoIndex === "number"
                        ? raw.activeTodoIndex
                        : -1,
                    isActive:
                      (raw.isActive as boolean) ?? session?.status === "active",
                    startTime: raw.startTime
                      ? new Date(raw.startTime as string | number)
                      : session?.startedAt
                      ? new Date(session.startedAt as string | number)
                      : new Date(),
                    endTime: raw.endTime
                      ? new Date(raw.endTime as string | number)
                      : session?.endedAt
                      ? new Date(session.endedAt as string | number)
                      : undefined,
                    codex: raw.codex as GenerationState['codex'] | undefined,
                  };
                } catch (err) {
                  if (DEBUG_PAGE) console.warn(
                    "Failed to rebuild generation state from session",
                    err
                  );
                  return null;
                }
              };

              const parsed = rebuild();
              if (parsed) {
                hydratedSessions.push(parsed);
              }
            });

            if (hydratedSessions.length > 0) {
              setBuildHistoryByProject((prev) => {
                const newMap = new Map(prev);
                newMap.set(
                  projectId,
                  hydratedSessions
                    .filter((state) => !state.isActive)
                    .sort(
                      (a, b) => b.startTime.getTime() - a.startTime.getTime()
                    )
                );
                return newMap;
              });

              if (!isGeneratingRef.current) {
                const activeSession = hydratedSessions.find(
                  (state) => state.isActive
                );
                if (activeSession) {
                  if (DEBUG_PAGE) console.log("   🔄 Restoring active session from DB");
                  updateGenerationState(activeSession);
                } else if (hydratedSessions.length > 0) {
                  const latestCompleted = [...hydratedSessions]
                    .filter((state) => !state.isActive)
                    .sort(
                      (a, b) => b.startTime.getTime() - a.startTime.getTime()
                    )[0];
                  if (latestCompleted) {
                    // Check if this session just completed (within last 5 minutes)
                    const timeSinceCompletion = Date.now() - latestCompleted.startTime.getTime();
                    const recentlyCompleted = timeSinceCompletion < 5 * 60 * 1000;

                    if (recentlyCompleted && DEBUG_PAGE) {
                      console.log("   ✅ Build completed while disconnected - showing final state");
                    } else if (DEBUG_PAGE) {
                      console.log("   📚 Restoring most recent completed session for context");
                    }

                    updateGenerationState({
                      ...latestCompleted,
                      isActive: false,
                    });
                  }
                }
              }
            }
          }
        }
      } catch (error) {
        console.error("Failed to load messages:", error);
      } finally {
        setIsLoadingProject(false);
      }
    },
    [currentProject, updateGenerationState]
  );

  // Initialize project when slug or project data changes (handles data arriving after navigation)
  useEffect(() => {
    if (selectedProjectSlug) {
      const project = projectsRef.current.find(
        (p) => p.slug === selectedProjectSlug
      );
      if (project && (!currentProject || currentProject.id !== project.id)) {
        if (DEBUG_PAGE) console.log("🔄 Project changed to:", project.slug);
        if (DEBUG_PAGE) console.log("   Currently generating?", isGeneratingRef.current);
        if (DEBUG_PAGE) console.log("   Has generationState in DB?", !!project.generationState);
        setCurrentProject(project);
        setActiveProjectId(project.id);

        // CRITICAL: Don't touch generationState if we're actively generating!
        if (isGeneratingRef.current) {
          if (DEBUG_PAGE) console.log(
            "⚠️  Generation in progress - keeping existing generationState"
          );
          return;
        }

        // Load persisted generationState if it exists
        if (project.generationState) {
          if (DEBUG_PAGE) console.log("🎨 Restoring generationState from DB...");
          const restored = deserializeGenerationState(
            project.generationState as string
          );

          if (restored && validateGenerationState(restored)) {
            if (DEBUG_PAGE) console.log("   ✅ Valid state, todos:", restored.todos.length);
            updateGenerationState(restored);
          }
        }

        // Load messages
        if (DEBUG_PAGE) console.log("📥 Loading messages from DB...");
        loadMessages(project.id);
      } else if (!project) {
        if (DEBUG_PAGE) console.log(
          "⚠️  No project found for slug yet:",
          selectedProjectSlug,
          "Projects loaded:",
          projectsRef.current.length
        );
      }
    } else {
      // Leaving project
      if (isGeneratingRef.current) {
        if (DEBUG_PAGE) console.log("⚠️  Generation in progress - not clearing state");
        return;
      }

      setCurrentProject(null);
      setActiveProjectId(null);

      // MIGRATION: With TanStack DB, no need to clear messages manually!
      // The useLiveQuery automatically filters by currentProject.id
      // When currentProject is null, query returns empty array
      // messageCollection keeps all messages (per-project history)

      // Legacy (keeping during migration)
      setMessages([]);

      updateGenerationState(null);
      setActiveElementChanges([]);
      setTemplateProvisioningInfo(null);
      // Don't clear history - it's now per-project and preserved
      setTerminalDetectedPort(null);
      hasStartedGenerationRef.current.clear();
    }
  }, [
    selectedProjectSlug,
    projects,
    currentProject,
    setActiveProjectId,
    loadMessages,
    updateGenerationState,
  ]);

  // Sync currentProject with latest data - immediate for important changes, debounced for rapid updates
  const lastSyncKeyRef = useRef<string>("");
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!selectedProjectSlug || !currentProject) return;

    const latestProject = projects.find((p) => p.id === currentProject.id);
    if (!latestProject) return;

    // Create comparison key from critical fields
    const latestKey = `${latestProject.status}-${latestProject.devServerStatus}-${latestProject.devServerPort}`;

    // If data hasn't changed, skip
    if (lastSyncKeyRef.current === latestKey) return;

    const now = Date.now();
    const timeSinceLastSync = now - lastSyncTimeRef.current;

    // If it's been more than 500ms since last sync, update immediately (user action)
    if (timeSinceLastSync > 500) {
      if (DEBUG_PAGE) console.log(
        "🔄 Syncing currentProject immediately (user action or first update)"
      );
      lastSyncKeyRef.current = latestKey;
      lastSyncTimeRef.current = now;
      setCurrentProject(latestProject);
    } else {
      // Rapid updates - debounce
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }

      syncTimeoutRef.current = setTimeout(() => {
        if (DEBUG_PAGE) console.log("🔄 Syncing currentProject after debounce (rapid updates)");
        lastSyncKeyRef.current = latestKey;
        lastSyncTimeRef.current = Date.now();
        setCurrentProject(latestProject);
      }, 200);
    }

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [projects, selectedProjectSlug]);

  // Auto-start dev server when project status changes to completed
  const prevProjectStatusRef = useRef<string | null>(null);
  useEffect(() => {
    const currentStatus = currentProject?.status;
    const prevStatus = prevProjectStatusRef.current;

    // Trigger auto-start when transitioning from in_progress to completed
    if (
      prevStatus === "in_progress" &&
      currentStatus === "completed" &&
      currentProject?.runCommand &&
      currentProject?.devServerStatus !== "running"
    ) {
      if (DEBUG_PAGE) console.log("🚀 Generation completed, auto-starting dev server...");
      setTimeout(() => startDevServer(), 1000);
    }

    prevProjectStatusRef.current = currentStatus || null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentProject?.status,
    currentProject?.devServerStatus,
    currentProject?.runCommand,
  ]);

  // Disabled: We now handle generation directly in handleSubmit without redirects
  // This prevents the flash/reload issue when creating new projects

  const startElementChange = async (
    projectId: string,
    prompt: string,
    element: Record<string, unknown>,
    changeId: string
  ) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operationType: "focused-edit",
          prompt,
          runnerId: selectedRunnerId,
          agent: selectedAgentId,
          claudeModel:
            selectedAgentId === "claude-code" ? selectedClaudeModelId : undefined,
          context: {
            elementSelector: element?.selector,
            elementInfo: {
              tagName: element?.tagName,
              className: element?.className,
              textContent: element?.textContent,
            },
          },
        }),
      });

      if (!res.ok) {
        throw new Error("Element change failed");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          if (line === "data: [DONE]") {
            if (DEBUG_PAGE) console.log("✅ SSE stream completed for project", projectId);
            continue;
          }

          const payload = line.slice(6);
          if (!payload.trim()) {
            continue;
          }

          try {
            const data = JSON.parse(payload);

            // Update element change with tool calls
            if (data.type === "tool-input-available") {
              setActiveElementChanges((prev) =>
                prev.map((change) => {
                  if (change.id === changeId) {
                    // Check if tool already exists (prevent duplicates)
                    const existingToolIndex = change.toolCalls.findIndex(
                      (t) => t.name === data.toolName && t.status === "running"
                    );

                    if (existingToolIndex >= 0) {
                      if (DEBUG_PAGE) console.log(
                        "⚠️ Tool already exists, skipping duplicate:",
                        data.toolName
                      );
                      return change;
                    }

                    return {
                      ...change,
                      toolCalls: [
                        ...change.toolCalls,
                        {
                          name: data.toolName,
                          input: data.input,
                          status: "running" as const,
                        },
                      ],
                    };
                  }
                  return change;
                })
              );
            } else if (data.type === "tool-output-available") {
              setActiveElementChanges((prev) =>
                prev.map((change) => {
                  if (change.id === changeId) {
                    // Find the matching running tool and update it
                    const updatedTools = change.toolCalls.map((tool) => {
                      if (tool.status === "running" && !tool.output) {
                        return {
                          ...tool,
                          output: data.output,
                          status: "completed" as const,
                        };
                      }
                      return tool;
                    });

                    return {
                      ...change,
                      toolCalls: updatedTools,
                    };
                  }
                  return change;
                })
              );
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      // Mark as completed and finalize all tool calls
      let completedChange: ElementChange | null = null;

      setActiveElementChanges((prev) => {
        const updated = prev.map((change) => {
          if (change.id === changeId) {
            completedChange = {
              ...change,
              status: "completed" as const,
              // Mark all tools as completed
              toolCalls: change.toolCalls.map((tool) => ({
                ...tool,
                status:
                  tool.status === "running"
                    ? ("completed" as const)
                    : tool.status,
              })),
            };
            return completedChange;
          }
          return change;
        });
        return updated;
      });

      // Wait a bit to let user see the completion
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Archive to history (per project) and remove from active
      if (completedChange) {
        setElementChangeHistoryByProject((prev) => {
          const newMap = new Map(prev);
          const projectHistory = newMap.get(projectId) || [];
          newMap.set(projectId, [completedChange!, ...projectHistory]);
          return newMap;
        });
        setActiveElementChanges((prev) =>
          prev.filter((c) => c.id !== changeId)
        );

        // Trigger iframe refresh after element change completes
        window.dispatchEvent(new CustomEvent('refresh-iframe'));

        // Save to database
        const saveRes = await fetch(`/api/projects/${projectId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: "assistant",
            content: [
              {
                type: "element-change",
                elementChange: completedChange,
              },
            ],
          }),
        });

        if (saveRes.ok) {
          // Success
        } else {
          console.error(
            "❌ Failed to save element change:",
            await saveRes.text()
          );
        }

        // Switch back to Chat after completion
        switchTab("chat");
      }
    } catch (error) {
      console.error("Element change error:", error);

      // Mark as failed
      setActiveElementChanges((prev) =>
        prev.map((change) => {
          if (change.id === changeId) {
            return {
              ...change,
              status: "failed" as const,
              error: error instanceof Error ? error.message : "Unknown error",
            };
          }
          return change;
        })
      );

      // Archive failed change to history after a delay
      await new Promise((resolve) => setTimeout(resolve, 2000));

      setActiveElementChanges((prev) => {
        const failedChange = prev.find((c) => c.id === changeId);
        if (failedChange) {
          setElementChangeHistoryByProject((prevMap) => {
            const newMap = new Map(prevMap);
            const projectHistory = newMap.get(projectId) || [];
            newMap.set(projectId, [failedChange, ...projectHistory]);
            return newMap;
          });

          // Save to database
          fetch(`/api/projects/${projectId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              role: "assistant",
              content: [
                {
                  type: "element-change",
                  elementChange: failedChange,
                },
              ],
            }),
          });
        }
        return prev.filter((c) => c.id !== changeId);
      });
    }
  };

  const startGeneration = async (
    projectId: string,
    prompt: string,
    options: {
      addUserMessage?: boolean;
      isElementChange?: boolean;
      isRetry?: boolean;
    } = {}
  ) => {
    const {
      addUserMessage = false,
      isElementChange = false,
      isRetry = false,
    } = options;

    // Lock FIRST
    isGeneratingRef.current = true;
    setIsGenerating(true);

    // Only add user message to UI if this is a continuation (not auto-start)
    if (addUserMessage) {
      const userMessage: Message = {
        id: crypto.randomUUID(), // Use UUID to match database
        projectId: projectId,
        type: "user", // Simplified: just type and content
        content: prompt,
        timestamp: Date.now(),
      };

      // MIGRATION: Use TanStack DB collection
      if (messageCollection) {
        messageCollection.insert(userMessage);
      }

      // Legacy (keeping during migration, will remove)
      setMessages((prev) => [...prev, userMessage as any]);
    }

    // Find project and detect operation type
    const project = projects.find((p) => p.id === projectId);
    if (!project) {
      console.error("❌ Project not found for ID:", projectId);
      setIsGenerating(false);
      isGeneratingRef.current = false;
      return;
    }

    // Initialize template info from existing project if available
    if (project.projectType && project.projectType !== "unknown" && !selectedTemplate) {
      const agentName = selectedAgentId === "claude-code" ? selectedClaudeModelLabel : "GPT-5 Codex";
      setSelectedTemplate({
        name: project.projectType,
        framework: project.projectType,
        analyzedBy: agentName,
      });
      if (DEBUG_PAGE) console.log(`📦 Initialized template info from project: ${project.projectType}`);
    }

    // Detect operation type
    const operationType = detectOperationType({
      project,
      isElementChange,
      isRetry,
    });
    
    // CRITICAL DEBUG: Log project state and detected operation type
    console.log("🎬 Starting build for existing project:", {
      projectName: project.name,
      projectId: project.id,
      projectStatus: project.status,
      hasRunCommand: !!project.runCommand,
      runCommand: project.runCommand,
      detectedOperationType: operationType,
      isElementChange,
      isRetry,
    });
    
    if (DEBUG_PAGE) console.log("🎬 Starting build:", {
      projectName: project.name,
      operationType,
    });

    // Parse model tag to get effective agent and model BEFORE creating state
    const modelTag = appliedTags.find(t => t.key === 'model');
    let effectiveAgent = selectedAgentId;
    let effectiveClaudeModel = selectedAgentId === "claude-code" ? selectedClaudeModelId : undefined;

    if (modelTag?.value) {
      const parsed = parseModelTag(modelTag.value);
      effectiveAgent = parsed.agent;
      effectiveClaudeModel = parsed.claudeModel;
    }

    // Create FRESH generation state for this build with tag-derived values
    const freshState = createFreshGenerationState({
      projectId: project.id,
      projectName: project.name,
      operationType,
      agentId: effectiveAgent,
      claudeModelId: effectiveClaudeModel,
    });

    updateGenerationState(freshState);

    await startGenerationStream(
      projectId,
      prompt,
      operationType,
      isElementChange
    );
  };

  const startGenerationStream = async (
    projectId: string,
    prompt: string,
    operationType: BuildOperationType,
    isElementChange: boolean = false
  ) => {
    const existingBuildId = generationStateRef.current?.id;
    try {
      // Derive agent and model from tags if present, otherwise use context
      const modelTag = appliedTags.find(t => t.key === 'model');
      let effectiveAgent = selectedAgentId;
      let effectiveClaudeModel = selectedAgentId === "claude-code" ? selectedClaudeModelId : undefined;

      if (modelTag?.value) {
        const parsed = parseModelTag(modelTag.value);
        effectiveAgent = parsed.agent;
        effectiveClaudeModel = parsed.claudeModel;
      }

      // Derive runner from tags if present, otherwise use context
      const runnerTag = appliedTags.find(t => t.key === 'runner');
      const effectiveRunnerId = runnerTag?.value || selectedRunnerId;

      const res = await fetch(`/api/projects/${projectId}/build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operationType,
          prompt,
          buildId: existingBuildId,
          runnerId: effectiveRunnerId,
          agent: effectiveAgent,
          claudeModel: effectiveClaudeModel,
          codexThreadId: generationStateRef.current?.codex?.threadId, // For Codex thread resumption
          tags: appliedTags.length > 0 ? appliedTags : undefined, // Tag-based configuration
          context: isElementChange
            ? {
                elementSelector: "unknown", // Will be enhanced later
                elementInfo: {},
              }
            : undefined,
        }),
      });

      if (!res.ok) {
        throw new Error("Generation failed");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let currentMessage: Message | null = null;
      const textBlocksMap = new Map<string, { type: string; text: string }>(); // Track text blocks by ID
      let pendingDataLines: string[] = [];

      const processEventPayload = (payload: string) => {
        if (!payload || payload === "[DONE]") {
          return;
        }

        try {
          const data = JSON.parse(payload);
          const eventTimestamp = new Date().toISOString();
          if (DEBUG_PAGE) console.log(`\n🌊 [${eventTimestamp}] SSE Event: ${data.type}`, data.toolName ? `(${data.toolName})` : "");

          if (data.type === "start") {
            // Create initial assistant message (simplified structure)
            currentMessage = {
              id: crypto.randomUUID(), // ALWAYS generate UUID (ignore data.messageId - it's not UUID format!)
              projectId: projectId,
              type: "assistant",
              content: "", // Will be updated as text streams
              timestamp: Date.now(),
            };

            // MIGRATION: Insert initial assistant message into collection
            if (messageCollection) {
              messageCollection.insert(currentMessage);
            }
          } else if (data.type === "text-start") {
            // Track text blocks for accumulation
            textBlocksMap.set(data.id, { type: "text", text: "" });
          } else if (data.type === "text-delta") {
            const blockId = data.id;

            // Get or create text block
            let textBlock = textBlocksMap.get(blockId);
            if (!textBlock) {
              textBlock = { type: "text", text: "" };
              textBlocksMap.set(blockId, textBlock);
            }

            // Accumulate text
            textBlock.text += data.delta;

            // Update message content (simplified - just update content string!)
            if (currentMessage?.id) {
              // Combine all text blocks into content
              const allText = Array.from(textBlocksMap.values())
                .map(block => block.text)
                .join('');

              const updatedMessage: Message = {
                ...currentMessage,
                content: allText, // Simple string update!
              };

              currentMessage = updatedMessage;

              // MIGRATION: Use TanStack DB - O(1) update!
              if (messageCollection) {
                upsertMessage(updatedMessage);
              }

              // Legacy (keeping during migration, will remove)
              setMessages((prev) =>
                prev.some((m) => m.id === updatedMessage.id)
                  ? prev.map((m) =>
                      m.id === updatedMessage.id ? updatedMessage : m
                    )
                  : [...prev, updatedMessage as any]
              );
            }
          } else if (data.type === "text-end") {
            if (DEBUG_PAGE) console.log("✅ Text block finished:", data.id);
            // Text messages are stored in textByTodo and displayed inside BuildProgress
            // Don't add to main conversation messages array
          } else if (data.type?.startsWith("codex-")) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            updateCodexState((codex) => processCodexEvent(codex, data as any));
          } else if (data.type === "tool-input-available") {
            if (DEBUG_PAGE) console.log(
              "🧰 Tool event detected:",
              data.toolName,
              "toolCallId:",
              data.toolCallId
            );
            if (DEBUG_PAGE) console.log(
              "   Current activeTodoIndex:",
              generationStateRef.current?.activeTodoIndex
            );
            if (DEBUG_PAGE) console.log(
              "   Current todos count:",
              generationStateRef.current?.todos?.length
            );
            // Route TodoWrite to separate generation state

            // Handle CodexThreadCapture - store thread ID for resumption
            if (data.toolName === "CodexThreadCapture") {
              const inputData = data.input as { threadId?: string };
              if (inputData?.threadId) {
                updateGenerationState((prev) => {
                  if (!prev) return null;
                  return {
                    ...prev,
                    codex: {
                      ...(prev.codex || createInitialCodexSessionState()),
                      threadId: inputData.threadId,
                    },
                  };
                });
                if (DEBUG_PAGE) console.log("📝 Codex thread ID captured:", inputData.threadId);
              }
              return;
            }
            if (data.toolName === "TodoWrite") {
              const inputData = data.input as { todos?: TodoItem[] };
              const todos = inputData?.todos || [];
              const timestamp = new Date().toISOString();

              if (DEBUG_PAGE) console.log(`\n━━━ [${timestamp}] 📝 TodoWrite Event Received ━━━`);
              if (DEBUG_PAGE) console.log("   BEFORE: Current state todos:", generationStateRef.current?.todos?.map(
                (t, i) => `[${i}] ${t.status}: ${t.content.substring(0, 40)}`
              ));
              if (DEBUG_PAGE) console.log("   INCOMING: New todos:", todos.length);
              if (DEBUG_PAGE) console.log(
                "   INCOMING: Todo details:",
                todos.map((t, i) => `[${i}] ${t.status}: ${t.content.substring(0, 40)}`)
              );

              // Find the active todo index (first in_progress, or -1 if none)
              const activeIndex = todos.findIndex(
                (t) => t.status === "in_progress"
              );
              if (DEBUG_PAGE) console.log("   ACTIVE INDEX:", activeIndex >= 0 ? activeIndex : "none");
              if (DEBUG_PAGE) console.log("   ACTIVE TODO:", activeIndex >= 0 ? todos[activeIndex]?.content : "none");

              updateGenerationState((prev) => {
                const baseState = ensureGenerationState(prev);
                if (!baseState) {
                  console.error(
                    "❌ Cannot update todos - generationState is null!"
                  );
                  return prev;
                }

                const updated = {
                  ...baseState,
                  todos,
                  activeTodoIndex: activeIndex,
                };

                if (DEBUG_PAGE) console.log("   Active index set to:", activeIndex);

                // Note: No saveGenerationState() - persistent processor handles all DB writes

                if (DEBUG_PAGE) console.log("🧠 Generation state snapshot:", {
                  todoCount: updated.todos.length,
                  activeTodoIndex: updated.activeTodoIndex,
                  todoStatuses: updated.todos.map((t) => t.status),
                });

                return updated;
              });
            } else {
              // Route other tools to generation state (nested under active todo)
              const timestamp = new Date().toISOString();
              const activeTodoIndex = generationStateRef.current?.activeTodoIndex ?? -1;
              if (DEBUG_PAGE) console.log(`\n━━━ [${timestamp}] 🔧 Tool Call Event ━━━`);
              if (DEBUG_PAGE) console.log(`   TOOL: ${data.toolName} (${data.toolCallId})`);
              if (DEBUG_PAGE) console.log(`   ACTIVE TODO INDEX: ${activeTodoIndex}`);
              if (activeTodoIndex >= 0 && generationStateRef.current?.todos?.[activeTodoIndex]) {
                if (DEBUG_PAGE) console.log(`   ACTIVE TODO: ${generationStateRef.current.todos[activeTodoIndex].content.substring(0, 50)}`);
              } else {
                if (DEBUG_PAGE) console.log(`   ACTIVE TODO: none (will associate with index 0 or wait for TodoWrite)`);
              }

              updateGenerationState((prev) => {
                const baseState = ensureGenerationState(prev);
                if (!baseState) return prev;

                // CRITICAL: Don't nest if we don't have todos yet!
                if (!baseState.todos || baseState.todos.length === 0) {
                  if (DEBUG_PAGE) console.log(
                    "   ⚠️  No todos yet, skipping tool nesting (will re-associate from DB later)"
                  );
                  return prev;
                }

                const tool: ToolCall = {
                  id: data.toolCallId,
                  name: data.toolName,
                  input: data.input,
                  state: "input-available",
                  startTime: new Date(),
                };

                const activeIndex =
                  baseState.activeTodoIndex >= 0
                    ? baseState.activeTodoIndex
                    : 0;
                const existing = baseState.toolsByTodo[activeIndex] || [];

                if (DEBUG_PAGE) console.log(
                  "   ✅ Nesting under todo",
                  activeIndex,
                  "Current tools for this todo:",
                  existing.length
                );

                const updated = {
                  ...baseState,
                  toolsByTodo: {
                    ...baseState.toolsByTodo,
                    [activeIndex]: [...existing, tool],
                  },
                };

                if (DEBUG_PAGE) console.log(
                  "   📊 Updated toolsByTodo:",
                  Object.keys(updated.toolsByTodo)
                    .map(
                      (idx) =>
                        `todo${idx}: ${
                          updated.toolsByTodo[Number(idx)].length
                        } tools`
                    )
                    .join(", ")
                );

                // Note: No saveGenerationState() - persistent processor handles all DB writes

                return updated;
              });
            }

            // SKIP: Don't add tools to messages - they belong ONLY in BuildProgress!
            // Tools are tracked via toolsByTodo and rendered in BuildProgress component
            // No need to update messages for tools
          } else if (data.type === "tool-output-available") {
            // Update tool in generation state
            const timestamp = new Date().toISOString();
            if (DEBUG_PAGE) console.log(`\n━━━ [${timestamp}] ✅ Tool Output Event ━━━`);
            if (DEBUG_PAGE) console.log(`   TOOL ID: ${data.toolCallId}`);

            updateGenerationState((prev) => {
              const baseState = ensureGenerationState(prev);
              if (!baseState) return prev;

              const newToolsByTodo = { ...baseState.toolsByTodo };

              // Find and update the tool
              let foundTodoIndex = -1;
              for (const todoIndexStr in newToolsByTodo) {
                const todoIndex = parseInt(todoIndexStr);
                const tools = newToolsByTodo[todoIndex];
                const toolIndex = tools.findIndex(
                  (t) => t.id === data.toolCallId
                );
                if (toolIndex >= 0) {
                  foundTodoIndex = todoIndex;
                  const updatedTools = [...tools];
                  updatedTools[toolIndex] = {
                    ...updatedTools[toolIndex],
                    output: data.output,
                    state: "output-available",
                    endTime: new Date(),
                  };
                  newToolsByTodo[todoIndex] = updatedTools;
                  if (DEBUG_PAGE) console.log(`   FOUND: Tool in todo[${todoIndex}], name: ${updatedTools[toolIndex].name}`);
                  break;
                }
              }

              if (foundTodoIndex === -1 && DEBUG_PAGE) {
                console.log(`   ⚠️  WARNING: Tool output received but tool not found in any todo!`);
              }

              const updated = {
                ...baseState,
                toolsByTodo: newToolsByTodo,
              };

              // Note: No saveGenerationState() - persistent processor handles all DB writes

              return updated;
            });

            // REMOVED: Tool output handling for messages
            // Tools are displayed in BuildProgress via toolsByTodo, not as separate messages
            // This code was trying to use old Message.parts structure which doesn't exist
            // in simplified Message (type + content only)
          } else if (
            data.type === "data-reasoning" ||
            data.type === "reasoning"
          ) {
            // Handle reasoning messages - add as text to active todo
            const message =
              (data.data as unknown as { message?: string })?.message ||
              data.message;
            if (DEBUG_PAGE) console.log("💭 Reasoning:", message);

            if (message) {
              updateGenerationState((prev) => {
                if (!prev) return null;

                const activeIndex =
                  prev.activeTodoIndex >= 0 ? prev.activeTodoIndex : 0;
                const existing = prev.textByTodo[activeIndex] || [];

                const updated = {
                  ...prev,
                  textByTodo: {
                    ...prev.textByTodo,
                    [activeIndex]: [
                      ...existing,
                      {
                        id: `reasoning-${Date.now()}`,
                        text: message,
                        timestamp: new Date(),
                      },
                    ],
                  },
                };

                return updated;
              });
            }
          } else if (
            data.type === "data-metadata-extracted" ||
            data.type === "metadata-extracted"
          ) {
            const metadata = (data.data as Record<string, unknown>)?.metadata;
            if (DEBUG_PAGE) console.log("📋 Metadata extracted:", metadata);
            // Could show this in UI if desired
          } else if (
            data.type === "data-template-selected" ||
            data.type === "template-selected"
          ) {
            const template = (data.data as Record<string, unknown>)?.template as Record<string, unknown> | undefined;
            const templateName = template?.name as string | undefined;
            const framework = template?.framework as string | undefined;
            if (DEBUG_PAGE) console.log("🎯 Template selected:", templateName);

            // Store template info for UI display
            setTemplateProvisioningInfo(prev => ({
              ...prev,
              templateName: templateName || prev?.templateName,
              framework: framework || prev?.framework,
              timestamp: new Date(),
            }));
          } else if (
            data.type === "data-template-downloaded" ||
            data.type === "template-downloaded"
          ) {
            const path = (data.data as unknown as { path?: string })?.path;
            if (DEBUG_PAGE) console.log("📦 Template downloaded to:", path);

            // Update template info with download path
            setTemplateProvisioningInfo(prev => ({
              ...prev,
              downloadPath: path,
              timestamp: new Date(),
            }));
          } else if (data.type === "project-metadata") {
            // NEW: Handle project metadata event (includes template info)
            const metadata = data.payload || data.data || data;
            if (DEBUG_PAGE) console.log("🎯 Project metadata received:", metadata);
            if (DEBUG_PAGE) console.log(`   Framework: ${metadata.projectType}`);
            if (DEBUG_PAGE) console.log(`   Run command: ${metadata.runCommand}`);
            if (DEBUG_PAGE) console.log(`   Port: ${metadata.port}`);

            // Store for UI display
            const agentName =
              selectedAgentId === "claude-code"
                ? selectedClaudeModelLabel
                : "GPT-5 Codex";

            if (metadata.projectType && metadata.projectType !== "unknown") {
              setSelectedTemplate({
                name: metadata.projectType,
                framework: metadata.projectType,
                analyzedBy: agentName,
              });
              if (DEBUG_PAGE) console.log(
                `✅ Template selected by ${agentName}: ${metadata.projectType}`
              );
            } else if (templateProvisioningInfo?.templateName) {
              // Fallback to provisioning info if metadata lacks framework
              if (DEBUG_PAGE) console.log(
                `📦 Using provisioning info for template: ${templateProvisioningInfo.templateName}`
              );
              setSelectedTemplate({
                name: templateProvisioningInfo.templateName,
                framework: templateProvisioningInfo.framework || "Unknown",
                analyzedBy: agentName,
              });
            }
          } else if (data.type === "finish") {
            currentMessage = null;
            textBlocksMap.clear(); // Clear for next message
          }
        } catch (e) {
          console.error("Failed to parse SSE payload:", payload, e);
        }
      };

      const pushChunk = (chunk: string) => {
        if (!chunk) return;

        const normalized = chunk.replace(/\r\n/g, "\n");
        const lines = normalized.split("\n");

        for (const rawLine of lines) {
          const line = rawLine.replace(/\r$/, "");
          const trimmed = line.trim();

          if (trimmed.length === 0) {
            if (pendingDataLines.length > 0) {
              const payload = pendingDataLines.join("\n");
              pendingDataLines = [];
              processEventPayload(payload);
            }
            continue;
          }

          if (trimmed.startsWith(":")) {
            continue;
          }

          const match = trimmed.match(/^data:\s?(.*)$/);
          if (match) {
            pendingDataLines.push(match[1] ?? "");
          } else {
            pendingDataLines.push(trimmed);
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();

        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          if (DEBUG_PAGE) console.log("📡 SSE chunk received:", chunk.slice(0, 200));
          if (chunk.includes("TodoWrite")) {
            if (DEBUG_PAGE) console.log("🧩 Chunk contains TodoWrite payload");
          }
          pushChunk(chunk);
        }

        if (done) {
          const finalChunk = decoder.decode();
          if (finalChunk) {
            pushChunk(finalChunk);
          }

          if (pendingDataLines.length > 0) {
            const payload = pendingDataLines.join("\n");
            pendingDataLines = [];
            processEventPayload(payload);
          }

          break;
        }
      }

      // Ensure final summary todo is marked completed before finishing
      updateGenerationState((prev) => {
        if (!prev || !prev.todos || prev.todos.length === 0) return prev;

        const lastTodoIndex = prev.todos.length - 1;
        const lastTodo = prev.todos[lastTodoIndex];
        if (!lastTodo) return prev;

        const allButLastCompleted = prev.todos
          .slice(0, -1)
          .every((todo) => todo.status === "completed");

        const needsCompletion =
          allButLastCompleted && lastTodo.status !== "completed";

        if (!needsCompletion) {
          return prev;
        }

        const updatedTodos = [...prev.todos];
        updatedTodos[lastTodoIndex] = {
          ...lastTodo,
          status: "completed",
        };

        const completedState = {
          ...prev,
          todos: updatedTodos,
          activeTodoIndex: -1,
        };

        if (DEBUG_PAGE) console.log(
          "✅ Final summary detected, marking last todo as completed"
        );
        // Note: No saveGenerationState() - persistent processor already finalized session

        return completedState;
      });

      // Mark generation as complete and SAVE
      updateGenerationState((prev) => {
        if (!prev) return null;
        const completed = {
          ...prev,
          isActive: false,
          endTime: new Date(),
        };

        // Note: No saveGenerationState() - persistent processor already finalized session

        return completed;
      });

      setCurrentProject((prev) =>
        prev
          ? {
              ...prev,
              status: "completed",
              devServerStatus:
                prev.devServerStatus && prev.devServerStatus !== "stopped"
                  ? prev.devServerStatus
                  : "stopped",
            }
          : prev
      );

      // Refresh once to get final status
      // Don't poll - sync effect handles updates, and window focus has cooldown refetch
      setTimeout(() => refetch(), 1000);
    } catch (error) {
      console.error("Generation error:", error);
      // Mark generation as failed and SAVE
      updateGenerationState((prev) => {
        if (!prev) return null;
        const failed = {
          ...prev,
          isActive: false,
          endTime: new Date(),
        };

        // Note: No saveGenerationState() - persistent processor already finalized session

        return failed;
      });
    } finally {
      setIsGenerating(false);
      isGeneratingRef.current = false; // Unlock
      if (DEBUG_PAGE) console.log("🔓 Unlocked generation mode");
      // Keep generationState visible - don't hide it!
      // User can manually dismiss with X button
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userPrompt = input;
    setInput("");

    // If no project selected, create new project
    if (!currentProject) {
      setIsCreatingProject(true);
      setIsAnalyzingTemplate(true);
      setTemplateProvisioningInfo(null); // Clear previous template info

      try {
        // Derive agent/model from tags
        const modelTag = appliedTags.find(t => t.key === 'model');
        let effectiveAgent = selectedAgentId;
        let effectiveClaudeModel = selectedAgentId === "claude-code" ? selectedClaudeModelId : undefined;

        if (modelTag?.value) {
          const parsed = parseModelTag(modelTag.value);
          effectiveAgent = parsed.agent;
          effectiveClaudeModel = parsed.claudeModel;
        }

        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: userPrompt,
            agent: effectiveAgent,
            runnerId: selectedRunnerId,
            claudeModel: effectiveClaudeModel,
            tags: serializeTags(appliedTags), // Persist tags to DB
          }),
        });

        if (!res.ok) throw new Error("Failed to create project");

        const data = await res.json();
        const project = data.project;

        if (DEBUG_PAGE) console.log("✅ Project created:", project.slug);

        // Template analysis happens automatically in the build API route
        // We'll see the results in the build metadata event
        setIsAnalyzingTemplate(false);

        // LOCK generation mode FIRST (before anything else!)
        isGeneratingRef.current = true;
        if (DEBUG_PAGE) console.log("🔒 Locked generation mode with ref");

        // Create FRESH generationState BEFORE URL changes
        if (DEBUG_PAGE) console.log(
          "🎬 Creating generation state for initial build:",
          project.name
        );
        console.log("🔍 [page.tsx] Creating fresh state with agent:", {
          effectiveAgent,
          effectiveClaudeModel,
          selectedAgentId,
          selectedClaudeModelId,
          tags: appliedTags,
        });
        const freshState = createFreshGenerationState({
          projectId: project.id,
          projectName: project.name,
          operationType: "initial-build",
          agentId: effectiveAgent,
          claudeModelId: effectiveAgent === "claude-code" ? effectiveClaudeModel : undefined,
        });

        if (DEBUG_PAGE) console.log("✅ Fresh state created:", {
          id: freshState.id,
          todosLength: freshState.todos.length,
          isActive: freshState.isActive,
          agentId: freshState.agentId,
          claudeModelId: freshState.claudeModelId,
        });

        updateGenerationState(freshState);
        if (DEBUG_PAGE) console.log("✅ GenerationState set in React");

        // Switch to Build tab
        if (DEBUG_PAGE) console.log("🎯 Switching to Build tab for new project");
        switchTab("build");

        // Set project state
        setCurrentProject(project);
        setIsCreatingProject(false);

        // Refresh project list IMMEDIATELY so sidebar updates
        await refetch();
        if (DEBUG_PAGE) console.log("🔄 Sidebar refreshed with new project");

        // Update URL WITHOUT reloading (prevents flash!)
        // This triggers useEffect, but isGeneratingRef is already locked
        router.replace(`/?project=${project.slug}`, { scroll: false });
        if (DEBUG_PAGE) console.log("🔄 URL updated");

        // Add user message (simplified structure)
        const userMessage: Message = {
          id: crypto.randomUUID(), // Use UUID to match database
          projectId: project.id,
          type: "user", // Simplified: type instead of role
          content: userPrompt, // Simplified: content instead of parts
          timestamp: Date.now(),
        };

        // MIGRATION: Use TanStack DB collection
        // Note: With TanStack DB, we keep message history (no clearing)
        // The live query filters by project, showing only relevant messages
        // This is actually better UX - full chat history preserved!
        if (messageCollection) {
          messageCollection.insert(userMessage);
        }

        // Legacy fallback: APPEND to array (don't replace!)
        setMessages(prev => [...prev, userMessage as any]);

        // Start generation stream (don't add user message again)
        if (DEBUG_PAGE) console.log("🚀 Starting generation stream...");
        await startGenerationStream(
          project.id,
          userPrompt,
          "initial-build",
          false
        );

        // Refresh project list to pick up final state
        refetch();
      } catch (error) {
        console.error("Error creating project:", error);
        setIsCreatingProject(false);
      }
    } else {
      // CRITICAL FIX: When currentProject exists, ALWAYS iterate on existing project
      // Both chat and build tabs work on the same project, just different UI
      await startGeneration(currentProject.id, userPrompt, {
        addUserMessage: true,
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  const startDevServer = async () => {
    if (!currentProject || isStartingServer) return;

    setIsStartingServer(true);
    try {
      setTerminalDetectedPort(null);
      const res = await fetch(`/api/projects/${currentProject.id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runnerId: selectedRunnerId }),
      });
      if (res.ok) {
        if (DEBUG_PAGE) console.log("✅ Dev server started successfully!");

        const data = await res.json();

        // Update currentProject directly with new status
        setCurrentProject((prev) =>
          prev
            ? {
                ...prev,
                devServerStatus: "starting",
                devServerPid: data.pid,
                devServerPort: data.port,
              }
            : null
        );

        // Mark final todo as completed when server starts!
        updateGenerationState((prev) => {
          if (!prev || !prev.todos || prev.todos.length === 0) return prev;

          const lastTodoIndex = prev.todos.length - 1;
          const lastTodo = prev.todos[lastTodoIndex];
          if (!lastTodo) return prev;

          const allButLastCompleted = prev.todos
            .slice(0, -1)
            .every((todo) => todo.status === "completed");

          if (!allButLastCompleted || lastTodo.status === "completed") {
            return prev;
          }

          const updatedTodos = [...prev.todos];
          updatedTodos[lastTodoIndex] = {
            ...lastTodo,
            status: "completed",
          };

          const completed = {
            ...prev,
            todos: updatedTodos,
          };

          if (DEBUG_PAGE) console.log(
            "🎉 Marking final todo as completed - server is running!"
          );

          // Note: No saveGenerationState() - persistent processor handles all DB writes

          return completed;
        });

        // Poll for port detection (runner sends port-detected event asynchronously)
        let pollCount = 0;
        const maxPolls = 30;

        const pollInterval = setInterval(async () => {
          pollCount++;
          await refetch();

          // Use projectsRef to avoid stale closure
          const updated = projectsRef.current.find(
            (p) => p.id === currentProject.id
          );
          if (
            updated?.devServerStatus === "running" &&
            updated?.devServerPort
          ) {
            if (DEBUG_PAGE) console.log("✅ Port detected, stopping poll");
            clearInterval(pollInterval);
          } else if (pollCount >= maxPolls) {
            if (DEBUG_PAGE) console.log("⏱️ Poll timeout reached, stopping");
            clearInterval(pollInterval);
          }
        }, 1000); // Poll every second
      }
    } catch (error) {
      console.error("Failed to start dev server:", error);
    } finally {
      // Clear loading state after a delay
      setTimeout(() => setIsStartingServer(false), 2000);
    }
  };

  const stopDevServer = async () => {
    if (!currentProject || isStoppingServer) return;

    setIsStoppingServer(true);
    try {
      const res = await fetch(`/api/projects/${currentProject.id}/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runnerId: selectedRunnerId }),
      });
      if (res.ok) {
        // Update currentProject directly
        setCurrentProject((prev) =>
          prev
            ? {
                ...prev,
                devServerStatus: "stopped",
                devServerPid: null,
                devServerPort: null,
              }
            : null
        );
        setTerminalDetectedPort(null);

        // Refresh project list so UI reflects stopped status
        refetch();
      }
    } catch (error) {
      console.error("Failed to stop dev server:", error);
    } finally {
      setTimeout(() => setIsStoppingServer(false), 1000);
    }
  };

  const startTunnel = async () => {
    if (!currentProject || isStartingTunnel) return;

    setIsStartingTunnel(true);
    try {
      const res = await fetch(
        `/api/projects/${currentProject.id}/start-tunnel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runnerId: selectedRunnerId }),
        }
      );
      if (res.ok) {
        if (DEBUG_PAGE) console.log("✅ Tunnel start requested");

        // Poll for tunnel URL to appear
        let pollCount = 0;
        const maxPolls = 15;

        const pollInterval = setInterval(async () => {
          pollCount++;
          await refetch();

          const updated = projectsRef.current.find(
            (p) => p.id === currentProject.id
          );
          if (updated?.tunnelUrl) {
            if (DEBUG_PAGE) console.log("✅ Tunnel URL detected:", updated.tunnelUrl);
            clearInterval(pollInterval);
            setIsStartingTunnel(false);
          } else if (pollCount >= maxPolls) {
            if (DEBUG_PAGE) console.log("⏱️ Tunnel poll timeout reached");
            clearInterval(pollInterval);
            setIsStartingTunnel(false);
          }
        }, 1000);
      } else {
        // API returned an error
        const error = await res.json();
        console.error("Failed to start tunnel:", error);
        setIsStartingTunnel(false);
      }
    } catch (error) {
      console.error("Failed to start tunnel:", error);
      setIsStartingTunnel(false);
    }
  };

  const stopTunnel = async () => {
    if (!currentProject || isStoppingTunnel) return;

    setIsStoppingTunnel(true);
    try {
      const res = await fetch(
        `/api/projects/${currentProject.id}/stop-tunnel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runnerId: selectedRunnerId }),
        }
      );
      if (res.ok) {
        if (DEBUG_PAGE) console.log("✅ Tunnel stop requested");
        // Update currentProject to clear tunnel URL
        setCurrentProject((prev) =>
          prev
            ? {
                ...prev,
                tunnelUrl: null,
              }
            : null
        );
        // Refresh to confirm
        await refetch();
      }
    } catch (error) {
      console.error("Failed to stop tunnel:", error);
    } finally {
      setTimeout(() => setIsStoppingTunnel(false), 1000);
    }
  };

  return (
    <CommandPaletteProvider
      onOpenProcessModal={() => setShowProcessModal(true)}
      onRenameProject={setRenamingProject}
      onDeleteProject={setDeletingProject}
    >
      {/* WebSocket Connection Status Indicator */}
      {isGenerating && (
        <WebSocketStatus
          isConnected={wsConnected}
          isReconnecting={wsReconnecting}
          error={wsError}
          onReconnect={wsReconnect}
        />
      )}
      
      <SidebarProvider defaultOpen={false}>
        <AppSidebar
          onOpenProcessModal={() => setShowProcessModal(true)}
          onRenameProject={setRenamingProject}
          onDeleteProject={setDeletingProject}
        />
        <ProcessManagerModal
          isOpen={showProcessModal}
          onClose={() => setShowProcessModal(false)}
        />
        {renamingProject && (
          <RenameProjectModal
            isOpen={!!renamingProject}
            onClose={() => setRenamingProject(null)}
            projectId={renamingProject.id}
            currentName={renamingProject.name}
            onRenameComplete={() => {
              setRenamingProject(null);
              refetch();
            }}
          />
        )}
        {deletingProject && (
          <DeleteProjectModal
            isOpen={!!deletingProject}
            onClose={() => setDeletingProject(null)}
            projectId={deletingProject.id}
            projectName={deletingProject.name}
            projectSlug={deletingProject.slug}
            onDeleteComplete={() => {
              setDeletingProject(null);
              refetch();
              // If viewing deleted project, navigate home and reset tags
              if (selectedProjectSlug === deletingProject.slug) {
                router.push('/');
                // Reset tags to default state for fresh start
                if (availableRunners.length > 0) {
                  const defaultRunnerId = availableRunners[0]?.runnerId || selectedRunnerId;
                  const defaultTags: AppliedTag[] = [
                    {
                      key: 'runner',
                      value: defaultRunnerId,
                      appliedAt: new Date()
                    },
                    {
                      key: 'model',
                      value: 'claude-haiku-4-5',
                      appliedAt: new Date()
                    }
                  ];
                  setAppliedTags(defaultTags);
                } else {
                  setAppliedTags([]);
                }
              }
            }}
          />
        )}
        <SidebarInset className="bg-gradient-to-tr from-[#1D142F] to-[#31145F]">
        {runnerOnline === false && (
          <div className="bg-amber-500/20 border border-amber-400/40 text-amber-200 px-4 py-2 text-sm">
            Local runner is offline. Start the runner CLI on your machine to
            enable builds and previews.
          </div>
        )}
        <div className="h-screen bg-gradient-to-tr from-[#1D142F] to-[#31145F] text-white flex flex-col overflow-hidden">
          {/* Landing Page */}
          <AnimatePresence mode="wait">
            {messages.length === 0 &&
              !selectedProjectSlug &&
              !isCreatingProject && (
                <motion.div
                  key="landing"
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.5 }}
                  className="flex-1 flex items-center justify-center p-4"
                >
                  <div className="w-full text-center space-y-12 overflow-x-auto">
                    {/* Title */}
                    <div className="space-y-4">
                      <h1 className="text-[3rem] sm:text-[4rem] md:text-[6rem] lg:text-[8rem] font-bold inline-block leading-tight">
                        <div>
                          Code{" "}
                          <span
                            className="inline-block hover:animate-swing origin-bottom-right"
                            style={{ color: "#FD44B0" }}
                          >
                            breaks
                          </span>
                          ,
                        </div>
                        <div>build it anyways.</div>
                      </h1>
                    </div>

                    {/* Main Input - Centered */}
                    <form
                      onSubmit={handleSubmit}
                      className="relative max-w-4xl mx-auto"
                    >
                      <div className="relative bg-gray-900 border border-white/10 rounded-lg shadow-2xl overflow-hidden hover:border-white/20 focus-within:border-white/30 transition-all duration-300">
                        <textarea
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onKeyDown={handleKeyDown}
                          placeholder="What do you want to build?"
                          rows={2}
                          className="w-full px-8 py-6 pr-20 bg-transparent text-white placeholder-gray-500 focus:outline-none text-xl font-light resize-none max-h-[200px] overflow-y-auto"
                          style={{ minHeight: "80px" }}
                          disabled={isLoading}
                        />
                        <button
                          type="submit"
                          disabled={isLoading || !input.trim()}
                          className="absolute right-4 bottom-4 p-3 text-white hover:text-gray-300 disabled:text-gray-600 disabled:cursor-not-allowed transition-all duration-200"
                        >
                          <svg
                            className="w-7 h-7"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            strokeWidth="2"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                            />
                          </svg>
                        </button>
                      </div>

                      {/* Tag Input */}
                      <div className="mt-4 px-2">
                        <TagInput
                          tags={appliedTags}
                          onTagsChange={setAppliedTags}
                          runnerOptions={availableRunners.map(r => ({
                            value: r.runnerId,
                            label: r.runnerId,
                            description: `Runner: ${r.runnerId}`
                          }))}
                          prompt={input}
                        />
                      </div>
                    </form>
                  </div>
                </motion.div>
              )}

            {/* Three-Panel Layout - Show immediately when mounted */}
            {(messages.length > 0 ||
              selectedProjectSlug ||
              isCreatingProject) &&
              isMounted && (
                <motion.div
                  key="chat-layout"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  className="flex-1 flex flex-col lg:flex-row gap-4 p-2 md:p-4 min-h-0 overflow-hidden"
                >
                  {/* Left Panel - Chat (1/3 width on desktop, full width on mobile) */}
                  <motion.div
                    initial={{ opacity: 0, x: -50 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5 }}
                    className="w-full lg:w-1/3 flex flex-col min-w-0 min-h-0 h-[50vh] lg:h-full max-h-full"
                  >
                    <div className="flex-1 flex flex-col min-h-0 max-h-full bg-black/20 backdrop-blur-md border border-white/10 rounded-xl shadow-xl overflow-hidden">
                      {/* Project Status Header */}
                      {currentProject && (
                        <div className="border-b border-white/10 p-4">
                          <div className="flex items-center gap-3 mb-2">
                            {/* Status Indicator Circle - Sentry Colors */}
                            <div className="relative group">
                              <div
                                className={`w-3 h-3 rounded-full ${
                                  currentProject.status === "pending"
                                    ? "bg-[#7553FF]" // Sentry Blurple
                                    : currentProject.status === "in_progress"
                                    ? "bg-[#FFD00E] animate-pulse shadow-lg shadow-[#FFD00E]/50" // Sentry Yellow
                                    : currentProject.status === "completed"
                                    ? "bg-[#92DD00] shadow-lg shadow-[#92DD00]/30" // Sentry Green
                                    : "bg-[#FF45A8]" // Sentry Pink
                                }`}
                              />
                              {/* Tooltip */}
                              <div className="absolute left-0 top-6 hidden group-hover:block z-50">
                                <div className="bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap border border-white/10">
                                  {currentProject.status === "pending" &&
                                    "Pending"}
                                  {currentProject.status === "in_progress" &&
                                    "Generating..."}
                                  {currentProject.status === "completed" &&
                                    "Completed"}
                                  {currentProject.status === "failed" &&
                                    "Failed"}
                                </div>
                              </div>
                            </div>

                            <div className="flex-1">
                              <h2 className="text-lg font-semibold">
                                {currentProject.name}
                              </h2>
                              {currentProject.description && (
                                <p className="text-sm text-gray-400">
                                  {currentProject.description}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Error message and retry button */}
                          {currentProject.status === "failed" && (
                            <div className="mt-3 p-3 bg-[#FF45A8]/10 border border-[#FF45A8]/30 rounded-lg">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-[#FF45A8] mb-1">
                                    Generation Failed
                                  </p>
                                  {currentProject.errorMessage && (
                                    <p className="text-xs text-[#FF70BC]/80">
                                      {currentProject.errorMessage}
                                    </p>
                                  )}
                                </div>
                                <button
                                  onClick={async () => {
                                    const promptToRetry =
                                      currentProject.originalPrompt ||
                                      currentProject.description;
                                    if (promptToRetry) {
                                      await fetch(
                                        `/api/projects/${currentProject.id}`,
                                        {
                                          method: "PATCH",
                                          headers: {
                                            "Content-Type": "application/json",
                                          },
                                          body: JSON.stringify({
                                            status: "pending",
                                            errorMessage: null,
                                          }),
                                        }
                                      );
                                      refetch();
                                      await startGeneration(
                                        currentProject.id,
                                        promptToRetry,
                                        { isRetry: true }
                                      );
                                    }
                                  }}
                                  className="px-3 py-1 text-xs bg-[#FF45A8]/20 hover:bg-[#FF45A8]/30 text-[#FF45A8] border border-[#FF45A8]/30 rounded transition-colors"
                                >
                                  Retry
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Unified View Header - Simple status bar */}
                      {(generationState || messages.length > 0) &&
                        !isCreatingProject && (
                          <div className="border-b border-white/10 px-6 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <h3 className="text-sm font-semibold text-white">
                                Conversation
                              </h3>
                              {generationState?.isActive && (
                                <span className="flex items-center gap-2 text-xs text-purple-300 bg-purple-500/20 px-3 py-1 rounded-full border border-purple-500/30">
                                  <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
                                  Build in progress ({buildProgress}%)
                                </span>
                              )}
                            </div>
                            {messages.length > 0 && (
                              <span className="text-xs text-gray-500">
                                {messages.length} messages
                              </span>
                            )}
                          </div>
                        )}

                      <div
                        ref={scrollContainerRef}
                        className="flex-1 overflow-y-auto p-6 min-h-0 space-y-4"
                      >
                        {/* Beautiful loading */}
                        {isCreatingProject && (
                          <motion.div
                            key="creating-project"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="flex items-center justify-center min-h-[400px]"
                          >
                            <div className="text-center space-y-6 max-w-md">
                              {/* Animated icon */}
                              <motion.div
                                animate={{
                                  scale: [1, 1.2, 1],
                                  rotate: [0, 180, 360],
                                }}
                                transition={{
                                  duration: 3,
                                  repeat: Infinity,
                                  ease: "easeInOut",
                                }}
                                className="mx-auto w-20 h-20 flex items-center justify-center rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 backdrop-blur-sm border border-purple-500/30"
                              >
                                <Sparkles className="w-10 h-10 text-purple-400" />
                              </motion.div>

                              {/* Loading text */}
                              <div className="space-y-2">
                                <h3 className="text-2xl font-semibold text-white">
                                  {isAnalyzingTemplate
                                    ? "Analyzing Your Request"
                                    : "Preparing Your Project"}
                                </h3>
                                <p className="text-gray-400">
                                  {isAnalyzingTemplate
                                    ? `${
                                        (() => {
                                          // Use model from tags if present, otherwise use selected model
                                          const modelTag = appliedTags.find(t => t.key === 'model');
                                          if (modelTag) {
                                            const parsed = parseModelTag(modelTag.value);
                                            return parsed.agent === 'claude-code' && parsed.claudeModel
                                              ? getClaudeModelLabel(parsed.claudeModel)
                                              : 'GPT-5 Codex';
                                          }
                                          return selectedAgentId === "claude-code"
                                            ? selectedClaudeModelLabel
                                            : "GPT-5 Codex";
                                        })()
                                      } is selecting the best template...`
                                    : "Setting up the perfect environment..."}
                                </p>

                                {/* Show template provisioning info */}
                                {templateProvisioningInfo && !isAnalyzingTemplate && (
                                  <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mt-4 p-4 rounded-lg bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/30 backdrop-blur-sm"
                                  >
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                                        <p className="text-sm text-purple-300 font-semibold">
                                          Provisioning Template
                                        </p>
                                      </div>

                                      {templateProvisioningInfo.templateName && (
                                        <div className="flex items-center justify-between text-xs">
                                          <span className="text-gray-400">Template:</span>
                                          <span className="text-white font-medium">{templateProvisioningInfo.templateName}</span>
                                        </div>
                                      )}

                                      {templateProvisioningInfo.framework && (
                                        <div className="flex items-center justify-between text-xs">
                                          <span className="text-gray-400">Framework:</span>
                                          <span className="text-purple-300 font-medium">{templateProvisioningInfo.framework}</span>
                                        </div>
                                      )}

                                      {templateProvisioningInfo.downloadPath && (
                                        <div className="flex items-start justify-between text-xs gap-2">
                                          <span className="text-gray-400 shrink-0">Path:</span>
                                          <span className="text-gray-300 font-mono text-right break-all">
                                            {templateProvisioningInfo.downloadPath.split('/').pop()}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </motion.div>
                                )}

                                {/* Fallback to show selected template if provisioning info not available */}
                                {selectedTemplate && !templateProvisioningInfo && !isAnalyzingTemplate && (
                                  <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mt-4 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20"
                                  >
                                    <p className="text-sm text-purple-300 font-medium">
                                      ✓ Template: {selectedTemplate.name}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-1">
                                      Selected by {selectedTemplate.analyzedBy}
                                    </p>
                                  </motion.div>
                                )}
                              </div>

                              {/* Animated progress dots */}
                              <div className="flex items-center gap-2 justify-center">
                                <motion.div
                                  animate={{ opacity: [0.3, 1, 0.3] }}
                                  transition={{
                                    duration: 1.5,
                                    repeat: Infinity,
                                    delay: 0,
                                  }}
                                  className="w-2 h-2 bg-purple-400 rounded-full"
                                />
                                <motion.div
                                  animate={{ opacity: [0.3, 1, 0.3] }}
                                  transition={{
                                    duration: 1.5,
                                    repeat: Infinity,
                                    delay: 0.2,
                                  }}
                                  className="w-2 h-2 bg-pink-400 rounded-full"
                                />
                                <motion.div
                                  animate={{ opacity: [0.3, 1, 0.3] }}
                                  transition={{
                                    duration: 1.5,
                                    repeat: Infinity,
                                    delay: 0.4,
                                  }}
                                  className="w-2 h-2 bg-purple-400 rounded-full"
                                />
                              </div>
                            </div>
                          </motion.div>
                        )}

                        {/* TABBED VIEW - Separate Chat and Build tabs */}
                        {!isCreatingProject && (
                          <BuildChatTabs
                            activeTab={activeTab}
                            onTabChange={setActiveTab_LEGACY}
                            chatContent={
                              <div className="space-y-4 p-4">
                                {/* Active Todo Indicator (Chat Tab Only - when build is active) */}
                                {generationState && generationState.isActive && generationState.todos && generationState.activeTodoIndex >= 0 && (
                                  <ActiveTodoIndicator
                                    todo={generationState.todos[generationState.activeTodoIndex]}
                                    currentTool={
                                      generationState.toolsByTodo[generationState.activeTodoIndex]
                                        ?.filter(t => t.state !== 'output-available')
                                        .pop()
                                    }
                                  />
                                )}

                                {/* Build Complete Card (Chat Tab Only - shows at 100% progress) */}
                                {generationState && generationState.todos && generationState.todos.length > 0 && currentProject && (
                                  (() => {
                                    const completed = generationState.todos.filter(t => t.status === 'completed').length;
                                    const total = generationState.todos.length;
                                    const progress = (completed / total) * 100;

                                    // Show when we hit 100% (finishing up) or when fully complete
                                    if (progress >= 100) {
                                      return (
                                        <BuildCompleteCard
                                          projectName={currentProject.name}
                                          onStartServer={startDevServer}
                                          onStopServer={stopDevServer}
                                          progress={progress}
                                          serverStatus={currentProject.devServerStatus}
                                          isStartingServer={isStartingServer}
                                          isStoppingServer={isStoppingServer}
                                        />
                                      );
                                    }
                                    return null;
                                  })()
                                )}

                                {/* Chat Messages - Simplified Structure */}
                                {messages.map((message) => {
                              // Skip tool calls and system messages
                              if (message.type === 'tool-call' || message.type === 'system') {
                                return null;
                              }

                              // Skip empty messages
                              if (!message.content || message.content.trim().length === 0) {
                                return null;
                              }

                              return (
                                <div
                                  key={message.id}
                                  className={`flex ${
                                    message.type === "user"
                                      ? "justify-end"
                                      : "justify-start"
                                  }`}
                                >
                                  <div
                                    className={`max-w-[85%] rounded-lg p-4 shadow-lg ${
                                      message.type === "user"
                                        ? "bg-gradient-to-r from-[#FF45A8]/15 to-[#FF70BC]/15 text-white border-l-4 border-[#FF45A8] border-r border-t border-b border-[#FF45A8]/30"
                                        : "bg-white/5 border border-white/10 text-white"
                                    }`}
                                  >
                                    <div className="prose prose-invert max-w-none text-sm">
                                      {message.content}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                              </div>
                            }
                            buildContent={
                              <div className="space-y-4 p-4">
                                {/* Project Metadata Loading Card - Shows before todos arrive */}
                                {generationState &&
                                  generationState.isActive &&
                                  (!generationState.todos || generationState.todos.length === 0) &&
                                  currentProject && (
                                  <ProjectMetadataCard
                                    projectName={currentProject.name}
                                    description={currentProject.description}
                                    icon={currentProject.icon}
                                    slug={currentProject.slug}
                                  />
                                )}

                                {/* Current Build (Active Only - completed builds show in history) */}
                                {generationState && generationState.todos && generationState.todos.length > 0 && generationState.isActive && (
                                  <BuildProgress
                                    state={generationState}
                                    templateInfo={selectedTemplate}
                                    defaultCollapsed={false}
                                    onClose={() => updateGenerationState(null)}
                                    onViewFiles={() => {
                                      window.dispatchEvent(
                                        new CustomEvent("switch-to-editor")
                                      );
                                    }}
                                    onStartServer={startDevServer}
                                  />
                                )}

                                {/* Active Element Changes */}
                            {activeElementChanges.length > 0 && (
                              <div>
                                <h3 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
                                  <span>Element Changes</span>
                                  <span className="text-xs text-gray-600">
                                    ({activeElementChanges.length})
                                  </span>
                                </h3>
                                <div className="space-y-3">
                                  {activeElementChanges.map((change) => (
                                    <ElementChangeCard
                                      key={change.id}
                                      elementSelector={change.elementSelector}
                                      changeRequest={change.changeRequest}
                                      elementInfo={change.elementInfo}
                                      status={change.status}
                                      toolCalls={change.toolCalls}
                                      error={change.error}
                                    />
                                  ))}
                                </div>
                              </div>
                            )}

                           
                            {/* Build History - Collapsed by default */}
                            {buildHistory.length > 0 && (
                              <div>
                                <h3 className="text-sm font-semibold text-gray-400 mb-3">
                                  Builds ({buildHistory.length})
                                </h3>
                                <div className="space-y-4">
                                  {buildHistory
                                    .filter((build) => build.todos && build.todos.length > 0)
                                    .map((build) => (
                                    <BuildProgress
                                      key={build.id}
                                      state={build}
                                      defaultCollapsed={true}
                                      onViewFiles={() => {
                                        window.dispatchEvent(
                                          new CustomEvent("switch-to-editor")
                                        );
                                      }}
                                      onStartServer={startDevServer}
                                    />
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Element Change History */}
                            {elementChangeHistory.length > 0 && (
                              <div>
                                <h3 className="text-sm font-semibold text-gray-400 mb-3">
                                  Element Changes ({elementChangeHistory.length}
                                  )
                                </h3>
                                <div className="space-y-3">
                                  {elementChangeHistory.map((change) => (
                                    <ElementChangeCard
                                      key={change.id}
                                      elementSelector={change.elementSelector}
                                      changeRequest={change.changeRequest}
                                      elementInfo={change.elementInfo}
                                      status={change.status}
                                      toolCalls={change.toolCalls}
                                      error={change.error}
                                    />
                                  ))}
                                </div>
                              </div>
                            )}

                                {/* Empty state */}
                                {messages.length === 0 && !generationState && (
                                  <div className="flex items-center justify-center min-h-[400px]">
                                    <div className="text-center space-y-3 text-gray-400">
                                      <Sparkles className="w-12 h-12 mx-auto opacity-50" />
                                      <p className="text-lg">
                                        Start a conversation
                                      </p>
                                      <p className="text-sm">
                                        Enter a prompt below to begin building
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            }
                          />
                        )}

                        {/* OLD DUPLICATE CHAT VIEW - DISABLED */}
                        {false && activeView === "chat" && (
                          <div className="space-y-6">
                            {messages.map((message) => {
                              // Skip element change messages (they're in Build tab now)
                              if (message.elementChange) {
                                return null;
                              }

                              // MIGRATION: Simplified Message structure (type + content)
                              // Skip tool calls and system messages
                              if (message.type === 'tool-call' || message.type === 'system') {
                                return null;
                              }

                              // Skip empty messages
                              if (!message.content || message.content.trim().length === 0) {
                                return null;
                              }

                              // Regular message rendering (simplified)
                              return (
                                <div
                                  key={message.id}
                                  className={`flex ${
                                    message.type === "user"
                                      ? "justify-end"
                                      : "justify-start"
                                  } animate-in slide-in-from-bottom-4 duration-500`}
                                >
                                  <div
                                    className={`max-w-[85%] rounded-lg p-4 shadow-lg break-words ${
                                      message.type === "user"
                                        ? "bg-gradient-to-r from-[#FF45A8]/15 to-[#FF70BC]/15 text-white border-l-4 border-[#FF45A8] border-r border-t border-b border-[#FF45A8]/30"
                                        : "bg-white/5 border border-white/10 text-white"
                                    }`}
                                  >
                                    {/* Simplified: Just render content directly */}
                                    <div className="prose prose-invert max-w-none text-sm">
                                      {message.content}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}

                            {/* REMOVED: Complex legacy message.parts.map() rendering
                                This was ~200 lines of code for old parts-based structure
                                Now using simple message.content rendering above
                                All orphaned legacy code deleted below
                            */}
                            {/* Loading indicator for project messages */}
                            {isLoadingProject && (
                              <div className="flex justify-start animate-in fade-in duration-500">
                                <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"></div>
                                    <div
                                      className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"
                                      style={{ animationDelay: "0.2s" }}
                                    ></div>
                                    <div
                                      className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"
                                      style={{ animationDelay: "0.4s" }}
                                    ></div>
                                    <span className="ml-2 text-sm text-gray-400">
                                      Loading messages...
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Loading indicator in chat view */}
                            {isGenerating &&
                              (!generationState ||
                                generationState?.todos.length === 0 ||
                                generationState?.isActive) && (
                                <div className="flex justify-start animate-in fade-in duration-500">
                                  <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
                                      <div
                                        className="w-2 h-2 bg-white rounded-full animate-bounce"
                                        style={{ animationDelay: "0.2s" }}
                                      ></div>
                                      <div
                                        className="w-2 h-2 bg-white rounded-full animate-bounce"
                                        style={{ animationDelay: "0.4s" }}
                                      ></div>
                                      <span className="ml-2 text-sm text-gray-400">
                                        Initializing...
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              )}
                          </div>
                        )}

                        <div ref={messagesEndRef} />
                      </div>

                      {/* Fixed Bottom Input */}
                      <div className="border-t border-white/10 bg-background/50 backdrop-blur-sm p-4 flex-shrink-0">
                        <form onSubmit={handleSubmit}>
                          <div className="relative bg-gray-900 border border-white/10 rounded-lg overflow-hidden hover:border-white/20 focus-within:border-white/30 transition-all duration-300">
                            <textarea
                              value={input}
                              onChange={(e) => setInput(e.target.value)}
                              onKeyDown={handleKeyDown}
                              placeholder="Continue the conversation..."
                              rows={2}
                              className="w-full px-6 py-4 pr-16 bg-transparent text-white placeholder-gray-500 focus:outline-none font-light resize-none"
                              disabled={isLoading}
                            />
                            <button
                              type="submit"
                              disabled={isLoading || !input.trim()}
                              className="absolute right-3 bottom-3 p-2 text-white hover:text-gray-300 disabled:text-gray-600 disabled:cursor-not-allowed transition-all duration-200"
                            >
                              <svg
                                className="w-6 h-6"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                strokeWidth="2"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                                />
                              </svg>
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  </motion.div>

                  {/* Right Panel - Split into Tabbed Preview (top) and Terminal (bottom) (2/3 width on desktop, full width on mobile) */}
                  <div className="w-full lg:w-2/3 flex flex-col gap-4 min-w-0 h-auto lg:h-full">
                    {/* Tabbed Preview Panel - Top */}
                    <div className="flex-1 min-h-0 h-[60vh] lg:h-auto">
                      <TabbedPreview
                        selectedProject={selectedProjectSlug}
                        projectId={currentProject?.id}
                        onStartServer={startDevServer}
                        onStopServer={stopDevServer}
                        onStartTunnel={startTunnel}
                        onStopTunnel={stopTunnel}
                        terminalPort={terminalDetectedPort}
                        isStartingServer={isStartingServer}
                        isStoppingServer={isStoppingServer}
                        isStartingTunnel={isStartingTunnel}
                        isStoppingTunnel={isStoppingTunnel}
                        isBuildActive={isCreatingProject || generationState?.isActive || false}
                      />
                    </div>

                    {/* Terminal Output - Bottom */}
                    <div className="h-48 lg:h-60">
                      <TerminalOutput
                        projectId={currentProject?.id}
                        onPortDetected={(port) => {
                          if (DEBUG_PAGE) console.log(
                            "🔍 Terminal detected port update:",
                            port
                          );
                          setTerminalDetectedPort(port);
                          // Port is detected and stored in process-manager on server-side
                          // No need to update DB from client - creates infinite loops
                        }}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
          </AnimatePresence>
        </div>
      </SidebarInset>
    </SidebarProvider>
    </CommandPaletteProvider>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center text-muted-foreground">
          Loading workspace…
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
