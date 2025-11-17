"use client";

import { Suspense, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, CheckCircle2 } from "lucide-react";
import TabbedPreview from "@/components/TabbedPreview";
import TerminalOutput from "@/components/TerminalOutput";
import { getModelLogo } from "@/lib/model-logos";
import { getFrameworkLogo } from "@/lib/framework-logos";
import ProcessManagerModal from "@/components/ProcessManagerModal";
import RenameProjectModal from "@/components/RenameProjectModal";
import DeleteProjectModal from "@/components/DeleteProjectModal";
import BuildProgress from "@/components/BuildProgress";
import { TodoList } from "@/components/BuildProgress/TodoList";
import ProjectMetadataCard from "@/components/ProjectMetadataCard";
import ImageAttachment from "@/components/ImageAttachment";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { CommandPaletteProvider } from "@/components/CommandPaletteProvider";
import { useProjects, type Project } from "@/contexts/ProjectContext";
import { useRunner } from "@/contexts/RunnerContext";
import { useAgent } from "@/contexts/AgentContext";
import { useProjectMessages, useProject } from "@/queries/projects";
import { useSaveMessage } from "@/mutations/messages";
import { useQueryClient } from "@tanstack/react-query";
import type {
  GenerationState,
  ToolCall,
  BuildOperationType,
  CodexSessionState,
  TodoItem,
  TextMessage,
} from "@/types/generation";
import { deserializeGenerationState } from "@sentryvibe/agent-core/lib/generation-persistence";
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
import { parseModelTag } from "@sentryvibe/agent-core/lib/tags/model-parser";
import { getClaudeModelLabel } from "@sentryvibe/agent-core/client";
import { deserializeTags, serializeTags } from "@sentryvibe/agent-core/lib/tags/serialization";
import { useBuildWebSocket } from "@/hooks/useBuildWebSocket";
import { WebSocketStatus } from "@/components/WebSocketStatus";
import { useProjectStatusSSE } from "@/hooks/useProjectStatusSSE";
// Simplified message structure kept
interface MessagePart {
  type: string;

  // Text content
  text?: string;

  // Image content
  image?: string;              // base64 data URL
  mimeType?: string;           // e.g., "image/png"
  fileName?: string;           // e.g., "screenshot.png"

  // Tool content
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  state?: string;
}

interface Message {
  id: string;
  projectId?: string;
  type?: 'user' | 'assistant' | 'system' | 'tool-call' | 'tool-result';
  role?: 'user' | 'assistant';
  content: string;
  parts?: MessagePart[];
  timestamp?: number;
  elementChange?: ElementChange;
}

interface ElementChange {
  id: string;
  elementSelector: string;
  changeRequest: string;
  elementInfo?: {
    tagName?: string;
    className?: string;
    textContent?: string;
  };
  status: 'processing' | 'completed' | 'failed';
  toolCalls: Array<{
    name: string;
    input?: unknown;
    output?: unknown;
    status: 'running' | 'completed' | 'failed';
  }>;
  error?: string;
}

const DEBUG_PAGE = false; // Set to true to enable verbose page logging

function extractMarkdownFromMessage(message: Message | null | undefined): string {
  if (!message) return '';
  if (typeof message.content === 'string' && message.content.trim().length > 0) {
    return message.content.trim();
  }
  if (message.parts && message.parts.length > 0) {
    const textParts = message.parts
      .filter((part) => part.type === 'text' && typeof part.text === 'string' && part.text.trim().length > 0)
      .map((part) => part.text!.trim());
    if (textParts.length > 0) {
      return textParts.join('\n\n');
    }
  }
  return '';
}

function normalizeHydratedState(state: unknown): GenerationState {
  const toDate = (value: unknown): Date | undefined => {
    if (!value) return undefined;
    if (value instanceof Date) return value;
    const date = new Date(value as string | number);
    return Number.isNaN(date.getTime()) ? undefined : date;
  };

  const stateObj = state as Record<string, unknown>;
  const normalizedTools: Record<number, ToolCall[]> = {};
  const toolsByTodo = (stateObj.toolsByTodo ?? {}) as Record<number, ToolCall[]>;
  for (const [index, tools] of Object.entries(toolsByTodo)) {
    normalizedTools[Number(index)] = (tools as ToolCall[] | undefined)?.map((tool) => ({
      ...tool,
      startTime: toDate(tool.startTime) ?? new Date(),
      endTime: toDate(tool.endTime),
    })) ?? [];
  }

  const normalizedText: Record<number, TextMessage[]> = {};
  const textByTodo = (stateObj.textByTodo ?? {}) as Record<number, TextMessage[]>;
  for (const [index, notes] of Object.entries(textByTodo)) {
    normalizedText[Number(index)] =
      (notes as TextMessage[] | undefined)?.map((note) => ({
        ...note,
        timestamp: toDate(note.timestamp) ?? new Date(),
      })) ?? [];
  }

  const result: GenerationState = {
    id: (stateObj.id as string) ?? '',
    projectId: (stateObj.projectId as string) ?? '',
    projectName: (stateObj.projectName as string) ?? '',
    operationType: (stateObj.operationType as GenerationState['operationType']) ?? 'continuation',
    agentId: stateObj.agentId as GenerationState['agentId'],
    claudeModelId: stateObj.claudeModelId as GenerationState['claudeModelId'],
    todos: Array.isArray(stateObj.todos) ? (stateObj.todos as TodoItem[]) : [],
    toolsByTodo: normalizedTools,
    textByTodo: normalizedText,
    activeTodoIndex: (stateObj.activeTodoIndex as number) ?? -1,
    isActive: Boolean(stateObj.isActive),
    startTime: toDate(stateObj.startTime) ?? new Date(),
    endTime: toDate(stateObj.endTime),
    buildSummary: stateObj.buildSummary as string | undefined,
    codex: stateObj.codex as GenerationState['codex'],
    stateVersion: stateObj.stateVersion as number | undefined,
  };
  return result;
}

