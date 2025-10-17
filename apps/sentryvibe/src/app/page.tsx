'use client';

import { Suspense, useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import TabbedPreview from '@/components/TabbedPreview';
import TerminalOutput from '@/components/TerminalOutput';
import ProcessManagerModal from '@/components/ProcessManagerModal';
import ToolCallCard from '@/components/ToolCallCard';
import SummaryCard from '@/components/SummaryCard';
import CodeBlock from '@/components/CodeBlock';
import BuildProgress from '@/components/BuildProgress';
import { AppSidebar } from '@/components/app-sidebar';
import AgentSelector from '@/components/AgentSelector';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { useProjects, type Project } from '@/contexts/ProjectContext';
import { useRunner } from '@/contexts/RunnerContext';
import { useAgent } from '@/contexts/AgentContext';
import type {
  GenerationState,
  ToolCall,
  BuildOperationType,
  CodexSessionState,
  TodoItem,
} from '@/types/generation';
import { saveGenerationState, deserializeGenerationState } from '@sentryvibe/agent-core/lib/generation-persistence';
import { detectOperationType, createFreshGenerationState, validateGenerationState, createInitialCodexSessionState } from '@sentryvibe/agent-core/lib/build-helpers';
import { processCodexEvent } from '@sentryvibe/agent-core/lib/agents/codex/events';
import ElementChangeCard from '@/components/ElementChangeCard';
import InitializingCard from '@/components/InitializingCard';

interface MessagePart {
  type: string;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  state?: string;
}

interface ElementChange {
  id: string;
  elementSelector: string;
  changeRequest: string;
  elementInfo?: any;
  status: 'processing' | 'completed' | 'failed';
  toolCalls: Array<{
    name: string;
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
    status: 'running' | 'completed' | 'failed';
  }>;
  error?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  parts: MessagePart[];
  generationState?: GenerationState; // For generation messages
  elementChange?: ElementChange; // For element selector changes
}

function HomeContent() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzingTemplate, setIsAnalyzingTemplate] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<{name: string; framework: string; analyzedBy: string} | null>(null);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [terminalDetectedPort, setTerminalDetectedPort] = useState<number | null>(null);
  const [generationState, setGenerationState] = useState<GenerationState | null>(null);
  const [isStartingServer, setIsStartingServer] = useState(false);
  const [isStoppingServer, setIsStoppingServer] = useState(false);
  const [isStartingTunnel, setIsStartingTunnel] = useState(false);
  const [isStoppingTunnel, setIsStoppingTunnel] = useState(false);
  const generationStateRef = useRef<GenerationState | null>(generationState);
  const [generationRevision, setGenerationRevision] = useState(0);
  const updateGenerationState = useCallback((updater: ((prev: GenerationState | null) => GenerationState | null) | GenerationState | null) => {
    setGenerationState(prev => {
      const next = typeof updater === 'function'
        ? (updater as (prev: GenerationState | null) => GenerationState | null)(prev)
        : updater;
      generationStateRef.current = next;
      setGenerationRevision(rev => rev + 1);
      return next;
    });
  }, []);

  // Element changes tracked separately for Build tab
  const [activeElementChanges, setActiveElementChanges] = useState<ElementChange[]>([]);

  // History tracking - per project to preserve when switching
  const [buildHistoryByProject, setBuildHistoryByProject] = useState<Map<string, GenerationState[]>>(new Map());
  const [elementChangeHistoryByProject, setElementChangeHistoryByProject] = useState<Map<string, ElementChange[]>>(new Map());

  // Current project's history (derived from maps)
  const buildHistory = currentProject ? (buildHistoryByProject.get(currentProject.id) || []) : [];
  const elementChangeHistory = currentProject ? (elementChangeHistoryByProject.get(currentProject.id) || []) : [];

  // Glow effect for Chat tab
  const [hasUnreadChatMessages, setHasUnreadChatMessages] = useState(false);

  // Track if component has mounted to avoid hydration errors
  const [isMounted, setIsMounted] = useState(false);
  const [isLoadingProject, setIsLoadingProject] = useState(false);

  // Don't read sessionStorage during SSR - prevents hydration mismatch
  const [activeView, setActiveView] = useState<'chat' | 'build'>('chat');
  const hasStartedGenerationRef = useRef<Set<string>>(new Set());
  const isGeneratingRef = useRef(false); // Sync flag for immediate checks
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const selectedProjectSlug = searchParams?.get('project') ?? null;
  const { projects, refetch, runnerOnline, setActiveProjectId } = useProjects();
  const { selectedRunnerId } = useRunner();
  const { selectedAgentId } = useAgent();

  // Restore view preference from sessionStorage after mount (avoids hydration error)
  useEffect(() => {
    setIsMounted(true);
    const stored = sessionStorage.getItem('preferredView') as 'chat' | 'build' | null;
    if (stored) {
      setActiveView(stored);
    }
  }, []);

  useEffect(() => {
    generationStateRef.current = generationState;
  }, [generationState]);

  const ensureGenerationState = useCallback((prevState: GenerationState | null): GenerationState | null => {
    // Capture values BEFORE any type narrowing/early returns
    const existingState = prevState || generationStateRef.current || generationState;
    const previousOperationType = existingState?.operationType;
    const previousAgentId = existingState?.agentId;

    if (prevState) return prevState;
    if (generationStateRef.current) return generationStateRef.current;
    if (generationState) return generationState;
    if (currentProject) {
      return createFreshGenerationState({
        projectId: currentProject.id,
        projectName: currentProject.name,
        operationType: previousOperationType ?? 'initial-build',
        agentId: previousAgentId ?? selectedAgentId,
      });
    }
    return null;
  }, [generationState, currentProject, selectedAgentId]);

  const updateCodexState = useCallback(
    (mutator: (state: CodexSessionState) => CodexSessionState) => {
      updateGenerationState(prev => {
        const baseState = ensureGenerationState(prev);
        if (!baseState) return prev;

        const existingCodex = baseState.codex ?? createInitialCodexSessionState();
        const workingCodex: CodexSessionState = {
          ...existingCodex,
          phases: existingCodex.phases.map(phase => ({ ...phase })),
          executionInsights: existingCodex.executionInsights
            ? existingCodex.executionInsights.map(insight => ({ ...insight }))
            : [],
        };

        const nextCodex = mutator(workingCodex);
        const updated: GenerationState = {
          ...baseState,
          agentId: baseState.agentId ?? 'openai-codex',
          codex: {
            ...nextCodex,
            phases: nextCodex.phases.map(phase => ({ ...phase })),
            executionInsights: nextCodex.executionInsights
              ? nextCodex.executionInsights.map(insight => ({ ...insight }))
              : [],
            lastUpdatedAt: new Date(),
          },
        };

        console.log('🌀 Codex state updated:', {
          phases: updated.codex?.phases.map(p => `${p.id}:${p.status}`),
        });

        saveGenerationState(updated.projectId, updated);
        return updated;
      });
    },
    [ensureGenerationState, updateGenerationState]
  );

  // Use ref to access latest projects without triggering effects
  const projectsRef = useRef(projects);
  projectsRef.current = projects;

  const isLoading = isCreatingProject || isGenerating;
  const activeAgentId = generationState?.agentId ?? selectedAgentId;
  const isCodexSession = activeAgentId === 'openai-codex';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Handle tab switching
  const switchTab = (tab: 'chat' | 'build') => {
    setActiveView(tab);
    sessionStorage.setItem('preferredView', tab);

    // Clear glow when switching to chat
    if (tab === 'chat') {
      setHasUnreadChatMessages(false);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '1') {
        e.preventDefault();
        switchTab('chat');
      } else if ((e.metaKey || e.ctrlKey) && e.key === '2') {
        e.preventDefault();
        switchTab('build');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Listen for selection change requests from SelectionMode
  useEffect(() => {
    const handleSelectionChange = (e: CustomEvent) => {
      const { element, prompt } = e.detail;
      console.log('🎯 Selection change received:', { element, prompt });

      if (!currentProject) {
        console.warn('⚠️ No current project for element change');
        return;
      }

      // Switch to Build tab to show element change
      switchTab('build');

      // Create element change
      const changeId = `element-change-${Date.now()}`;
      const newChange: ElementChange = {
        id: changeId,
        elementSelector: element?.selector || 'unknown',
        changeRequest: prompt,
        elementInfo: {
          tagName: element?.tagName,
          className: element?.className,
          textContent: element?.textContent,
        },
        status: 'processing',
        toolCalls: [],
      };

      setActiveElementChanges(prev => [...prev, newChange]);

      // Start element change stream
      startElementChange(currentProject.id, prompt, element, changeId);
    };

    window.addEventListener('selection-change-requested', handleSelectionChange as EventListener);
    return () => window.removeEventListener('selection-change-requested', handleSelectionChange as EventListener);
  }, [currentProject]);


  // Detect new chat messages for glow effect
  const previousMessageCountRef = useRef(0);
  useEffect(() => {
    // If messages increased and we're NOT on chat tab, trigger glow
    if (messages.length > previousMessageCountRef.current && activeView !== 'chat') {
      console.log('✨ New message detected, triggering glow');
      setHasUnreadChatMessages(true);
    }
    previousMessageCountRef.current = messages.length;
  }, [messages.length, activeView]);

  // Auto-switch to Build when todos first populate
  const previousTodoCountRef = useRef(0);
  const codexAutoSwitchRef = useRef(false);
  useEffect(() => {
    codexAutoSwitchRef.current = false;
  }, [generationState?.id]);
  useEffect(() => {
    const currentTodoCount = generationState?.todos?.length || 0;

    console.log('👀 Todo count tracker:', {
      current: currentTodoCount,
      previous: previousTodoCountRef.current,
      activeView,
      shouldSwitch: currentTodoCount > 0 && previousTodoCountRef.current === 0
    });

    // If we just got our first todo, switch to build tab (regardless of current tab)
    if (currentTodoCount > 0 && previousTodoCountRef.current === 0) {
      console.log('📊 First todos arrived! Switching to Build tab');
      switchTab('build');
    }

    previousTodoCountRef.current = currentTodoCount;
  }, [generationState?.todos?.length]);

  useEffect(() => {
    const isCodex = (generationState?.agentId ?? selectedAgentId) === 'openai-codex';
    if (!isCodex) {
      codexAutoSwitchRef.current = false;
      return;
    }
    if (!generationState?.codex?.lastUpdatedAt) return;
    if (codexAutoSwitchRef.current) return;
    console.log('🌀 Codex activity detected, switching to Build tab');
    switchTab('build');
    codexAutoSwitchRef.current = true;
  }, [generationState?.codex?.lastUpdatedAt, generationState?.agentId, selectedAgentId]);

  // Archive completed builds to history (per project)
  useEffect(() => {
    if (!generationState || generationState.isActive || !currentProject) {
      return;
    }

    const isCodexBuildState = (generationState.agentId ?? selectedAgentId) === 'openai-codex';
    const hasCodexData = isCodexBuildState && !!generationState.codex;
    const hasTodoHistory = Array.isArray(generationState.todos) && generationState.todos.length > 0;

    if (!hasCodexData && !hasTodoHistory) {
      return;
    }

    const projectHistory = buildHistoryByProject.get(currentProject.id) || [];
    const alreadyArchived = projectHistory.some(b => b.id === generationState.id);

    if (!alreadyArchived) {
      console.log('📚 Archiving completed build to history:', generationState.id);
      setBuildHistoryByProject(prev => {
        const newMap = new Map(prev);
        newMap.set(currentProject.id, [generationState, ...projectHistory]);
        return newMap;
      });
    }
  }, [generationState, currentProject?.id, buildHistoryByProject, selectedAgentId]);

  // Calculate badge values
  const buildProgress = generationState ?
    Math.round((generationState.todos.filter(t => t.status === 'completed').length / generationState.todos.length) * 100) || 0
    : 0;
  const chatMessageCount = messages.length;

  const isNearBottom = () => {
    if (!scrollContainerRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const threshold = 100; // pixels from bottom
    return scrollHeight - scrollTop - clientHeight < threshold;
  };

  // Only auto-scroll if user is near bottom or if loading (new message streaming)
  useEffect(() => {
    if (isLoading || isNearBottom()) {
      scrollToBottom();
    }
  }, [messages, isLoading, generationRevision]);

  const lastLoadedProjectRef = useRef<string | null>(null);
  const lastLoadTimeRef = useRef<number>(0);

  const loadMessages = async (projectId: string) => {
    console.log('📥 Loading messages for project:', projectId);
    console.log('   Generation active?', generationState?.isActive);
    console.log('   Generating ref?', isGeneratingRef.current);

    // Only block if ACTIVELY generating right now
    if (isGeneratingRef.current) {
      console.log('🛑 BLOCKED - currently generating');
      return;
    }

    // Debounce: Skip if we just loaded messages for this project recently (within 2 seconds)
    const now = Date.now();
    if (lastLoadedProjectRef.current === projectId && now - lastLoadTimeRef.current < 2000) {
      console.log('⏭️  SKIPPED - messages loaded recently');
      return;
    }

    lastLoadedProjectRef.current = projectId;
    lastLoadTimeRef.current = now;
    setIsLoadingProject(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/messages`);
      const data = await res.json();

      if (data.messages) {
        console.log(`   Found ${data.messages.length} messages in DB`);

        if (data.messages.length === 0) {
          console.log('   ℹ️  No messages in DB, keeping current messages');
          return; // Don't wipe existing messages if DB is empty
        }

        const regularMessages: Message[] = [];
        const archivedElementChanges: ElementChange[] = [];

        data.messages.forEach((msg: { id: string; role: 'user' | 'assistant'; content: MessagePart[] }) => {
          const parts = Array.isArray(msg.content) ? msg.content : [];

          // Check if this is an element change message
          const elementChangePart = parts.find(p => p.type === 'element-change');
          if (elementChangePart && (elementChangePart as any).elementChange) {
            // Add to element change history instead of messages
            archivedElementChanges.push((elementChangePart as any).elementChange);
          } else {
            // Regular message
            regularMessages.push({
              id: msg.id,
              role: msg.role,
              parts,
            });
          }
        });

        console.log('   ✅ Loaded:', regularMessages.length, 'messages,', archivedElementChanges.length, 'element changes');
        setMessages(regularMessages);

        if (archivedElementChanges.length > 0) {
          setElementChangeHistoryByProject(prev => {
            const newMap = new Map(prev);
            newMap.set(projectId, archivedElementChanges);
            return newMap;
          });
        }

        if (Array.isArray(data.sessions)) {
          const hydratedSessions: GenerationState[] = [];

          data.sessions.forEach((entry: any) => {
            const session = entry.session;
            const raw = entry.hydratedState;

            const rebuild = (): GenerationState | null => {
              if (!raw) return null;

              try {
                const toolsByTodo: Record<number, ToolCall[]> = {};
                if (raw.toolsByTodo) {
                  Object.entries(raw.toolsByTodo as Record<string, any[]>).forEach(([key, tools]) => {
                    const todoIndex = parseInt(key, 10);
                    toolsByTodo[todoIndex] = (tools || []).map(tool => ({
                      ...tool,
                      startTime: tool.startTime ? new Date(tool.startTime) : new Date(),
                      endTime: tool.endTime ? new Date(tool.endTime) : undefined,
                    }));
                  });
                }

                const textByTodo: Record<number, GenerationState['textByTodo'][number]> = {};
                if (raw.textByTodo) {
                  Object.entries(raw.textByTodo as Record<string, any[]>).forEach(([key, notes]) => {
                    const todoIndex = parseInt(key, 10);
                    textByTodo[todoIndex] = (notes || []).map(note => ({
                      ...note,
                      timestamp: note.timestamp ? new Date(note.timestamp) : new Date(),
                    }));
                  });
                }

                const todos: TodoItem[] = Array.isArray(raw.todos)
                  ? raw.todos.map((todo: any) => ({
                    content: todo.content,
                    status: todo.status,
                    activeForm: todo.activeForm ?? todo.content,
                  }))
                  : [];

                return {
                  id: raw.id ?? session?.buildId ?? `build-${session?.id ?? Date.now()}`,
                  projectId: raw.projectId ?? session?.projectId ?? projectId,
                  projectName: raw.projectName ?? session?.projectName ?? currentProject?.name ?? 'Untitled Project',
                  operationType: raw.operationType ?? session?.operationType ?? 'continuation',
                  todos,
                  toolsByTodo,
                  textByTodo,
                  activeTodoIndex: typeof raw.activeTodoIndex === 'number' ? raw.activeTodoIndex : -1,
                  isActive: raw.isActive ?? session?.status === 'active',
                  startTime: raw.startTime ? new Date(raw.startTime) : (session?.startedAt ? new Date(session.startedAt) : new Date()),
                  endTime: raw.endTime ? new Date(raw.endTime) : (session?.endedAt ? new Date(session.endedAt) : undefined),
                };
              } catch (err) {
                console.warn('Failed to rebuild generation state from session', err);
                return null;
              }
            };

            const parsed = rebuild();
            if (parsed) {
              hydratedSessions.push(parsed);
            }
          });

          if (hydratedSessions.length > 0) {
            setBuildHistoryByProject(prev => {
              const newMap = new Map(prev);
              newMap.set(
                projectId,
                hydratedSessions.filter(state => !state.isActive).sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
              );
              return newMap;
            });

            if (!isGeneratingRef.current) {
              const activeSession = hydratedSessions.find(state => state.isActive);
              if (activeSession) {
                console.log('   🔄 Restoring active session from DB');
                updateGenerationState(activeSession);
              } else if (hydratedSessions.length > 0) {
                const latestCompleted = [...hydratedSessions]
                  .filter(state => !state.isActive)
                  .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())[0];
                if (latestCompleted) {
                  console.log('   📚 Restoring most recent completed session for context');
                  updateGenerationState({ ...latestCompleted, isActive: false });
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setIsLoadingProject(false);
    }
  };

  // Initialize project when slug or project data changes (handles data arriving after navigation)
  useEffect(() => {
    if (selectedProjectSlug) {
      const project = projectsRef.current.find(p => p.slug === selectedProjectSlug);
      if (project && (!currentProject || currentProject.id !== project.id)) {
        console.log('🔄 Project changed to:', project.slug);
        console.log('   Currently generating?', isGeneratingRef.current);
        console.log('   Has generationState in DB?', !!project.generationState);
        setCurrentProject(project);
        setActiveProjectId(project.id);

        // CRITICAL: Don't touch generationState if we're actively generating!
        if (isGeneratingRef.current) {
          console.log('⚠️  Generation in progress - keeping existing generationState');
          return;
        }

        // Load persisted generationState if it exists
        if (project.generationState) {
          console.log('🎨 Restoring generationState from DB...');
          const restored = deserializeGenerationState(project.generationState as string);

          if (restored && validateGenerationState(restored)) {
            console.log('   ✅ Valid state, todos:', restored.todos.length);
            updateGenerationState(restored);
          }
        }

        // Load messages
        console.log('📥 Loading messages from DB...');
        loadMessages(project.id);
      } else if (!project) {
        console.log('⚠️  No project found for slug yet:', selectedProjectSlug, 'Projects loaded:', projectsRef.current.length);
      }
    } else {
      // Leaving project
      if (isGeneratingRef.current) {
        console.log('⚠️  Generation in progress - not clearing state');
        return;
      }

      setCurrentProject(null);
      setActiveProjectId(null);
      setMessages([]);
      updateGenerationState(null);
      setActiveElementChanges([]);
      // Don't clear history - it's now per-project and preserved
      setHasUnreadChatMessages(false);
      setTerminalDetectedPort(null);
      hasStartedGenerationRef.current.clear();
    }
  }, [selectedProjectSlug, projects]);

  // Sync currentProject with latest data - immediate for important changes, debounced for rapid updates
  const lastSyncKeyRef = useRef<string>('');
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!selectedProjectSlug || !currentProject) return;

    const latestProject = projects.find(p => p.id === currentProject.id);
    if (!latestProject) return;

    // Create comparison key from critical fields
    const latestKey = `${latestProject.status}-${latestProject.devServerStatus}-${latestProject.devServerPort}`;

    // If data hasn't changed, skip
    if (lastSyncKeyRef.current === latestKey) return;

    const now = Date.now();
    const timeSinceLastSync = now - lastSyncTimeRef.current;

    // If it's been more than 500ms since last sync, update immediately (user action)
    if (timeSinceLastSync > 500) {
      console.log('🔄 Syncing currentProject immediately (user action or first update)');
      lastSyncKeyRef.current = latestKey;
      lastSyncTimeRef.current = now;
      setCurrentProject(latestProject);
    } else {
      // Rapid updates - debounce
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }

      syncTimeoutRef.current = setTimeout(() => {
        console.log('🔄 Syncing currentProject after debounce (rapid updates)');
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
  }, [projects, selectedProjectSlug, currentProject?.id]);

  // Auto-start dev server when project status changes to completed
  const prevProjectStatusRef = useRef<string | null>(null);
  useEffect(() => {
    const currentStatus = currentProject?.status;
    const prevStatus = prevProjectStatusRef.current;

    // Trigger auto-start when transitioning from in_progress to completed
    if (
      prevStatus === 'in_progress' &&
      currentStatus === 'completed' &&
      currentProject?.runCommand &&
      currentProject?.devServerStatus !== 'running'
    ) {
      console.log('🚀 Generation completed, auto-starting dev server...');
      setTimeout(() => startDevServer(), 1000);
    }

    prevProjectStatusRef.current = currentStatus || null;
  }, [currentProject?.status, currentProject?.devServerStatus, currentProject?.runCommand]);

  // Disabled: We now handle generation directly in handleSubmit without redirects
  // This prevents the flash/reload issue when creating new projects

  const startElementChange = async (
    projectId: string,
    prompt: string,
    element: any,
    changeId: string
  ) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationType: 'focused-edit',
          prompt,
          runnerId: selectedRunnerId,
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
        throw new Error('Element change failed');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader available');

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          if (line === 'data: [DONE]') {
            console.log('✅ SSE stream completed for project', projectId);
            continue;
          }

          const payload = line.slice(6);
          if (!payload.trim()) {
            continue;
          }

          try {
            const data = JSON.parse(payload);

            // Update element change with tool calls
            if (data.type === 'tool-input-available') {
              setActiveElementChanges(prev => prev.map(change => {
                if (change.id === changeId) {
                  // Check if tool already exists (prevent duplicates)
                  const existingToolIndex = change.toolCalls.findIndex(
                    t => t.name === data.toolName && t.status === 'running'
                  );

                  if (existingToolIndex >= 0) {
                    console.log('⚠️ Tool already exists, skipping duplicate:', data.toolName);
                    return change;
                  }

                  return {
                    ...change,
                    toolCalls: [
                      ...change.toolCalls,
                      {
                        name: data.toolName,
                        input: data.input,
                        status: 'running' as const,
                      },
                    ],
                  };
                }
                return change;
              }));
            } else if (data.type === 'tool-output-available') {
              setActiveElementChanges(prev => prev.map(change => {
                if (change.id === changeId) {
                  // Find the matching running tool and update it
                  const updatedTools = change.toolCalls.map(tool => {
                    if (tool.status === 'running' && !tool.output) {
                      return { ...tool, output: data.output, status: 'completed' as const };
                    }
                    return tool;
                  });

                  return {
                    ...change,
                    toolCalls: updatedTools,
                  };
                }
                return change;
              }));
            }
          } catch (e) {
            // Skip malformed JSON
          }
        }
      }

      // Mark as completed and finalize all tool calls
      let completedChange: ElementChange | null = null;

      setActiveElementChanges(prev => {
        const updated = prev.map(change => {
          if (change.id === changeId) {
            completedChange = {
              ...change,
              status: 'completed' as const,
              // Mark all tools as completed
              toolCalls: change.toolCalls.map(tool => ({
                ...tool,
                status: tool.status === 'running' ? ('completed' as const) : tool.status,
              })),
            };
            return completedChange;
          }
          return change;
        });
        return updated;
      });

      // Wait a bit to let user see the completion
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Archive to history (per project) and remove from active
      if (completedChange) {
        setElementChangeHistoryByProject(prev => {
          const newMap = new Map(prev);
          const projectHistory = newMap.get(projectId) || [];
          newMap.set(projectId, [completedChange!, ...projectHistory]);
          return newMap;
        });
        setActiveElementChanges(prev => prev.filter(c => c.id !== changeId));

        // Save to database
        console.log('💾 Saving element change to database...');
        const saveRes = await fetch(`/api/projects/${projectId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: 'assistant',
            content: [
              {
                type: 'element-change',
                elementChange: completedChange,
              },
            ],
          }),
        });

        if (saveRes.ok) {
          console.log('✅ Element change saved successfully');
        } else {
          console.error('❌ Failed to save element change:', await saveRes.text());
        }

        // Switch back to Chat after completion
        switchTab('chat');
      }

    } catch (error) {
      console.error('Element change error:', error);

      // Mark as failed
      setActiveElementChanges(prev => prev.map(change => {
        if (change.id === changeId) {
          return {
            ...change,
            status: 'failed' as const,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
        return change;
      }));

      // Archive failed change to history after a delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      setActiveElementChanges(prev => {
        const failedChange = prev.find(c => c.id === changeId);
        if (failedChange) {
          setElementChangeHistoryByProject(prevMap => {
            const newMap = new Map(prevMap);
            const projectHistory = newMap.get(projectId) || [];
            newMap.set(projectId, [failedChange, ...projectHistory]);
            return newMap;
          });

          // Save to database
          fetch(`/api/projects/${projectId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              role: 'assistant',
              content: [{
                type: 'element-change',
                elementChange: failedChange,
              }],
            }),
          });
        }
        return prev.filter(c => c.id !== changeId);
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
    const { addUserMessage = false, isElementChange = false, isRetry = false } = options;

    // Lock FIRST
    isGeneratingRef.current = true;
    setIsGenerating(true);

    // Only add user message to UI if this is a continuation (not auto-start)
    if (addUserMessage) {
      const userMessage: Message = {
        id: `msg-${Date.now()}`,
        role: 'user',
        parts: [{ type: 'text', text: prompt }],
      };
      setMessages(prev => [...prev, userMessage]);
    }

    // Find project and detect operation type
    const project = projects.find(p => p.id === projectId);
    if (!project) {
      console.error('❌ Project not found for ID:', projectId);
      setIsGenerating(false);
      isGeneratingRef.current = false;
      return;
    }

    // Detect operation type
    const operationType = detectOperationType({ project, isElementChange, isRetry });
    console.log('🎬 Starting build:', { projectName: project.name, operationType });

    // Create FRESH generation state for this build
    const freshState = createFreshGenerationState({
      projectId: project.id,
      projectName: project.name,
      operationType,
      agentId: selectedAgentId,
    });

    console.log('✅ Created fresh generationState:', freshState.id);
    updateGenerationState(freshState);

    await startGenerationStream(projectId, prompt, operationType, isElementChange);
  };

  const startGenerationStream = async (
    projectId: string,
    prompt: string,
    operationType: BuildOperationType,
    isElementChange: boolean = false
  ) => {
    const existingBuildId = generationStateRef.current?.id;
    try {
      const res = await fetch(`/api/projects/${projectId}/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationType,
          prompt,
          buildId: existingBuildId,
          runnerId: selectedRunnerId,
          agent: selectedAgentId,
          context: isElementChange ? {
            elementSelector: 'unknown', // Will be enhanced later
            elementInfo: {},
          } : undefined,
        }),
      });

      if (!res.ok) {
        throw new Error('Generation failed');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader available');

      const decoder = new TextDecoder();
      let currentMessage: Message | null = null;
      const textBlocksMap = new Map<string, { type: string; text: string }>(); // Track text blocks by ID
      let pendingDataLines: string[] = [];

      const processEventPayload = (payload: string) => {
        if (!payload || payload === '[DONE]') {
          return;
        }

        try {
          const data = JSON.parse(payload);
          console.log('📨 SSE event received:', data.type, data);

          if (data.type === 'start') {
            // Don't create messages during generation - they're captured in generationState
            currentMessage = {
              id: data.messageId || `msg-${Date.now()}`,
              role: 'assistant',
              parts: [],
            };
          } else if (data.type === 'text-start') {
            textBlocksMap.set(data.id, { type: 'text', text: '' });
          } else if (data.type === 'text-delta') {
            const blockId = data.id;

            // Get or create text block
            let textBlock = textBlocksMap.get(blockId);
            if (!textBlock) {
              textBlock = { type: 'text', text: '' };
              textBlocksMap.set(blockId, textBlock);
            }

            // Accumulate text
            textBlock.text += data.delta;
            // Also add to generation state if active
            if (generationStateRef.current?.isActive) {
              updateGenerationState(prev => {
                if (!prev) return null;

                const activeIndex = prev.activeTodoIndex >= 0 ? prev.activeTodoIndex : 0;
                const existing = prev.textByTodo[activeIndex] || [];

                // Find or create text message for this block
                const existingTextIndex = existing.findIndex(t => t.id === blockId);
                const updatedTexts = [...existing];

                if (existingTextIndex >= 0) {
                  updatedTexts[existingTextIndex] = {
                    ...updatedTexts[existingTextIndex],
                    text: textBlock.text,
                  };
                } else {
                  updatedTexts.push({
                    id: blockId,
                    text: textBlock.text,
                    timestamp: new Date(),
                  });
                }

                const updated = {
                  ...prev,
                  textByTodo: {
                    ...prev.textByTodo,
                    [activeIndex]: updatedTexts,
                  },
                };

                // Debounced save to DB (text updates frequently)
                if ((window as any).saveGenStateTimeout) {
                  clearTimeout((window as any).saveGenStateTimeout);
                }
                (window as any).saveGenStateTimeout = setTimeout(() => {
                  console.log('💾 Saving text update (debounced), projectId:', updated.projectId);
                  saveGenerationState(updated.projectId, updated);
                }, 1000);

                return updated;
              });
            }

            if (currentMessage?.id) {
              const textParts = Array.from(textBlocksMap.values());
              const filteredParts = currentMessage.parts.filter(p => !p.type.startsWith('text'));
              const updatedMessage: Message = {
                ...currentMessage,
                parts: [ ...textParts, ...filteredParts ],
              };

              currentMessage = updatedMessage;

              setMessages(prev =>
                prev.some(m => m.id === updatedMessage.id)
                  ? prev.map(m => (m.id === updatedMessage.id ? updatedMessage : m))
                  : [...prev, updatedMessage]
              );
            }
          } else if (data.type === 'text-end') {
            console.log('✅ Text block finished:', data.id);
          } else if (data.type?.startsWith('codex-')) {
            updateCodexState(codex => processCodexEvent(codex, data as any));
          } else if (data.type === 'tool-input-available') {
            console.log('🧰 Tool event detected:', data.toolName, 'toolCallId:', data.toolCallId);
            console.log('   Current activeTodoIndex:', generationStateRef.current?.activeTodoIndex);
            console.log('   Current todos count:', generationStateRef.current?.todos?.length);
            // Route TodoWrite to separate generation state
            if (data.toolName === 'TodoWrite') {
              const inputData = data.input as { todos?: TodoItem[] };
              const todos = inputData?.todos || [];

              console.log('📝 TodoWrite - updating generation state');
              console.log('   Todos count:', todos.length);
              console.log('   Current generationState exists?', !!generationState);
              console.log('   Current todos in state:', generationState?.todos?.length);

              // Find the active todo index (first in_progress, or -1 if none)
              const activeIndex = todos.findIndex(t => t.status === 'in_progress');
              console.log('   Active todo index:', activeIndex);
              console.log('   Incoming todos:', todos.map(t => `${t.status}:${t.content}`).join(' | '));

              updateGenerationState(prev => {
                const baseState = ensureGenerationState(prev);
                if (!baseState) {
                  console.error('❌ Cannot update todos - generationState is null!');
                  return prev;
                }

                const updated = {
                  ...baseState,
                  todos,
                  activeTodoIndex: activeIndex,
                };

                console.log('✅ Updated generationState with', todos.length, 'todos');
                console.log('   Active index set to:', activeIndex);

                // Save to DB using projectId from state (always available!)
                console.log('💾 Saving TodoWrite update, projectId:', updated.projectId);
                saveGenerationState(updated.projectId, updated);

                console.log('🧠 Generation state snapshot:', {
                  todoCount: updated.todos.length,
                  activeTodoIndex: updated.activeTodoIndex,
                  todoStatuses: updated.todos.map(t => t.status),
                });

                return updated;
              });
            } else {
              // Route other tools to generation state (nested under active todo)
              console.log('🔧 Tool', data.toolName, '- updating generation state');

              updateGenerationState(prev => {
                const baseState = ensureGenerationState(prev);
                if (!baseState) return prev;

                const tool: ToolCall = {
                  id: data.toolCallId,
                  name: data.toolName,
                  input: data.input,
                  state: 'input-available',
                  startTime: new Date(),
                };

                const activeIndex = baseState.activeTodoIndex >= 0 ? baseState.activeTodoIndex : 0;
                const existing = baseState.toolsByTodo[activeIndex] || [];

                console.log('   ✅ Nesting under todo', activeIndex, 'Current tools for this todo:', existing.length);

                const updated = {
                  ...baseState,
                  toolsByTodo: {
                    ...baseState.toolsByTodo,
                    [activeIndex]: [...existing, tool],
                  },
                };

                console.log('   📊 Updated toolsByTodo:', Object.keys(updated.toolsByTodo).map(idx => `todo${idx}: ${updated.toolsByTodo[Number(idx)].length} tools`).join(', '));

                // Save to DB using projectId from state
                console.log('💾 Saving tool addition, projectId:', updated.projectId);
                saveGenerationState(updated.projectId, updated);

                return updated;
              });
            }

            // Also add tools to current message for DB persistence
            if (currentMessage?.id && data.toolName !== 'TodoWrite') {
              const updatedMessage: Message = {
                ...currentMessage,
                parts: [
                  ...currentMessage.parts,
                  {
                    type: `tool-${data.toolName}`,
                    toolCallId: data.toolCallId,
                    toolName: data.toolName,
                    input: data.input,
                    state: 'input-available',
                  },
                ],
              };

              currentMessage = updatedMessage;

              setMessages(prev =>
                prev.some(m => m.id === updatedMessage.id)
                  ? prev.map(m => (m.id === updatedMessage.id ? updatedMessage : m))
                  : [...prev, updatedMessage]
              );
            }
          } else if (data.type === 'tool-output-available') {
            // Update tool in generation state
            updateGenerationState(prev => {
              const baseState = ensureGenerationState(prev);
              if (!baseState) return prev;

              const newToolsByTodo = { ...baseState.toolsByTodo };

              // Find and update the tool
              for (const todoIndexStr in newToolsByTodo) {
                const todoIndex = parseInt(todoIndexStr);
                const tools = newToolsByTodo[todoIndex];
                const toolIndex = tools.findIndex(t => t.id === data.toolCallId);
                if (toolIndex >= 0) {
                  const updatedTools = [...tools];
                  updatedTools[toolIndex] = {
                    ...updatedTools[toolIndex],
                    output: data.output,
                    state: 'output-available',
                    endTime: new Date(),
                  };
                  newToolsByTodo[todoIndex] = updatedTools;
                  break;
                }
              }

              const updated = {
                ...baseState,
                toolsByTodo: newToolsByTodo,
              };

              // Save to DB (tool completion is a checkpoint)
              console.log('💾 Saving tool completion, projectId:', updated.projectId);
              saveGenerationState(updated.projectId, updated);

              return updated;
            });

            // Also update in message for DB persistence
            if (currentMessage?.id) {
              const toolPartIndex = currentMessage.parts.findIndex(p => p.toolCallId === data.toolCallId);
              if (toolPartIndex >= 0) {
                const updatedParts = [...currentMessage.parts];
                updatedParts[toolPartIndex] = {
                  ...updatedParts[toolPartIndex],
                  output: data.output,
                  state: 'output-available',
                };

                const updatedMessage: Message = {
                  ...currentMessage,
                  parts: updatedParts,
                };

                currentMessage = updatedMessage;

                setMessages(prev =>
                  prev.some(m => m.id === updatedMessage.id)
                    ? prev.map(m => (m.id === updatedMessage.id ? updatedMessage : m))
                    : [...prev, updatedMessage]
                );
              }
            }
          } else if (data.type === 'data-reasoning' || data.type === 'reasoning') {
            // Handle reasoning messages - add as text to active todo
            const message = (data.data as any)?.message || data.message;
            console.log('💭 Reasoning:', message);

            if (message) {
              updateGenerationState(prev => {
                if (!prev) return null;

                const activeIndex = prev.activeTodoIndex >= 0 ? prev.activeTodoIndex : 0;
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
          } else if (data.type === 'data-metadata-extracted' || data.type === 'metadata-extracted') {
            const metadata = (data.data as Record<string, unknown>)?.metadata;
            console.log('📋 Metadata extracted:', metadata);
            // Could show this in UI if desired
          } else if (data.type === 'data-template-selected' || data.type === 'template-selected') {
            const template = (data.data as Record<string, unknown>)?.template;
            console.log('🎯 Template selected:', template?.name);
            // Could show this in UI if desired
          } else if (data.type === 'data-template-downloaded' || data.type === 'template-downloaded') {
            const path = (data.data as any)?.path;
            console.log('📦 Template downloaded to:', path);
            // Could show this in UI if desired
          } else if (data.type === 'project-metadata') {
            // NEW: Handle project metadata event (includes template info)
            const metadata = data.payload || data.data || data;
            console.log('🎯 Project metadata received:', metadata);
            console.log(`   Framework: ${metadata.projectType}`);
            console.log(`   Run command: ${metadata.runCommand}`);
            console.log(`   Port: ${metadata.port}`);

            // Store for UI display
            if (metadata.projectType && metadata.projectType !== 'unknown') {
              const agentName = selectedAgentId === 'claude-code' ? 'Claude Sonnet 4.5' : 'GPT-5 Codex';
              setSelectedTemplate({
                name: metadata.projectType,
                framework: metadata.projectType,
                analyzedBy: agentName,
              });
              console.log(`✅ Template selected by ${agentName}: ${metadata.projectType}`);
            }
          } else if (data.type === 'finish') {
            currentMessage = null;
            textBlocksMap.clear(); // Clear for next message
          }
        } catch (e) {
          console.error('Failed to parse SSE payload:', payload, e);
        }
      };

      const pushChunk = (chunk: string) => {
        if (!chunk) return;

        const normalized = chunk.replace(/\r\n/g, '\n');
        const lines = normalized.split('\n');

        for (const rawLine of lines) {
          const line = rawLine.replace(/\r$/, '');
          const trimmed = line.trim();

          if (trimmed.length === 0) {
            if (pendingDataLines.length > 0) {
              const payload = pendingDataLines.join('\n');
              pendingDataLines = [];
              processEventPayload(payload);
            }
            continue;
          }

          if (trimmed.startsWith(':')) {
            continue;
          }

          const match = trimmed.match(/^data:\s?(.*)$/);
          if (match) {
            pendingDataLines.push(match[1] ?? '');
          } else {
            pendingDataLines.push(trimmed);
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();

        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          console.log('📡 SSE chunk received:', chunk.slice(0, 200));
          if (chunk.includes('TodoWrite')) {
            console.log('🧩 Chunk contains TodoWrite payload');
          }
          pushChunk(chunk);
        }

        if (done) {
          const finalChunk = decoder.decode();
          if (finalChunk) {
            pushChunk(finalChunk);
          }

          if (pendingDataLines.length > 0) {
            const payload = pendingDataLines.join('\n');
            pendingDataLines = [];
            processEventPayload(payload);
          }

          break;
      }
    }

    // Ensure final summary todo is marked completed before finishing
    updateGenerationState(prev => {
      if (!prev || !prev.todos || prev.todos.length === 0) return prev;

      const lastTodoIndex = prev.todos.length - 1;
      const lastTodo = prev.todos[lastTodoIndex];
      if (!lastTodo) return prev;

      const allButLastCompleted = prev.todos
        .slice(0, -1)
        .every(todo => todo.status === 'completed');

      const needsCompletion = allButLastCompleted && lastTodo.status !== 'completed';

      if (!needsCompletion) {
        return prev;
      }

      const updatedTodos = [...prev.todos];
      updatedTodos[lastTodoIndex] = {
        ...lastTodo,
        status: 'completed',
      };

      const completedState = {
        ...prev,
        todos: updatedTodos,
        activeTodoIndex: -1,
      };

      console.log('✅ Final summary detected, marking last todo as completed');
      saveGenerationState(completedState.projectId, completedState);

      return completedState;
    });

    // Mark generation as complete and SAVE
    updateGenerationState(prev => {
      if (!prev) return null;
      const completed = {
        ...prev,
        isActive: false,
          endTime: new Date(),
        };

        // CRITICAL: Save final state to DB
        console.log('💾💾💾 Saving FINAL generationState to DB, projectId:', completed.projectId);
        saveGenerationState(completed.projectId, completed);

      return completed;
    });

    setCurrentProject(prev => prev ? {
      ...prev,
      status: 'completed',
      devServerStatus: prev.devServerStatus && prev.devServerStatus !== 'stopped'
        ? prev.devServerStatus
        : 'stopped',
    } : prev);

    // Refresh once to get final status
      // Don't poll - sync effect handles updates, and window focus has cooldown refetch
      setTimeout(() => refetch(), 1000);
    } catch (error) {
      console.error('Generation error:', error);
      // Mark generation as failed and SAVE
      updateGenerationState(prev => {
        if (!prev) return null;
        const failed = {
          ...prev,
          isActive: false,
          endTime: new Date(),
        };

        // Save failed state to DB
        console.log('💾 Saving FAILED generationState to DB, projectId:', failed.projectId);
        saveGenerationState(failed.projectId, failed);

        return failed;
      });
    } finally {
      setIsGenerating(false);
      isGeneratingRef.current = false; // Unlock
      console.log('🔓 Unlocked generation mode');
      // Keep generationState visible - don't hide it!
      // User can manually dismiss with X button
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userPrompt = input;
    setInput('');

    // If no project selected, create new project
    if (!currentProject) {
      setIsCreatingProject(true);
      setIsAnalyzingTemplate(true);

      try {
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: userPrompt, agent: selectedAgentId }),
        });

        if (!res.ok) throw new Error('Failed to create project');

        const data = await res.json();
        const project = data.project;

        console.log('✅ Project created:', project.slug);

        // Template analysis happens automatically in the build API route
        // We'll see the results in the build metadata event
        setIsAnalyzingTemplate(false);

        // LOCK generation mode FIRST (before anything else!)
        isGeneratingRef.current = true;
        console.log('🔒 Locked generation mode with ref');

        // Create FRESH generationState BEFORE URL changes
        console.log('🎬 Creating generation state for initial build:', project.name);
        const freshState = createFreshGenerationState({
          projectId: project.id,
          projectName: project.name,
          operationType: 'initial-build',
          agentId: selectedAgentId,
        });

        console.log('✅ Fresh state created:', {
          id: freshState.id,
          todosLength: freshState.todos.length,
          isActive: freshState.isActive
        });

        updateGenerationState(freshState);
        console.log('✅ GenerationState set in React');

        // Switch to Build tab
        console.log('🎯 Switching to Build tab for new project');
        switchTab('build');

        // Set project state
        setCurrentProject(project);
        setIsCreatingProject(false);

        // Refresh project list IMMEDIATELY so sidebar updates
        await refetch();
        console.log('🔄 Sidebar refreshed with new project');

        // Update URL WITHOUT reloading (prevents flash!)
        // This triggers useEffect, but isGeneratingRef is already locked
        router.replace(`/?project=${project.slug}`, { scroll: false });
        console.log('🔄 URL updated');

        // Add user message
        const userMessage: Message = {
          id: `msg-${Date.now()}`,
          role: 'user',
          parts: [{ type: 'text', text: userPrompt }],
        };
        setMessages([userMessage]);

        // Start generation stream (don't add user message again)
        console.log('🚀 Starting generation stream...');
        await startGenerationStream(project.id, userPrompt, 'initial-build', false);

        // Refresh project list to pick up final state
        refetch();
      } catch (error) {
        console.error('Error creating project:', error);
        setIsCreatingProject(false);
      }
    } else {
      // Continue existing conversation - add user message to UI
      await startGeneration(currentProject.id, userPrompt, { addUserMessage: true });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runnerId: selectedRunnerId }),
      });
      if (res.ok) {
        console.log('✅ Dev server started successfully!');

        const data = await res.json();

        // Update currentProject directly with new status
        setCurrentProject(prev => prev ? {
          ...prev,
          devServerStatus: 'starting',
          devServerPid: data.pid,
          devServerPort: data.port,
        } : null);

        // Mark final todo as completed when server starts!
        updateGenerationState(prev => {
          if (!prev || !prev.todos || prev.todos.length === 0) return prev;

          const lastTodoIndex = prev.todos.length - 1;
          const lastTodo = prev.todos[lastTodoIndex];
          if (!lastTodo) return prev;

          const allButLastCompleted = prev.todos
            .slice(0, -1)
            .every(todo => todo.status === 'completed');

          if (!allButLastCompleted || lastTodo.status === 'completed') {
            return prev;
          }

          const updatedTodos = [...prev.todos];
          updatedTodos[lastTodoIndex] = {
            ...lastTodo,
            status: 'completed',
          };

          const completed = {
            ...prev,
            todos: updatedTodos,
          };

          console.log('🎉 Marking final todo as completed - server is running!');

          // Save to DB
          saveGenerationState(prev.projectId, completed);

          return completed;
        });

        // Poll for port detection (runner sends port-detected event asynchronously)
        let pollCount = 0;
        const maxPolls = 30;

        const pollInterval = setInterval(async () => {
          pollCount++;
          await refetch();

          // Use projectsRef to avoid stale closure
          const updated = projectsRef.current.find(p => p.id === currentProject.id);
          if (updated?.devServerStatus === 'running' && updated?.devServerPort) {
            console.log('✅ Port detected, stopping poll');
            clearInterval(pollInterval);
          } else if (pollCount >= maxPolls) {
            console.log('⏱️ Poll timeout reached, stopping');
            clearInterval(pollInterval);
          }
        }, 1000); // Poll every second
      }
    } catch (error) {
      console.error('Failed to start dev server:', error);
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runnerId: selectedRunnerId }),
      });
      if (res.ok) {
        // Update currentProject directly
        setCurrentProject(prev => prev ? {
          ...prev,
          devServerStatus: 'stopped',
          devServerPid: null,
          devServerPort: null,
        } : null);
        setTerminalDetectedPort(null);

        // Refresh project list so UI reflects stopped status
        refetch();
      }
    } catch (error) {
      console.error('Failed to stop dev server:', error);
    } finally {
      setTimeout(() => setIsStoppingServer(false), 1000);
    }
  };

  const startTunnel = async () => {
    if (!currentProject || isStartingTunnel) return;

    setIsStartingTunnel(true);
    try {
      const res = await fetch(`/api/projects/${currentProject.id}/start-tunnel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runnerId: selectedRunnerId }),
      });
      if (res.ok) {
        console.log('✅ Tunnel start requested');

        // Poll for tunnel URL to appear
        let pollCount = 0;
        const maxPolls = 15;

        const pollInterval = setInterval(async () => {
          pollCount++;
          await refetch();

          const updated = projectsRef.current.find(p => p.id === currentProject.id);
          if (updated?.tunnelUrl) {
            console.log('✅ Tunnel URL detected:', updated.tunnelUrl);
            clearInterval(pollInterval);
            setIsStartingTunnel(false);
          } else if (pollCount >= maxPolls) {
            console.log('⏱️ Tunnel poll timeout reached');
            clearInterval(pollInterval);
            setIsStartingTunnel(false);
          }
        }, 1000);
      }
    } catch (error) {
      console.error('Failed to start tunnel:', error);
      setIsStartingTunnel(false);
    }
  };

  const stopTunnel = async () => {
    if (!currentProject || isStoppingTunnel) return;

    setIsStoppingTunnel(true);
    try {
      const res = await fetch(`/api/projects/${currentProject.id}/stop-tunnel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runnerId: selectedRunnerId }),
      });
      if (res.ok) {
        console.log('✅ Tunnel stop requested');
        // Update currentProject to clear tunnel URL
        setCurrentProject(prev => prev ? {
          ...prev,
          tunnelUrl: null,
        } : null);
        // Refresh to confirm
        await refetch();
      }
    } catch (error) {
      console.error('Failed to stop tunnel:', error);
    } finally {
      setTimeout(() => setIsStoppingTunnel(false), 1000);
    }
  };

  return (
    <SidebarProvider defaultOpen={false}>
      <AppSidebar onOpenProcessModal={() => setShowProcessModal(true)} />
      <ProcessManagerModal isOpen={showProcessModal} onClose={() => setShowProcessModal(false)} />
      <SidebarInset className="bg-gradient-to-tr from-[#1D142F] to-[#31145F]">
        {runnerOnline === false && (
          <div className="bg-amber-500/20 border border-amber-400/40 text-amber-200 px-4 py-2 text-sm">
            Local runner is offline. Start the runner CLI on your machine to enable builds and previews.
          </div>
        )}
        <div className="h-screen bg-gradient-to-tr from-[#1D142F] to-[#31145F] text-white flex flex-col overflow-hidden">
          {/* Landing Page */}
          <AnimatePresence mode="wait">
            {messages.length === 0 && !selectedProjectSlug && !isCreatingProject && (
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
                    <h1 className="text-[6rem] md:text-[8rem] font-bold inline-block leading-tight">
                      <div>Code <span className="inline-block hover:animate-swing origin-bottom-right" style={{ color: '#FD44B0' }}>breaks</span>,</div>
                      <div>build it anyways.</div>
                    </h1>
                  </div>

                  {/* Main Input - Centered */}
                  <form onSubmit={handleSubmit} className="relative max-w-4xl mx-auto">
                    <div className="relative bg-gray-900 border border-white/10 rounded-lg shadow-2xl overflow-hidden hover:border-white/20 focus-within:border-white/30 transition-all duration-300">
                      <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="What do you want to build?"
                        rows={2}
                        className="w-full px-8 py-6 pr-20 bg-transparent text-white placeholder-gray-500 focus:outline-none text-xl font-light resize-none max-h-[200px] overflow-y-auto"
                        style={{ minHeight: '80px' }}
                        disabled={isLoading}
                      />
                      <button
                        type="submit"
                        disabled={isLoading || !input.trim()}
                        className="absolute right-4 bottom-4 p-3 text-white hover:text-gray-300 disabled:text-gray-600 disabled:cursor-not-allowed transition-all duration-200"
                      >
                        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                        </svg>
                      </button>
                    </div>
                    <div className="mt-3 flex justify-start">
                      <AgentSelector className="w-full sm:w-64" />
                    </div>
                  </form>
                </div>
              </motion.div>
            )}

            {/* Loading State - Show until mounted and project data loaded */}
            {(messages.length > 0 || selectedProjectSlug || isCreatingProject) && (!isMounted || (selectedProjectSlug && isLoadingProject)) && (
              <motion.div
                key="initial-loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex-1 flex items-center justify-center"
              >
                <div className="text-center space-y-4">
                  <Sparkles className="w-12 h-12 mx-auto text-purple-400 animate-pulse" />
                  <p className="text-gray-400">Loading workspace...</p>
                </div>
              </motion.div>
            )}

            {/* Three-Panel Layout - Show after mounted and data loaded */}
            {(messages.length > 0 || selectedProjectSlug || isCreatingProject) && isMounted && !(selectedProjectSlug && isLoadingProject) && (
          <motion.div
            key="chat-layout"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="flex-1 flex flex-col lg:flex-row gap-4 p-4 min-h-0 overflow-hidden"
          >
            {/* Left Panel - Chat (1/3 width) */}
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
              className="lg:w-1/3 flex flex-col min-w-0 min-h-0 max-h-full"
            >
              <div className="flex-1 flex flex-col min-h-0 max-h-full bg-black/20 backdrop-blur-md border border-white/10 rounded-xl shadow-xl overflow-hidden">
                {/* Project Status Header */}
                {currentProject && (
                  <div className="border-b border-white/10 p-4">
                    <div className="flex items-center gap-3 mb-2">
                      {/* Status Indicator Circle - Sentry Colors */}
                      <div className="relative group">
                        <div className={`w-3 h-3 rounded-full ${
                          currentProject.status === 'pending' ? 'bg-[#7553FF]' : // Sentry Blurple
                          currentProject.status === 'in_progress' ? 'bg-[#FFD00E] animate-pulse shadow-lg shadow-[#FFD00E]/50' : // Sentry Yellow
                          currentProject.status === 'completed' ? 'bg-[#92DD00] shadow-lg shadow-[#92DD00]/30' : // Sentry Green
                          'bg-[#FF45A8]' // Sentry Pink
                        }`} />
                        {/* Tooltip */}
                        <div className="absolute left-0 top-6 hidden group-hover:block z-50">
                          <div className="bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap border border-white/10">
                            {currentProject.status === 'pending' && 'Pending'}
                            {currentProject.status === 'in_progress' && 'Generating...'}
                            {currentProject.status === 'completed' && 'Completed'}
                            {currentProject.status === 'failed' && 'Failed'}
                          </div>
                        </div>
                      </div>

                      <div className="flex-1">
                        <h2 className="text-lg font-semibold">{currentProject.name}</h2>
                        {currentProject.description && (
                          <p className="text-sm text-gray-400">{currentProject.description}</p>
                        )}
                      </div>
                    </div>

                    {/* Error message and retry button */}
                    {currentProject.status === 'failed' && (
                      <div className="mt-3 p-3 bg-[#FF45A8]/10 border border-[#FF45A8]/30 rounded-lg">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-[#FF45A8] mb-1">Generation Failed</p>
                            {currentProject.errorMessage && (
                              <p className="text-xs text-[#FF70BC]/80">{currentProject.errorMessage}</p>
                            )}
                          </div>
                          <button
                            onClick={async () => {
                              const promptToRetry = currentProject.originalPrompt || currentProject.description;
                              if (promptToRetry) {
                                await fetch(`/api/projects/${currentProject.id}`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ status: 'pending', errorMessage: null }),
                                });
                                refetch();
                                await startGeneration(currentProject.id, promptToRetry, { isRetry: true });
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

                {/* View Tabs - Only show when we have content */}
                {(generationState || messages.length > 0 || buildHistory.length > 0) && !isCreatingProject && (
                  <div className="border-b border-white/10 px-6 py-3 flex items-center gap-2">
                    {/* Chat Tab */}
                    <button
                      onClick={() => switchTab('chat')}
                      className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        activeView === 'chat'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {hasUnreadChatMessages && activeView !== 'chat' && (
                        <span className="absolute -top-1 -right-1 w-3 h-3 bg-purple-500 rounded-full animate-pulse shadow-lg shadow-purple-500/50" />
                      )}
                      Chat {chatMessageCount > 0 && `(${chatMessageCount})`}
                    </button>

                    {/* Build Tab - Show badge based on state */}
                    <button
                      onClick={() => switchTab('build')}
                      className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        activeView === 'build'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {/* Activity indicator dot - top right corner */}
                      {generationState?.isActive && activeView !== 'build' && (
                        <span className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full animate-pulse shadow-lg shadow-yellow-400/50" />
                      )}
                      Build {
                        generationState?.isActive ? (
                          buildProgress > 0 && `(${buildProgress}%)`
                        ) : buildProgress === 100 ? (
                          <span className="text-green-400">✓</span>
                        ) : null
                      }
                    </button>

                    <div className="ml-auto text-xs text-gray-500">
                      ⌘1 Chat • ⌘2 Build
                    </div>
                  </div>
                )}

                <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-6 min-h-0">
                  {/* Beautiful loading OR Generation Progress */}
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
                            ease: "easeInOut"
                          }}
                          className="mx-auto w-20 h-20 flex items-center justify-center rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 backdrop-blur-sm border border-purple-500/30"
                        >
                          <Sparkles className="w-10 h-10 text-purple-400" />
                        </motion.div>

                        {/* Loading text */}
                        <div className="space-y-2">
                          <h3 className="text-2xl font-semibold text-white">
                            {isAnalyzingTemplate ? 'Analyzing Your Request' : 'Preparing Your Project'}
                          </h3>
                          <p className="text-gray-400">
                            {isAnalyzingTemplate
                              ? `${selectedAgentId === 'claude-code' ? 'Claude Sonnet 4.5' : 'GPT-5 Codex'} is selecting the best template...`
                              : 'Setting up the perfect environment...'
                            }
                          </p>

                          {/* Show selected template if available */}
                          {selectedTemplate && !isAnalyzingTemplate && (
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
                            transition={{ duration: 1.5, repeat: Infinity, delay: 0 }}
                            className="w-2 h-2 bg-purple-400 rounded-full"
                          />
                          <motion.div
                            animate={{ opacity: [0.3, 1, 0.3] }}
                            transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
                            className="w-2 h-2 bg-pink-400 rounded-full"
                          />
                          <motion.div
                            animate={{ opacity: [0.3, 1, 0.3] }}
                            transition={{ duration: 1.5, repeat: Infinity, delay: 0.4 }}
                            className="w-2 h-2 bg-purple-400 rounded-full"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Build View - Shows active build + history */}
                  {!isCreatingProject && activeView === 'build' && (
                    <div className="space-y-6">
                      {/* Debug info */}
                      {(() => {
                        console.log('🔍 Build View Render:', {
                          hasGenerationState: !!generationState,
                          todosLength: generationState?.todos?.length,
                          isActive: generationState?.isActive,
                          historyLength: buildHistory.length,
                          activeView,
                        });
                        return null;
                      })()}

                      {/* Active Build - Always show if active */}
                      {generationState?.isActive && (
                        <div>
                          {generationState.todos && generationState.todos.length > 0 ? (
                            <BuildProgress
                              state={generationState}
                              templateInfo={selectedTemplate}
                              onClose={() => updateGenerationState(null)}
                              onViewFiles={() => {
                                window.dispatchEvent(new CustomEvent('switch-to-editor'));
                              }}
                              onStartServer={startDevServer}
                            />
                          ) : (
                            <InitializingCard projectName={generationState.projectName} />
                          )}
                        </div>
                      )}

                      {/* Active Element Changes */}
                      {activeElementChanges.length > 0 && (
                        <div>
                          <h3 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
                            <span>Element Changes</span>
                            <span className="text-xs text-gray-600">({activeElementChanges.length})</span>
                          </h3>
                          <div className="space-y-3">
                            {activeElementChanges.map(change => (
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

                      {/* Completed Build (most recent) - Collapsed by default */}
                      {!generationState?.isActive && generationState && generationState.todos && generationState.todos.length > 0 && (
                        <div>
                          <h3 className="text-sm font-semibold text-gray-400 mb-3">Most Recent Build</h3>
                          <BuildProgress
                            state={generationState}
                            templateInfo={selectedTemplate}
                            defaultCollapsed={true}
                            onClose={() => updateGenerationState(null)}
                            onViewFiles={() => {
                              window.dispatchEvent(new CustomEvent('switch-to-editor'));
                            }}
                            onStartServer={startDevServer}
                          />
                        </div>
                      )}

                      {/* Build History - Collapsed by default */}
                      {buildHistory.length > 0 && (
                        <div>
                          <h3 className="text-sm font-semibold text-gray-400 mb-3">Previous Builds ({buildHistory.length})</h3>
                          <div className="space-y-4">
                            {buildHistory.map((build) => (
                              <BuildProgress
                                key={build.id}
                                state={build}
                                defaultCollapsed={true}
                                onViewFiles={() => {
                                  window.dispatchEvent(new CustomEvent('switch-to-editor'));
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
                          <h3 className="text-sm font-semibold text-gray-400 mb-3">Element Changes ({elementChangeHistory.length})</h3>
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
                      {!generationState && activeElementChanges.length === 0 && buildHistory.length === 0 && elementChangeHistory.length === 0 && (
                        <div className="flex items-center justify-center min-h-[400px]">
                          <div className="text-center space-y-3 text-gray-400">
                            <Sparkles className="w-12 h-12 mx-auto opacity-50" />
                            <p>No builds to display</p>
                            <button
                              onClick={() => switchTab('chat')}
                              className="text-purple-400 hover:text-purple-300 underline text-sm"
                            >
                              Switch to Chat view
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Chat View - Show all messages (excluding element changes) */}
                  {activeView === 'chat' && (
                    <div className="space-y-6">
                      {messages.map((message) => {
                        // Skip element change messages (they're in Build tab now)
                        if (message.elementChange) {
                          return null;
                        }

                        // Skip messages with no visible content (only tools during active generation)
                        const hasVisibleContent = message.parts.some(part => {
                          if (part.type === 'text' && part.text) return true;
                          if (part.type.startsWith('tool-') && part.toolName !== 'TodoWrite' && !generationStateRef.current?.isActive) return true;
                          return false;
                        });

                        if (!hasVisibleContent) {
                          return null;
                        }

                        // Regular message rendering
                        return (
                          <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-4 duration-500`}>
                            <div className={`max-w-[85%] rounded-lg p-4 shadow-lg break-words ${
                              message.role === 'user'
                                ? 'bg-gradient-to-r from-[#FF45A8]/15 to-[#FF70BC]/15 text-white border-l-4 border-[#FF45A8] border-r border-t border-b border-[#FF45A8]/30'
                                : 'bg-white/5 border border-white/10 text-white'
                            }`}>
                      {message.parts.map((part, i) => {
                      if (part.type === 'text') {
                        // Check if this is a summary message
                        const isSummary = part.text && message.role === 'assistant' && (
                          (part.text.includes('✅') && (
                            part.text.includes('Created') ||
                            part.text.includes('Complete') ||
                            part.text.includes('successfully')
                          )) ||
                          (part.text.includes('Project Created') || part.text.includes('successfully created')) ||
                          (part.text.includes('🎉') && part.text.includes('created'))
                        );

                        if (isSummary && part.text) {
                          return (
                            <SummaryCard
                              key={i}
                              content={part.text}
                              onViewFiles={() => {
                                window.dispatchEvent(new CustomEvent('switch-to-editor'));
                              }}
                              onStartServer={currentProject?.runCommand ? startDevServer : undefined}
                              onStopServer={currentProject?.runCommand ? stopDevServer : undefined}
                              serverRunning={currentProject?.devServerStatus === 'running'}
                              serverStarting={currentProject?.devServerStatus === 'starting'}
                            />
                          );
                        }

                        return (
                          <div key={i} className="prose prose-invert max-w-none">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              rehypePlugins={[rehypeHighlight]}
                              components={{
                                code: ({ className, children, ...props }) => {
                                  const match = /language-(\w+)/.exec(className || '');
                                  const isInline = !match;
                                  return isInline ? (
                                    <code className="bg-[#181225] text-[#FF45A8] px-2 py-0.5 rounded text-sm font-mono border border-[#FF45A8]/30" {...props}>
                                      {children}
                                    </code>
                                  ) : (
                                    <code className={className} {...props}>
                                      {children}
                                    </code>
                                  );
                                },
                                pre: ({ children }) => (
                                  <CodeBlock>{children}</CodeBlock>
                                ),
                                p: ({ children }) => <p className="mb-4 last:mb-0">{children}</p>,
                                ul: ({ children }) => <ul className="list-disc list-inside mb-4 space-y-1">{children}</ul>,
                                ol: ({ children }) => <ol className="list-decimal list-inside mb-4 space-y-1">{children}</ol>,
                                li: ({ children }) => <li className="ml-2">{children}</li>,
                                h1: ({ children }) => <h1 className="text-2xl font-bold mb-4 mt-6 first:mt-0 text-[#FF45A8]">{children}</h1>,
                                h2: ({ children }) => <h2 className="text-xl font-semibold mb-3 mt-5 first:mt-0 text-[#FFD00E]">{children}</h2>,
                                h3: ({ children }) => <h3 className="text-lg font-medium mb-2 mt-4 first:mt-0 text-[#7553FF]">{children}</h3>,
                                a: ({ children, href }) => (
                                  <a href={href} className="text-[#226DFC] underline hover:text-[#3EDCFF] break-all font-medium" target="_blank" rel="noopener noreferrer">
                                    {children}
                                  </a>
                                ),
                                blockquote: ({ children }) => (
                                  <blockquote className="border-l-4 border-[#FF45A8] bg-[#FF45A8]/5 pl-4 py-2 italic my-4 rounded-r">
                                    {children}
                                  </blockquote>
                                ),
                              }}
                            >
                              {part.text}
                            </ReactMarkdown>
                          </div>
                        );
                      }

                      // Skip TodoWrite - handled by GenerationProgress
                      if (part.type === 'tool-TodoWrite' || part.toolName === 'TodoWrite') {
                        return null;
                      }

                      // Skip other tools during active generation - shown in GenerationProgress
              if (generationStateRef.current?.isActive && part.type.startsWith('tool-')) {
                        return null;
                      }

                      // Handle dynamic tool parts with accordion
                      if (part.type.startsWith('tool-')) {
                        const toolName = part.toolName || part.type.replace('tool-', '');

                        return (
                          <ToolCallCard
                            key={i}
                            toolName={toolName}
                            input={part.input}
                            output={part.output}
                            state={part.state as any}
                          />
                        );
                      }

                      return null;
                    })}
                          </div>
                          </div>
                        );
                      })}

                      {/* Loading indicator in chat view */}
                      {isGenerating && (!generationState || generationState.todos.length === 0 || generationState.isActive) && (
                        <div className="flex justify-start animate-in fade-in duration-500">
                          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
                              <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                              <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                              <span className="ml-2 text-sm text-gray-400">Initializing...</span>
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
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                        </svg>
                      </button>
                    </div>
                  </form>
                  <div className="mt-3 flex justify-start">
                    <AgentSelector className="w-full md:w-64" />
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Right Panel - Split into Tabbed Preview (top) and Terminal (bottom) (2/3 width) */}
            <div className="lg:w-2/3 flex flex-col gap-4 min-w-0">
              {/* Tabbed Preview Panel - Top */}
              <div className="flex-1 min-h-0">
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
                />
              </div>

              {/* Terminal Output - Bottom */}
              <div className="h-60">
                <TerminalOutput
                  projectId={currentProject?.id}
                  onPortDetected={(port) => {
                    console.log('🔍 Terminal detected port update:', port);
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