function HomeContent() {
  const [input, setInput] = useState("");
  const [imageAttachments, setImageAttachments] = useState<MessagePart[]>([]);
  const queryClient = useQueryClient();

  // Message mutation hook for saving
  const saveMessageMutation = useSaveMessage();

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
  const [breaksAnimationClass, setBreaksAnimationClass] = useState<string>("");
  const [generationState, setGenerationState] =
    useState<GenerationState | null>(null);
  const [isStartingServer, setIsStartingServer] = useState(false);
  const [isStoppingServer, setIsStoppingServer] = useState(false);
  const [isStartingTunnel, setIsStartingTunnel] = useState(false);
  const [isStoppingTunnel, setIsStoppingTunnel] = useState(false);
  const generationStateRef = useRef<GenerationState | null>(generationState);
  const lastRefetchedBuildIdRef = useRef<string | null>(null);
  const [generationRevision, setGenerationRevision] = useState(0);
  const [expandedTodos, setExpandedTodos] = useState<Set<number>>(new Set());
  const [expandedCompletedBuilds, setExpandedCompletedBuilds] = useState<Set<string>>(new Set());
  const [expandedCompletedBuildTodos, setExpandedCompletedBuildTodos] = useState<Map<string, Set<number>>>(new Map());
  const isThinking =
    generationState?.isActive &&
    (!generationState.todos || generationState.todos.length === 0);
  const classifyMessage = useCallback((message: Message) => {
    const role = (message.role ?? message.type ?? '').toLowerCase();
    if (role === 'user') return 'user';
    if (role === 'assistant' || role === 'tool-result') return 'assistant';
    return 'other';
  }, []);

  const sanitizeMessageText = useCallback((raw: string) => {
    if (raw === null || raw === undefined) return '';
    if (typeof raw === 'string') return raw;
    try {
      return JSON.stringify(raw);
    } catch {
      return String(raw);
    }
  }, []);

  const isToolAssistantMessage = useCallback(
    (message: Message | null | undefined) => {
      if (!message) return false;
      if (classifyMessage(message) !== 'assistant') return false;
      return !!message.parts?.some((part) => !!part.toolName);
    },
    [classifyMessage]
  );

  const getMessageContent = useCallback((message: Message | null | undefined) => {
    if (!message) return '';
    if (message.content && message.content.trim().length > 0) {
      return sanitizeMessageText(message.content);
    }
    if (message.parts && message.parts.length > 0) {
      const textContent = message.parts
        .filter((part) => part.type === 'text' && part.text)
        .map((part) => part.text)
        .join(' ');

      if (textContent.trim().length > 0) {
        return sanitizeMessageText(textContent);
      }

      const toolSummaries = message.parts
        .filter((part) => part.toolName)
        .map((part) => {
          if (!part.toolName) return 'Tool update';
          if (part.state === 'output-available') {
            return `${part.toolName} completed`;
          }
          if (part.state === 'input-available') {
            return `${part.toolName} started`;
          }
          return `${part.toolName} updated`;
        });

      if (toolSummaries.length > 0) {
        return toolSummaries.join('\n');
      }
    }
    return '';
  }, [sanitizeMessageText]);




  // WebSocket connection for real-time updates (primary source)
  // FIX: Always enable WebSocket when project exists (eager connection)
  // This ensures we're connected BEFORE follow-up builds start
  // Previous logic was: enabled: !!currentProject && (isGenerating || hasActiveSession)
  // Problem: After build completes, hasActiveSession=false, so WS disconnects
  // Then follow-up build starts but WS isn't reconnected yet (race condition)
  const {
    state: wsState,
    isConnected: wsConnected,
    isReconnecting: wsReconnecting,
    error: wsError,
    reconnect: wsReconnect,
  } = useBuildWebSocket({
    projectId: currentProject?.id || '',
    sessionId: undefined, // Subscribe to all sessions for this project
    enabled: !!currentProject, // Always connect when project exists (eager mode)
  });

  // SSE connection for real-time project status updates
  useProjectStatusSSE(currentProject?.id, !!currentProject);

  // Subscribe to single project query for SSE updates
  const { data: projectFromQuery } = useProject(currentProject?.id);

  // Sync query data back to currentProject when SSE updates arrive
  useEffect(() => {
    if (projectFromQuery && currentProject && projectFromQuery.id === currentProject.id) {
      // Only update if data actually changed (prevent infinite loop)
      if (projectFromQuery.detectedFramework !== currentProject.detectedFramework ||
          projectFromQuery.devServerStatus !== currentProject.devServerStatus ||
          projectFromQuery.devServerPort !== currentProject.devServerPort ||
          projectFromQuery.tunnelUrl !== currentProject.tunnelUrl) {
        console.log('[page] 🔄 Syncing project from SSE query update:', {
          detectedFramework: projectFromQuery.detectedFramework,
          devServerStatus: projectFromQuery.devServerStatus,
        });
        setCurrentProject(projectFromQuery);
      }
    }
  }, [projectFromQuery, currentProject]);

  // Load messages from database when project changes
  const {
    data: messagesFromDB,
    refetch: refetchProjectMessages,
  } = useProjectMessages(currentProject?.id);

  // Derive conversation messages from TanStack Query (single source of truth)
  const conversationMessages = useMemo(() => {
    const dbMessages = messagesFromDB?.messages ?? [];
    
    if (DEBUG_PAGE && dbMessages.length > 0) {
      console.log('[conversationMessages] Processing messages from DB:', dbMessages.length);
      dbMessages.slice(0, 3).forEach((msg, idx) => {
        console.log(`  [${idx}] id=${msg.id}, role=${msg.role}, contentType=${typeof msg.content}`, 
          typeof msg.content === 'string' ? msg.content.substring(0, 100) : msg.content);
      });
    }
    
    return dbMessages
      .filter((msg) => !!msg && !!msg.id)
      .map((msg): Message | null => {
        // Handle content that might be an array of parts
        let contentStr = '';
        if (typeof msg.content === 'string') {
          contentStr = msg.content;
        } else if (Array.isArray(msg.content)) {
          // Extract text from parts array
          contentStr = msg.content
            .filter((p: unknown) => {
              const part = p as { type?: string; text?: string };
              return part.type === 'text' && part.text;
            })
            .map((p: unknown) => (p as { text: string }).text)
            .join(' ')
            .trim();
        } else if (msg.content && typeof msg.content === 'object') {
          // Skip error objects - they shouldn't show as messages
          const obj = msg.content as { error?: string };
          if (obj.error) {
            if (DEBUG_PAGE) console.log(`  Filtering out error message: ${msg.id}`, obj.error);
            return null; // Filter out error messages
          }
          contentStr = JSON.stringify(msg.content);
        }
        
        if (!contentStr || contentStr.trim().length === 0) {
          return null; // Filter out empty messages
        }
        
        return {
          id: msg.id,
          content: contentStr,
          parts: msg.parts as MessagePart[] | undefined,
          timestamp: typeof msg.timestamp === 'number' ? msg.timestamp : new Date(msg.timestamp as unknown as string).getTime(),
          role: msg.role as 'user' | 'assistant' | undefined,
        } as Message;
      })
      .filter((msg): msg is Message => msg !== null);
  }, [messagesFromDB]);

  const firstAssistantMessage = useMemo(() => {
    // Find first REAL assistant message (has content, not a tool call, has proper role)
    const candidate = conversationMessages.find(
      (message) => {
        const isAssistant = classifyMessage(message) === 'assistant';
        const notToolMessage = !isToolAssistantMessage(message);
        const hasContent = message.content && message.content.trim().length > 20; // Minimum meaningful content
        const noError = !message.content.includes('{"error"');
        return isAssistant && notToolMessage && hasContent && noError;
      }
    );
    
    if (DEBUG_PAGE && candidate) {
      console.log('[firstAssistantMessage] Found plan message:', candidate.content.substring(0, 100));
    }
    
    return candidate ?? null;
  }, [conversationMessages, classifyMessage, isToolAssistantMessage]);

  const buildPlanMarkdown = useMemo(() => {
    const markdown = extractMarkdownFromMessage(firstAssistantMessage);
    return markdown || null;
  }, [firstAssistantMessage]);

  // Get build plan for a specific user message index
  const getBuildPlanForUserMessage = useCallback((userMessageIndex: number): string | null => {
    const userMessages = conversationMessages.filter(msg => classifyMessage(msg) === 'user');

    if (userMessageIndex < 0 || userMessageIndex >= userMessages.length) {
      return null;
    }

    const targetUserMsg = userMessages[userMessageIndex];
    const userMsgIdxInAll = conversationMessages.findIndex(m => m.id === targetUserMsg.id);

    if (userMsgIdxInAll === -1) return null;

    // Find first assistant message after this user message
    for (let i = userMsgIdxInAll + 1; i < conversationMessages.length; i++) {
      const msg = conversationMessages[i];

      if (classifyMessage(msg) === 'assistant' && !isToolAssistantMessage(msg)) {
        const hasContent = msg.content && msg.content.trim().length > 20;
        const noError = !msg.content.includes('{"error"');

        if (hasContent && noError) {
          return extractMarkdownFromMessage(msg);
        }
      }

      // Stop if we hit another user message
      if (classifyMessage(msg) === 'user') {
        break;
      }
    }

    return null;
  }, [conversationMessages, classifyMessage, isToolAssistantMessage]);

  const initialUserMessage = useMemo(() => {
    if (conversationMessages.length === 0) {
      return null;
    }

    const first = conversationMessages[0];
    if (classifyMessage(first) === 'user') {
      return first;
    }

    const firstUser = conversationMessages.find((message) => classifyMessage(message) === 'user');
    return firstUser ?? first;
  }, [conversationMessages, classifyMessage]);

  const displayedInitialMessage = useMemo(() => {
    if (initialUserMessage) {
      return initialUserMessage;
    }

    if (currentProject?.originalPrompt) {
      const fallbackDate =
        (currentProject.createdAt instanceof Date
          ? currentProject.createdAt
          : currentProject.createdAt
        ) ??
        (currentProject.updatedAt instanceof Date
          ? currentProject.updatedAt
          : currentProject.updatedAt) ??
        new Date();

      return {
        id: 'project-original-prompt',
        projectId: currentProject.id,
        role: 'user' as const,
        type: 'user' as const,
        content: currentProject.originalPrompt,
        timestamp: new Date(fallbackDate).getTime(),
      } satisfies Message;
    }

    return null;
  }, [initialUserMessage, currentProject]);

  const sessionStates = useMemo(() => {
    const sessions = messagesFromDB?.sessions ?? [];
    return sessions
      .map((session) =>
        session.hydratedState ? normalizeHydratedState(session.hydratedState) : null
      )
      .filter((state): state is GenerationState => !!state);
  }, [messagesFromDB]);

  const serverBuilds = useMemo(() => {
    const builds = sessionStates.filter(
      (state) => state.todos && state.todos.length > 0 && !state.isActive
    );

    console.log('[serverBuilds] Loaded from database:', {
      count: builds.length,
      buildIds: builds.map(b => ({ id: b.id, source: b.source, todos: b.todos?.length })),
    });

    return builds;
  }, [sessionStates]);

  // Build history: Completed builds from server + current completed build (if not already in server data)
  // BUG FIX: Prevent same build from appearing in BOTH active section AND history
  const buildHistory = useMemo(() => {
    const builds = [...serverBuilds];
    if (
      generationState &&
      !generationState.isActive &&
      generationState.todos &&
      generationState.todos.length > 0 &&
      !builds.some((build) => build.id === generationState.id)
    ) {
      builds.unshift(generationState);
    }
    return builds;
  }, [serverBuilds, generationState]);

  const latestCompletedBuild = useMemo(() => {
    if (
      generationState &&
      !generationState.isActive &&
      generationState.todos &&
      generationState.todos.length > 0
    ) {
      return generationState;
    }
    return buildHistory.length > 0 ? buildHistory[0] : null;
  }, [generationState, buildHistory]);

  // Force refetch when build completes to ensure fresh data from database
  // This eliminates duplicate "Build complete!" messages
  useEffect(() => {
    if (!generationState || generationState.isActive) return;
    if (!generationState.id || !currentProject?.id) return;
    if (lastRefetchedBuildIdRef.current === generationState.id) return;
    
    console.log('✅ [Build Complete] Refetching messages to sync completed build:', {
      buildId: generationState.id,
      projectId: currentProject.id,
    });
    
    lastRefetchedBuildIdRef.current = generationState.id;
    
    // Invalidate queries to force fresh fetch
    queryClient.invalidateQueries({
      queryKey: ['projects', currentProject.id, 'messages'],
      refetchType: 'all',  // Force refetch even if not mounted
    });
    
    // Also trigger explicit refetch
    refetchProjectMessages?.();
    
    // CRITICAL FIX: Clear local generationState after it's been synced to database
    // This prevents the build from appearing in BOTH active section AND history
    // We'll set it to null after a brief delay to allow the refetch to complete
    const buildId = generationState.id;
    const clearTimer = setTimeout(() => {
      // Only clear if this build is now in serverBuilds (successfully synced)
      if (serverBuilds.some(build => build.id === buildId)) {
        console.log('🧹 [State Cleanup] Clearing local generationState (now in database):', buildId);
        setGenerationState(null);
      }
    }, 1000); // Wait 1s for refetch to complete
    
    return () => clearTimeout(clearTimer);
  }, [generationState, currentProject?.id, refetchProjectMessages, queryClient, serverBuilds]);

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

  const [elementChangeHistoryByProject, setElementChangeHistoryByProject] =
    useState<Map<string, ElementChange[]>>(new Map());

  const elementChangeHistory = currentProject
    ? elementChangeHistoryByProject.get(currentProject.id) || []
    : [];


  // Track if component has mounted to avoid hydration errors
  const [isMounted, setIsMounted] = useState(false);
  const isLoadingProject = false;

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
      const loadedTags = deserializeTags(currentProject.tags as never);
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
      if (DEBUG_PAGE) console.log('[page] ✓ Default tags set: runner=%s, model=claude-haiku-4-5', defaultRunnerId);
    }
  }, [currentProject, selectedProjectSlug, availableRunners, selectedRunnerId, appliedTags.length]);

  useEffect(() => {
    generationStateRef.current = generationState;
  }, [generationState]);

  // Sync WebSocket state to local state (both hydrated and live updates)
  // IMPORTANT: Merge WebSocket updates with existing state to preserve metadata
  // FOLLOW-UP BUILDS: This effect handles the transition from local fresh state to server state:
  //   1. User sends follow-up message
  //   2. startGeneration() creates fresh local state (empty todos, isActive: true)
  //   3. Server creates NEW session and starts build
  //   4. Server sends WebSocket updates with todos, tool calls, etc.
  //   5. This effect merges server updates into local state
  useEffect(() => {
    if (wsState) {
      if (DEBUG_PAGE) console.log('🔌 WebSocket state update:', {
        isConnected: wsConnected,
        hasState: !!wsState,
        buildId: wsState.id,
        agentId: wsState.agentId,
        claudeModelId: wsState.claudeModelId,
        projectName: wsState.projectName,
        todosLength: wsState.todos?.length,
        isActive: wsState.isActive,
      });
      
      setGenerationState((prevState) => {
        // If no previous state, use WebSocket state as-is
        if (!prevState) {
          if (DEBUG_PAGE) console.log('   No previous state, using WebSocket state directly');
          return wsState;
        }
        
        // CRITICAL FIX: Check if buildId changed (new build started)
        // If buildId changed, REPLACE old state instead of merging
        // This prevents old build plans from appearing in new follow-up sections
        const buildIdChanged = wsState.id !== prevState.id;
        
        if (buildIdChanged) {
          console.log('🔄 [State Transition] New build detected, replacing state:', {
            oldBuildId: prevState.id,
            newBuildId: wsState.id,
            oldOperationType: prevState.operationType,
            newOperationType: wsState.operationType,
          });
          
          // Replace with new build state (preserve metadata from WebSocket or prev)
          return {
            ...wsState,
            // Ensure metadata is populated
            agentId: wsState.agentId || prevState.agentId,
            claudeModelId: wsState.claudeModelId || prevState.claudeModelId,
            projectId: wsState.projectId || prevState.projectId,
            projectName: wsState.projectName || prevState.projectName,
          };
        }
        
        // Same build - merge updates incrementally
        // This handles todos being added, tools updating, etc. within the same build
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
        
        if (DEBUG_PAGE) console.log('   Merged state (same build):', {
          buildId: merged.id,
          agentId: merged.agentId,
          claudeModelId: merged.claudeModelId,
          todosLength: merged.todos?.length,
        });
        
        return merged;
      });
      
      // CRITICAL: Invalidate messages query so build plans/summaries show up
      // Without this, new messages won't appear until manual refresh
      if (currentProject?.id) {
        queryClient.invalidateQueries({
          queryKey: ['projects', currentProject.id, 'messages'],
          refetchType: 'active',
        });
      }
    }
  }, [wsState, wsConnected, currentProject?.id, queryClient]);

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


  // Only auto-scroll if user is near bottom or if loading (new message streaming)
  useEffect(() => {
    if (isLoading || isNearBottom()) {
      scrollToBottom();
    }
  }, [conversationMessages.length, isLoading, generationRevision, isNearBottom, scrollToBottom]);

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

      // The useLiveQuery automatically filters by currentProject.id
      // When currentProject is null, query returns empty array
      // TanStack Query handles this automatically

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
      messageParts?: MessagePart[];
    } = {}
  ) => {
    const {
      addUserMessage = false,
      isElementChange = false,
      isRetry = false,
      messageParts,
    } = options;

    // Lock FIRST
    isGeneratingRef.current = true;
    setIsGenerating(true);

    // Only add user message to UI if this is a continuation (not auto-start)
    if (addUserMessage) {
      const userMessage: Message = {
        id: crypto.randomUUID(), // Use UUID to match database
        projectId: projectId,
        type: "user",
        role: "user",
        content: prompt, // Keep as string for display
        parts: messageParts && messageParts.length > 0 ? messageParts : undefined,
        timestamp: Date.now(),
      };

      // Optimistically add to query cache for immediate display
      queryClient.setQueryData(
        ['projects', projectId, 'messages'],
        (old: unknown) => {
          const data = old as { messages: Message[]; sessions: unknown[] } | undefined;
          if (!data) return { messages: [userMessage], sessions: [] };
          return {
            ...data,
            messages: [...data.messages, userMessage],
          };
        }
      );

      // Save to database so it's included in conversation history
      try {
        await saveMessageMutation.mutateAsync({
          id: crypto.randomUUID(),
          projectId: projectId,
          type: 'user',
          content: prompt, // Always save text content as string
          parts: messageParts && messageParts.length > 0 ? messageParts : undefined, // Save parts separately if they exist
          timestamp: Date.now(),
        });
        if (DEBUG_PAGE) console.log("💾 User message saved to database");
      } catch (error) {
        console.error("Failed to save user message:", error);
        // Continue anyway - message is in local state
      }
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
      projectPath: project.path,
      hasRunCommand: !!project.runCommand,
      runCommand: project.runCommand,
      detectedOperationType: operationType,
      isElementChange,
      isRetry,
    });

    // Log helpful info about iteration context
    if (operationType === 'enhancement') {
      console.log("✅ Enhancement mode - Agent will receive existing project context:");
      console.log("   - Project location:", project.path);
      console.log("   - Project type:", project.projectType);
      console.log("   - Will modify existing code, not re-scaffold");
    } else if (operationType === 'initial-build') {
      console.warn("⚠️  Initial-build mode detected for existing project!");
      console.warn("   This may cause re-scaffolding. Project status:", project.status);
    }
    
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

    console.log('🎬 [Follow-up Debug] Creating fresh state for build:', {
      buildId: freshState.id,
      operationType,
      isActive: freshState.isActive,
      previousBuildId: generationState?.id,
      previousIsActive: generationState?.isActive,
      wsConnected: wsConnected,
      hasWsState: !!wsState,
      wsStateBuildId: wsState?.id,
      projectId: project.id,
    });

    // Set the fresh local state (optimistic, will be replaced by WebSocket updates)
    updateGenerationState(freshState);

    console.log('🎬 [Follow-up Debug] Starting generation stream with WebSocket:', {
      wsConnected,
      wsReconnecting,
      hasWsState: !!wsState,
    });

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
    isElementChange: boolean = false,
    messageParts?: MessagePart[]
  ) => {
    // Generate a NEW buildId for each build (don't reuse existing)
    const existingBuildId = undefined;
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
          messageParts,
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
      let currentMessage: Message = {
        id: '',
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };
      const textBlocksMap = new Map<string, { type: string; text: string }>(); // Track text blocks by ID
      let pendingDataLines: string[] = [];
      let streamCompleted = false;

      // Tool messages are handled entirely by the backend (persistent-event-processor)
      // They're saved to the messages table and associated with todos in the database
      // We don't create them on the frontend to avoid duplicates

      const processEventPayload = (payload: string) => {
        if (!payload) {
          return;
        }
        if (payload === "[DONE]") {
          streamCompleted = true;
          return;
        }
        if (payload.startsWith(':')) {
          // Heartbeat/comment frame — ignore
          return;
        }

        try {
          const data = JSON.parse(payload);
          const eventTimestamp = new Date().toISOString();
          if (DEBUG_PAGE) console.log(`\n🌊 [${eventTimestamp}] SSE Event: ${data.type}`, data.toolName ? `(${data.toolName})` : "");

          if (data.type === "start") {
            // Track assistant message locally for UI updates
            // Backend will save to DB (hybrid approach for reliability)
            currentMessage = {
              id: crypto.randomUUID(),
              projectId: projectId,
              type: "assistant",
              role: "assistant",
              content: "",
              timestamp: Date.now(),
            };

            // Optimistically add to query cache for immediate display
            queryClient.setQueryData(
              ['projects', projectId, 'messages'],
              (old: unknown) => {
                const data = old as { messages: Message[]; sessions: unknown[] } | undefined;
                if (!data) return old;
                return {
                  ...data,
                  messages: [...data.messages, currentMessage],
                };
              }
            );
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

              // Optimistically update message in query cache
              queryClient.setQueryData(
                ['projects', projectId, 'messages'],
                (old: unknown) => {
                  const data = old as { messages: Message[]; sessions: unknown[] } | undefined;
                  if (!data) return old;
                  const exists = data.messages.some((m) => m.id === updatedMessage.id);
                  return {
                    ...data,
                    messages: exists
                      ? data.messages.map((m) => m.id === updatedMessage.id ? updatedMessage : m)
                      : [...data.messages, updatedMessage],
                  };
                }
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

              const todoSummary =
                todos.length > 0
                  ? `TodoWrite updated ${todos.length} task${todos.length === 1 ? '' : 's'}`
                  : 'TodoWrite emitted an update';
              // Tool messages handled by backend
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

                // Skip nesting if todos haven't been created yet
                // Tools will be saved to DB and re-associated when state refreshes from backend
                if (!baseState.todos || baseState.todos.length === 0) {
                  // Silent: This is expected during project exploration phase
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

              // Tool messages handled by backend
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
              for (const todoIndexStr in newToolsByTodo) {
                const todoIndex = parseInt(todoIndexStr);
                const tools = newToolsByTodo[todoIndex];
                const toolIndex = tools.findIndex(
                  (t) => t.id === data.toolCallId
                );
                if (toolIndex >= 0) {
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

              // Note: If tool not found, it arrived before TodoWrite
              // Backend saves it and will re-associate when state refreshes from DB

              const updated = {
                ...baseState,
                toolsByTodo: newToolsByTodo,
              };

              // Note: No saveGenerationState() - persistent processor handles all DB writes

              return updated;
            });

            // Tool messages handled by backend

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
            currentMessage = {
              id: '',
              role: 'assistant',
              content: '',
              timestamp: Date.now(),
            };
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

      if (!streamCompleted) {
        console.warn('⚠️ Generation stream ended without explicit completion signal');
      }

      // Save final message if it exists (arrives after backend closes)
      if (currentMessage && currentMessage.content && currentMessage.content.trim().length > 0) {
        saveMessageMutation.mutate({
          id: currentMessage.id || crypto.randomUUID(),
          projectId: projectId,
          type: 'assistant',
          content: currentMessage.content,
          timestamp: Date.now(),
        });
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

  const handleBreaksMouseEnter = () => {
    setBreaksAnimationClass("animate-swing-up");
  };

  const handleBreaksMouseLeave = () => {
    setBreaksAnimationClass("animate-shake-fall");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Allow submission if there's either text input or image attachments
    if ((!input.trim() && imageAttachments.length === 0) || isLoading) return;

    const userPrompt = input;
    const userImages = imageAttachments;
    setInput("");
    setImageAttachments([]);

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

        // Add user message (with image support)
        const messageParts: MessagePart[] = [];

        // Add images first (Claude best practice)
        if (userImages.length > 0) {
          messageParts.push(...userImages);
        }

        // Add text content
        if (userPrompt.trim()) {
          messageParts.push({
            type: 'text',
            text: userPrompt.trim(),
          });
        }

        const userMessage: Message = {
          id: crypto.randomUUID(), // Use UUID to match database
          projectId: project.id,
          type: "user",
          role: "user",
          content: userPrompt,
          parts: messageParts.length > 0 ? messageParts : undefined,
          timestamp: Date.now(),
        };

        // Optimistically add to query cache for immediate display
        queryClient.setQueryData(
          ['projects', project.id, 'messages'],
          (old: unknown) => {
            const data = old as { messages: Message[]; sessions: unknown[] } | undefined;
            if (!data) return { messages: [userMessage], sessions: [] };
            return {
              ...data,
              messages: [...data.messages, userMessage],
            };
          }
        );

        // Start generation stream (don't add user message again)
        if (DEBUG_PAGE) console.log("🚀 Starting generation stream...");
        await startGenerationStream(
          project.id,
          userPrompt,
          "initial-build",
          false,
          messageParts.length > 0 ? messageParts : undefined
        );

        // Refresh project list to pick up final state
        refetch();
      } catch (error) {
        console.error("Error creating project:", error);
        setIsCreatingProject(false);
      }
    } else {
      // Continue conversation on existing project
      // Build message parts array
      const messageParts: MessagePart[] = [];

      // Add images first (Claude best practice)
      if (userImages.length > 0) {
        messageParts.push(...userImages);
      }

      // Add text content
      if (userPrompt.trim()) {
        messageParts.push({
          type: 'text',
          text: userPrompt.trim(),
        });
      }

      await startGeneration(currentProject.id, userPrompt, {
        addUserMessage: true,
        messageParts: messageParts.length > 0 ? messageParts : undefined,
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items;

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault(); // Prevent default paste behavior for images

        const file = item.getAsFile();
        if (!file) continue;

        // Check size limit (5MB for Claude API)
        if (file.size > 5 * 1024 * 1024) {
          console.error('Image too large. Maximum size is 5MB.');
          continue;
        }

        // Check max images (20 per Claude API)
        if (imageAttachments.length >= 20) {
          console.error('Maximum 20 images per message.');
          continue;
        }

        // Verify supported format
        if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
          console.error('Unsupported format. Use JPEG, PNG, GIF, or WebP.');
          continue;
        }

        // Convert to base64
        try {
          const reader = new FileReader();
          reader.onload = (event) => {
            const base64Data = event.target?.result as string;

            setImageAttachments(prev => [...prev, {
              type: 'image',
              image: base64Data,
              mimeType: file.type,
              fileName: file.name || `pasted-image-${Date.now()}.${file.type.split('/')[1]}`,
            }]);
          };
          reader.onerror = () => {
            console.error('Failed to process image. Please try again.');
          };
          reader.readAsDataURL(file);
        } catch (error) {
          console.error('Failed to process image:', error);
        }
      }
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
            {conversationMessages.length === 0 &&
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
                            className={`inline-block origin-bottom-right ${breaksAnimationClass}`}
                            style={{ color: "#FD44B0", transform: "rotate(-7.5deg)" }}
                            onMouseEnter={handleBreaksMouseEnter}
                            onMouseLeave={handleBreaksMouseLeave}
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
                      {/* Image attachments preview */}
                      {imageAttachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {imageAttachments.map((attachment, idx) => (
                            <ImageAttachment
                              key={idx}
                              fileName={attachment.fileName || 'image.png'}
                              imageSrc={attachment.image || ''}
                              showRemove
                              onRemove={() => {
                                setImageAttachments(prev => prev.filter((_, i) => i !== idx));
                              }}
                            />
                          ))}
                        </div>
                      )}
                      <div className="relative bg-gray-900 border border-white/10 rounded-lg shadow-2xl overflow-hidden hover:border-white/20 focus-within:border-white/30 transition-all duration-300">
                        <textarea
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onKeyDown={handleKeyDown}
                          onPaste={handlePaste}
                          placeholder="What do you want to build?"
                          rows={2}
                          className="w-full px-8 py-6 pr-20 bg-transparent text-white placeholder-gray-500 focus:outline-none text-xl font-light resize-none max-h-[200px] overflow-y-auto"
                          style={{ minHeight: "80px" }}
                          disabled={isLoading}
                        />
                        <button
                          type="submit"
                          disabled={isLoading || (!input.trim() && imageAttachments.length === 0)}
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
            {(conversationMessages.length > 0 ||
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
                              {(() => {
                                const activeAgent = generationState?.agentId || latestCompletedBuild?.agentId;
                                const activeModel = generationState?.claudeModelId || latestCompletedBuild?.claudeModelId;
                                const modelValue = activeAgent === 'openai-codex' ? 'gpt-5-codex' : activeModel;
                                const modelLogo = modelValue ? getModelLogo(modelValue) : null;
                                const frameworkLogo = currentProject.detectedFramework ? getFrameworkLogo(currentProject.detectedFramework) : null;
                                
                                if (!activeAgent && !currentProject.detectedFramework) return null;
                                
                                return (
                                  <div className="flex flex-wrap gap-2 mt-2">
                                    {activeAgent && (
                                      <div className="inline-flex items-center gap-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm font-mono">
                                        {modelLogo && (
                                          <img
                                            src={modelLogo}
                                            alt="model logo"
                                            className="w-3.5 h-3.5 object-contain"
                                          />
                                        )}
                                        <span className="text-gray-300">model:</span>
                                        <span className="text-gray-200">
                                          {activeAgent === 'openai-codex' ? 'codex' : activeModel?.replace('claude-', '')}
                                        </span>
                                      </div>
                                    )}
                                    {currentProject.detectedFramework && (
                                      <div className="inline-flex items-center gap-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm font-mono">
                                        {frameworkLogo && (
                                          <img
                                            src={frameworkLogo}
                                            alt="framework logo"
                                            className="w-3.5 h-3.5 object-contain"
                                          />
                                        )}
                                        <span className="text-gray-300">framework:</span>
                                        <span className="text-gray-200">{currentProject.detectedFramework}</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
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
                      {(generationState || conversationMessages.length > 0) &&
                        !isCreatingProject && (
                          <div className="border-b border-white/10 px-6 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <h3 className="text-sm font-semibold text-white">
                                Conversation
                              </h3>
                            </div>
                            {conversationMessages.length > 0 && (
                              <div className="text-xs text-gray-500">
                                {conversationMessages.length} messages
                              </div>
                            )}
                          </div>
                        )}

                      <div
                        ref={scrollContainerRef}
                        className="flex-1 overflow-y-auto p-6 min-h-0"
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

                        {!isCreatingProject && (
                          <div className="space-y-4 p-4">
                            {(() => {
                              const userMessages = conversationMessages.filter(
                                (msg) => classifyMessage(msg) === 'user'
                              );
                              const allUserMessages = userMessages.length > 0 
                                ? userMessages 
                                : (displayedInitialMessage ? [displayedInitialMessage] : []);
                              
                              if (allUserMessages.length === 0) return null;
                              
                              return (
                                <div className="space-y-6 px-1">
                                  {allUserMessages.map((msg, idx) => {
                                    const messageBuildPlan = getBuildPlanForUserMessage(idx);

                                    return (
                                      <div key={msg.id || idx} className="space-y-3">
                                        {idx > 0 && <div className="border-t border-white/10 my-6" />}

                                        <div className="space-y-1">
                                          <p className="text-xs uppercase tracking-[0.3em] text-gray-500">
                                            {idx === 0 ? 'Initial request' : `Follow-up ${idx}`}
                                          </p>
                                          <p className="text-sm text-gray-300 leading-relaxed">
                                            {getMessageContent(msg)}
                                          </p>
                                        </div>

                                        {/* Build Plan for this message */}
                                        {messageBuildPlan && (
                                          <div className="space-y-2">
                                            <p className="text-xs uppercase tracking-[0.3em] text-gray-500">
                                              Build plan
                                            </p>
                                            <div className="prose prose-invert max-w-none text-sm leading-relaxed [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-white [&_h1]:mb-3 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-white [&_h2]:mb-2 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-gray-200 [&_h3]:mb-2 [&_p]:text-sm [&_p]:text-gray-300 [&_p]:my-2 [&_ul]:my-3 [&_ul]:space-y-1.5 [&_ol]:my-3 [&_ol]:space-y-1.5 [&_li]:text-sm [&_li]:text-gray-300 [&_li]:leading-relaxed [&_code]:text-xs [&_code]:text-purple-300 [&_code]:bg-purple-500/10 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded">
                                              <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                rehypePlugins={[rehypeHighlight]}
                                              >
                                                {messageBuildPlan}
                                              </ReactMarkdown>
                                            </div>
                                          </div>
                                        )}

                                        {buildHistory[idx]?.buildSummary && (
                                        <div className="space-y-2">
                                          <p className="text-xs uppercase tracking-[0.3em] text-gray-500">
                                            Result
                                          </p>
                                          <div className="prose prose-invert max-w-none text-sm leading-relaxed [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-white [&_h3]:mb-3 [&_h3]:mt-4 [&_h4]:text-xs [&_h4]:font-semibold [&_h4]:uppercase [&_h4]:tracking-[0.2em] [&_h4]:text-gray-400 [&_h4]:mb-2 [&_h4]:mt-3 [&_p]:text-sm [&_p]:text-gray-300 [&_p]:my-1.5 [&_ul]:my-2 [&_ul]:space-y-1 [&_li]:text-sm [&_li]:text-gray-300 [&_li]:leading-relaxed [&_li]:pl-1 [&_strong]:text-white [&_strong]:font-medium [&_em]:text-gray-400 [&_em]:not-italic [&_em]:text-xs">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                              {buildHistory[idx].buildSummary!}
                                            </ReactMarkdown>
                                          </div>
                                        </div>
                                      )}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })()}

                            {/* Removed standalone buildPlanMarkdown - now shown per user message above */}

                            {isThinking && currentProject && (
                              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-4">
                                  <ProjectMetadataCard
                                    projectName={currentProject.name}
                                    description={currentProject.description}
                                    icon={currentProject.icon}
                                    slug={currentProject.slug}
                                  />
                                <div className="flex items-center gap-2 justify-center text-sm text-gray-400">
                                  <span>Thinking…</span>
                                  <div className="flex items-center gap-1">
                                    <motion.span
                                      animate={{ opacity: [0.3, 1, 0.3] }}
                                      transition={{ duration: 1.2, repeat: Infinity, delay: 0 }}
                                      className="h-2 w-2 rounded-full bg-purple-400"
                                    />
                                    <motion.span
                                      animate={{ opacity: [0.3, 1, 0.3] }}
                                      transition={{ duration: 1.2, repeat: Infinity, delay: 0.15 }}
                                      className="h-2 w-2 rounded-full bg-pink-400"
                                    />
                                    <motion.span
                                      animate={{ opacity: [0.3, 1, 0.3] }}
                                      transition={{ duration: 1.2, repeat: Infinity, delay: 0.3 }}
                                      className="h-2 w-2 rounded-full bg-purple-400"
                                    />
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Active Build - Show live todo list (no card) */}
                            {generationState &&
                              generationState.todos &&
                              generationState.todos.length > 0 &&
                              generationState.isActive && (
                                <div className="space-y-3 px-1">
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs uppercase tracking-[0.3em] text-gray-500">
                                      Build in progress
                                    </p>
                                    <div className="flex items-center gap-2">
                                      <div className="text-xs text-gray-400">
                                        {generationState.todos.filter(t => t.status === 'completed').length} / {generationState.todos.length}
                                      </div>
                                      <div className="text-sm font-semibold text-purple-400">
                                        {Math.round((generationState.todos.filter(t => t.status === 'completed').length / generationState.todos.length) * 100)}%
                                      </div>
                                    </div>
                                  </div>
                                  <div className="h-1 overflow-hidden rounded-full bg-white/10">
                                    <motion.div
                                      initial={{ width: 0 }}
                                      animate={{
                                        width: `${(generationState.todos.filter(t => t.status === 'completed').length / generationState.todos.length) * 100}%`,
                                      }}
                                      transition={{ duration: 0.5, ease: 'easeOut' }}
                                      className="h-full bg-gradient-to-r from-emerald-400 to-sky-400"
                                    />
                                  </div>
                                  {/* Minimalist todo list - no card wrapper */}
                                  <TodoList
                                    todos={generationState.todos}
                                    toolsByTodo={generationState.toolsByTodo}
                                    textByTodo={generationState.textByTodo}
                                    activeTodoIndex={generationState.activeTodoIndex}
                                    expandedTodos={expandedTodos}
                                    onToggleTodo={(index) => {
                                      setExpandedTodos(prev => {
                                        const next = new Set(prev);
                                        if (next.has(index)) {
                                          next.delete(index);
                                        } else {
                                          next.add(index);
                                        }
                                        return next;
                                      });
                                    }}
                                    allTodosCompleted={generationState.todos.every(t => t.status === 'completed')}
                                    onViewFiles={() => {
                                      window.dispatchEvent(
                                        new CustomEvent("switch-to-editor")
                                      );
                                    }}
                                    onStartServer={startDevServer}
                                  />
                                </div>
                              )}

                            {/* Builds Section - Minimal card view for completed builds */}
                            {buildHistory.length > 0 && (
                              <div className="px-1">
                                <h3 className="text-sm font-semibold text-gray-400 mb-3">
                                  Builds ({buildHistory.length})
                                </h3>
                                <div className="space-y-3">
                                  {buildHistory.map((build, buildIndex) => {
                                    const isExpanded = expandedCompletedBuilds.has(build.id);

                                    // Add build number for differentiation
                                    const buildLabel = buildIndex === buildHistory.length - 1
                                      ? 'Initial'
                                      : `Follow-up ${buildHistory.length - buildIndex - 1}`;

                                    // Get a meaningful title for the build
                                    let buildTitle = build.projectName || 'Build';
                                    if (build.buildSummary) {
                                      const firstSentence = build.buildSummary.split(/[.!?]\s/)[0];
                                      buildTitle = firstSentence.substring(0, 60);
                                    }
                                    return (
                                      <div
                                        key={build.id}
                                        className="border border-sky-500/30 rounded-lg bg-gradient-to-br from-sky-950/30 via-blue-950/20 to-gray-900/50 overflow-hidden shadow-lg shadow-sky-500/10"
                                      >
                                        {/* Card header - clickable to expand */}
                                        <button
                                          onClick={() => {
                                            setExpandedCompletedBuilds(prev => {
                                              const next = new Set(prev);
                                              if (next.has(build.id)) {
                                                next.delete(build.id);
                                              } else {
                                                next.add(build.id);
                                              }
                                              return next;
                                            });
                                          }}
                                          className="w-full px-4 py-3 hover:bg-sky-500/5 transition-colors text-left"
                                        >
                                          <div className="flex items-center gap-3">
                                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400/20 to-blue-400/20">
                                              <CheckCircle2 className="h-5 w-5 text-sky-400" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <p className="text-sm font-semibold text-sky-400">
                                                {buildTitle} - Complete
                                              </p>
                                              <p className="text-xs text-gray-400 mt-0.5">
                                                {buildLabel} • {build.todos?.length || 0} tasks • {build.buildSummary ? 'Summary available' : build.projectName}
                                              </p>
                                            </div>
                                            <div className="text-xs text-gray-500">
                                              {isExpanded ? '▼' : '▶'}
                                            </div>
                                          </div>
                                        </button>

                                        {/* Expanded todo list */}
                                        {isExpanded && (
                                          <div className="border-t border-gray-700/50 px-3 py-2">
                                            <TodoList
                                              todos={build.todos}
                                              toolsByTodo={build.toolsByTodo}
                                              textByTodo={build.textByTodo}
                                              activeTodoIndex={-1}
                                              expandedTodos={expandedCompletedBuildTodos.get(build.id) || new Set()}
                                              onToggleTodo={(todoIndex) => {
                                                setExpandedCompletedBuildTodos(prev => {
                                                  const newMap = new Map(prev);
                                                  const buildTodos = newMap.get(build.id) || new Set();
                                                  const next = new Set(buildTodos);
                                                  if (next.has(todoIndex)) {
                                                    next.delete(todoIndex);
                                                  } else {
                                                    next.add(todoIndex);
                                                  }
                                                  newMap.set(build.id, next);
                                                  return newMap;
                                                });
                                              }}
                                              allTodosCompleted={true}
                                              onViewFiles={() => {
                                                window.dispatchEvent(new CustomEvent("switch-to-editor"));
                                              }}
                                              onStartServer={startDevServer}
                                            />
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

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

                            {elementChangeHistory.length > 0 && (
                              <div>
                                <h3 className="text-sm font-semibold text-gray-400 mb-3">
                                  Element Changes ({elementChangeHistory.length})
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

                                {conversationMessages.length === 0 && !generationState && (
                                  <div className="flex items-center justify-center min-h-[400px]">
                                    <div className="text-center space-y-3 text-gray-400">
                                      <Sparkles className="w-12 h-12 mx-auto opacity-50" />
                                      <p className="text-lg">Start a conversation</p>
                                      <p className="text-sm">
                                        Enter a prompt below to begin building
                                      </p>
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
                          {/* Image attachments preview */}
                          {imageAttachments.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-3">
                              {imageAttachments.map((attachment, idx) => (
                                <ImageAttachment
                                  key={idx}
                                  fileName={attachment.fileName || 'image.png'}
                                  imageSrc={attachment.image || ''}
                                  showRemove
                                  onRemove={() => {
                                    setImageAttachments(prev => prev.filter((_, i) => i !== idx));
                                  }}
                                />
                              ))}
                            </div>
                          )}
                          <div className="relative bg-gray-900 border border-white/10 rounded-lg overflow-hidden hover:border-white/20 focus-within:border-white/30 transition-all duration-300">
                            <textarea
                              value={input}
                              onChange={(e) => setInput(e.target.value)}
                              onKeyDown={handleKeyDown}
                              onPaste={handlePaste}
                              placeholder="Continue the conversation..."
                              rows={2}
                              className="w-full px-6 py-4 pr-16 bg-transparent text-white placeholder-gray-500 focus:outline-none font-light resize-none"
                              disabled={isLoading}
                            />
                            <button
                              type="submit"
                              disabled={isLoading || (!input.trim() && imageAttachments.length === 0)}
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
