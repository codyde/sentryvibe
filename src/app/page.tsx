'use client';

import { useState, useEffect, useRef } from 'react';
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
import TodoVibe, { type TodoItem } from '@/components/TodoVibe';
import GenerationProgress from '@/components/GenerationProgress';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { useProjects, type Project } from '@/contexts/ProjectContext';
import type { GenerationState, ToolCall } from '@/types/generation';
import { saveGenerationState, deserializeGenerationState } from '@/lib/generation-persistence';

interface MessagePart {
  type: string;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  state?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  parts: MessagePart[];
  generationState?: GenerationState; // For generation messages
}

export default function Home() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(null);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [generationState, setGenerationState] = useState<GenerationState | null>(null); // Separate, protected state!
  const [activeView, setActiveView] = useState<'build' | 'chat'>(() => {
    // Load from session storage or default to 'build'
    if (typeof window !== 'undefined') {
      return (sessionStorage.getItem('preferredView') as 'build' | 'chat') || 'build';
    }
    return 'build';
  });
  const hasStartedGenerationRef = useRef<Set<string>>(new Set());
  const isGeneratingRef = useRef(false); // Sync flag for immediate checks
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const selectedProjectSlug = searchParams.get('project');
  const shouldGenerate = searchParams.get('generate') === 'true';
  const { projects, refetch } = useProjects();

  const isLoading = isCreatingProject || isGenerating;
  const activeProject = selectedProjectSlug || selectedDirectory;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Handle tab switching
  const switchTab = (tab: 'build' | 'chat') => {
    setActiveView(tab);
    sessionStorage.setItem('preferredView', tab);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '1') {
        e.preventDefault();
        switchTab('build');
      } else if ((e.metaKey || e.ctrlKey) && e.key === '2') {
        e.preventDefault();
        switchTab('chat');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
  }, [messages, isLoading]);

  const loadMessages = async (projectId: string) => {
    console.log('📥 Loading messages for project:', projectId);

    // Don't load during active generation (use ref for immediate check!)
    if (generationState?.isActive || isGeneratingRef.current) {
      console.log('🛑 BLOCKED - generation in progress');
      return;
    }

    try {
      const res = await fetch(`/api/projects/${projectId}/messages`);
      const data = await res.json();

      if (data.messages) {
        console.log(`   Found ${data.messages.length} messages in DB`);
        const formattedMessages: Message[] = data.messages.map((msg: { id: string; role: 'user' | 'assistant'; content: MessagePart[] }) => ({
          id: msg.id,
          role: msg.role,
          parts: Array.isArray(msg.content) ? msg.content : [],
        }));
        console.log('   ⚠️⚠️⚠️ SETTING MESSAGES FROM DB (will wipe current):', formattedMessages.length);
        setMessages(formattedMessages);
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  // Load project data when selected
  useEffect(() => {
    if (selectedProjectSlug) {
      const project = projects.find(p => p.slug === selectedProjectSlug);
      if (project) {
        const wasInProgress = currentProject?.status === 'in_progress';
        const nowCompleted = project.status === 'completed';

        // Only update currentProject if it changed
        if (!currentProject || currentProject.id !== project.id) {
          console.log('🔄 Project changed to:', project.slug);
          console.log('   Has generationState in DB?', !!project.generationState);
          console.log('   generationState value:', project.generationState);
          setCurrentProject(project);

          // Load persisted generationState if it exists
          if (project.generationState) {
            console.log('🎨🎨🎨 Restoring generationState from DB!');
            console.log('   Raw value type:', typeof project.generationState);
            const restored = deserializeGenerationState(project.generationState as string);
            if (restored) {
              console.log('   ✅ Deserialized successfully, todos:', restored.todos.length);
              setGenerationState(restored);
            } else {
              console.log('   ❌ Deserialization failed, loading messages');
              loadMessages(project.id);
            }
          } else {
            console.log('📥 No generationState - loading regular messages');
            // Load regular messages if no generationState
            loadMessages(project.id);
          }
        } else {
          // Same project - only refresh if NOT generating
          console.log('🔄 Same project, checking if we should refresh messages...');
          console.log('   Has generationState?', !!project.generationState);

          // Restore generationState if project has it
          if (project.generationState && !generationState) {
            console.log('🎨🎨🎨 Restoring generationState from DB (same project)!');
            const restored = deserializeGenerationState(project.generationState as string);
            if (restored) {
              setGenerationState(restored);
            }
          } else if (!project.generationState) {
            loadMessages(project.id); // loadMessages will block if needed
          }
        }

        // Auto-start server when generation completes
        if (wasInProgress && nowCompleted && project.runCommand && project.devServerStatus !== 'running') {
          console.log('🚀 Generation completed, auto-starting dev server...');
          setTimeout(() => startDevServer(), 1000); // Small delay to let UI settle
        }
      }
    } else {
      setCurrentProject(null);
      setMessages([]);
      // Clear generation tracking when leaving project
      hasStartedGenerationRef.current.clear();
    }
  }, [selectedProjectSlug, projects]); // Removed isGenerating from deps!

  // Disabled: We now handle generation directly in handleSubmit without redirects
  // This prevents the flash/reload issue when creating new projects

  const startGeneration = async (projectId: string, prompt: string, addUserMessage = false) => {
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

    // Create SEPARATE generation state (not in messages!)
    const project = projects.find(p => p.id === projectId);
    if (project) {
      console.log('🎬🎬🎬 Creating generation state for:', project.name);
      setGenerationState({
        id: `gen-${Date.now()}`,
        projectId: project.id,
        projectName: project.name,
        todos: [],
        toolsByTodo: {},
        textByTodo: {},
        activeTodoIndex: -1,
        isActive: true,
        startTime: new Date(),
      });
    } else {
      console.error('❌ Project not found for ID:', projectId);
    }

    await startGenerationStream(projectId, prompt);
  };

  const startGenerationStream = async (projectId: string, prompt: string) => {

    try {
      const res = await fetch(`/api/projects/${projectId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) {
        throw new Error('Generation failed');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader available');

      const decoder = new TextDecoder();
      let currentMessage: Message | null = null;
      let currentTextPart: { id: string; text: string } | null = null;
      const textBlocksMap = new Map<string, { type: string; text: string }>(); // Track text blocks by ID

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;

          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'start') {
              // Don't create messages during generation - they're captured in generationState
              currentMessage = {
                id: data.messageId || `msg-${Date.now()}`,
                role: 'assistant',
                parts: [],
              };
            } else if (data.type === 'text-start') {
              textBlocksMap.set(data.id, { type: 'text', text: '' });
              currentTextPart = { id: data.id, text: '' };
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
              currentTextPart = { id: blockId, text: textBlock.text };

              // Also add to generation state if active
              if (generationState?.isActive) {
                setGenerationState(prev => {
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

              if (currentMessage) {
                // Rebuild parts array from all text blocks in order
                const textParts = Array.from(textBlocksMap.values());

                // Replace or add text parts
                currentMessage.parts = currentMessage.parts.filter(p => !p.type.startsWith('text'));
                currentMessage.parts.unshift(...textParts);

                // Trigger re-render
                setMessages(prev => {
                  const existing = prev.find(m => m.id === currentMessage!.id);
                  if (existing) {
                    return prev.map(m => m.id === currentMessage!.id ? { ...currentMessage! } : m);
                  }
                  return [...prev, { ...currentMessage! }];
                });
              }
            } else if (data.type === 'text-end') {
              console.log('✅ Text block finished:', data.id);
            } else if (data.type === 'tool-input-available') {
              // Route TodoWrite to separate generation state
              if (data.toolName === 'TodoWrite') {
                const inputData = data.input as { todos?: TodoItem[] };
                const todos = inputData?.todos || [];

                console.log('📝 TodoWrite - updating generation state');
                console.log('   Todos count:', todos.length);

                setGenerationState(prev => {
                  if (!prev) return null;

                  const activeIndex = todos.findIndex(t => t.status === 'in_progress');

                  const updated = {
                    ...prev,
                    todos,
                    activeTodoIndex: activeIndex,
                  };

                  // Save to DB using projectId from state (always available!)
                  console.log('💾 Saving TodoWrite update, projectId:', updated.projectId);
                  saveGenerationState(updated.projectId, updated);

                  return updated;
                });
              } else {
                // Route other tools to generation state (nested under active todo)
                console.log('🔧 Tool', data.toolName, '- updating generation state');

                setGenerationState(prev => {
                  if (!prev) return null;

                  const tool: ToolCall = {
                    id: data.toolCallId,
                    name: data.toolName,
                    input: data.input,
                    state: 'input-available',
                    startTime: new Date(),
                  };

                  const activeIndex = prev.activeTodoIndex >= 0 ? prev.activeTodoIndex : 0;
                  const existing = prev.toolsByTodo[activeIndex] || [];

                  console.log('   ✅ Nesting under todo', activeIndex);

                  const updated = {
                    ...prev,
                    toolsByTodo: {
                      ...prev.toolsByTodo,
                      [activeIndex]: [...existing, tool],
                    },
                  };

                  // Save to DB using projectId from state
                  console.log('💾 Saving tool addition, projectId:', updated.projectId);
                  saveGenerationState(updated.projectId, updated);

                  return updated;
                });
              }

              // Also add tools to current message for DB persistence
              if (currentMessage && data.toolName !== 'TodoWrite') {
                currentMessage.parts.push({
                  type: `tool-${data.toolName}`,
                  toolCallId: data.toolCallId,
                  toolName: data.toolName,
                  input: data.input,
                  state: 'input-available',
                });
                setMessages(prev => prev.map(m => m.id === currentMessage!.id ? { ...currentMessage! } : m));
              }
            } else if (data.type === 'tool-output-available') {
              // Update tool in generation state
              setGenerationState(prev => {
                if (!prev) return null;

                const newToolsByTodo = { ...prev.toolsByTodo };

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
                  ...prev,
                  toolsByTodo: newToolsByTodo,
                };

                // Save to DB (tool completion is a checkpoint)
                console.log('💾 Saving tool completion, projectId:', updated.projectId);
                saveGenerationState(updated.projectId, updated);

                return updated;
              });

              // Also update in message for DB persistence
              if (currentMessage) {
                const toolPart = currentMessage.parts.find(p => p.toolCallId === data.toolCallId);
                if (toolPart) {
                  toolPart.output = data.output;
                  toolPart.state = 'output-available';
                  setMessages(prev => prev.map(m => m.id === currentMessage!.id ? { ...currentMessage! } : m));
                }
              }
            } else if (data.type === 'finish') {
              currentMessage = null;
              currentTextPart = null;
              textBlocksMap.clear(); // Clear for next message
            }
          } catch (e) {
            // Skip malformed JSON
          }
        }
      }

      // Mark generation as complete and SAVE
      setGenerationState(prev => {
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

      refetch(); // Refresh project list to update status

      // Poll for status updates (server auto-starts on backend)
      const pollInterval = setInterval(() => {
        console.log('🔄 Polling for project updates...');
        refetch();
      }, 2000);

      // Stop polling after 30 seconds
      setTimeout(() => {
        clearInterval(pollInterval);
        console.log('⏹️  Stopped polling');
      }, 30000);
    } catch (error) {
      console.error('Generation error:', error);
      // Mark generation as failed and SAVE
      setGenerationState(prev => {
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

      try {
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: userPrompt }),
        });

        if (!res.ok) throw new Error('Failed to create project');

        const data = await res.json();
        const project = data.project;

        console.log('✅ Project created:', project.slug);

        // Refresh project list IMMEDIATELY so sidebar updates
        await refetch();
        console.log('🔄 Sidebar refreshed with new project');

        // Update URL WITHOUT reloading (prevents flash!)
        router.replace(`/?project=${project.slug}`, { scroll: false });

        // Set project state directly
        setCurrentProject(project);
        setIsCreatingProject(false);

        // LOCK generation mode IMMEDIATELY (before any async state updates)
        isGeneratingRef.current = true;
        console.log('🔒 Locked generation mode with ref');

        // Create generationState DIRECTLY with the project we just created
        console.log('🎬🎬🎬 Creating generation state for:', project.name);
        setGenerationState({
          id: `gen-${Date.now()}`,
          projectId: project.id,
          projectName: project.name,
          todos: [],
          toolsByTodo: {},
          textByTodo: {},
          activeTodoIndex: -1,
          isActive: true,
          startTime: new Date(),
        });

        // Add user message
        const userMessage: Message = {
          id: `msg-${Date.now()}`,
          role: 'user',
          parts: [{ type: 'text', text: userPrompt }],
        };
        setMessages([userMessage]);

        // Start generation stream (don't add user message again)
        await startGenerationStream(project.id, userPrompt);

        // Refresh project list to pick up final state
        refetch();
      } catch (error) {
        console.error('Error creating project:', error);
        setIsCreatingProject(false);
      }
    } else {
      // Continue existing conversation - add user message to UI
      await startGeneration(currentProject.id, userPrompt, true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  const startDevServer = async () => {
    if (!currentProject) return;

    try {
      const res = await fetch(`/api/projects/${currentProject.id}/start`, { method: 'POST' });
      if (res.ok) {
        console.log('✅ Dev server started successfully!');

        // Mark final todo as completed when server starts!
        setGenerationState(prev => {
          if (!prev) return null;

          // Find the last todo (final summary)
          const lastTodoIndex = prev.todos.length - 1;
          if (lastTodoIndex < 0) return prev;

          const lastTodo = prev.todos[lastTodoIndex];
          const isFinalSummary = lastTodo.content.toLowerCase().includes('ready');

          // If it's the final summary and in_progress, mark it completed
          if (isFinalSummary && lastTodo.status === 'in_progress') {
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
          }

          return prev;
        });

        refetch(); // Refresh project data
      }
    } catch (error) {
      console.error('Failed to start dev server:', error);
    }
  };

  const stopDevServer = async () => {
    if (!currentProject) return;

    try {
      const res = await fetch(`/api/projects/${currentProject.id}/stop`, { method: 'POST' });
      if (res.ok) {
        refetch(); // Refresh project data
      }
    } catch (error) {
      console.error('Failed to stop dev server:', error);
    }
  };

  return (
    <SidebarProvider defaultOpen={!selectedProjectSlug}>
      <AppSidebar onOpenProcessModal={() => setShowProcessModal(true)} />
      <ProcessManagerModal isOpen={showProcessModal} onClose={() => setShowProcessModal(false)} />
      <SidebarInset className="bg-gradient-to-tr from-[#1D142F] to-[#31145F]">
        <div className="h-screen bg-gradient-to-tr from-[#1D142F] to-[#31145F] text-white flex flex-col overflow-hidden">
          {/* Sidebar Trigger - Always visible */}
          <div className="absolute top-4 left-4 z-50">
            <SidebarTrigger />
          </div>

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
                  </form>
                </div>
              </motion.div>
            )}

            {/* Three-Panel Layout - Always show when project selected or creating */}
            {(messages.length > 0 || selectedProjectSlug || isCreatingProject) && (
          <motion.div
            key="chat-layout"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="flex-1 flex flex-col lg:flex-row gap-4 p-4 min-h-0 overflow-hidden"
          >
            {/* Left Panel - Chat */}
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
              className="flex-1 flex flex-col min-w-0 min-h-0 max-h-full"
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
                                await startGeneration(currentProject.id, promptToRetry);
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
                {(generationState || messages.length > 0) && !isCreatingProject && (
                  <div className="border-b border-white/10 px-6 py-3 flex items-center gap-2">
                    <button
                      onClick={() => switchTab('build')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        activeView === 'build'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      Build {generationState && `(${buildProgress}%)`}
                    </button>
                    <button
                      onClick={() => switchTab('chat')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        activeView === 'chat'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      Chat {chatMessageCount > 0 && `(${chatMessageCount})`}
                    </button>
                    <div className="ml-auto text-xs text-gray-500">
                      ⌘1 Build • ⌘2 Chat
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
                          <h3 className="text-2xl font-semibold text-white">Preparing Your Project</h3>
                          <p className="text-gray-400">Setting up the perfect environment...</p>
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

                  {/* Build View - Show GenerationProgress */}
                  {!isCreatingProject && activeView === 'build' && generationState && (
                    <div className="mb-6">
                      <GenerationProgress
                        state={generationState}
                        onClose={() => setGenerationState(null)}
                        onViewFiles={() => {
                          window.dispatchEvent(new CustomEvent('switch-to-editor'));
                        }}
                        onStartServer={startDevServer}
                      />
                    </div>
                  )}

                  {/* Build View - No generation state yet */}
                  {!isCreatingProject && activeView === 'build' && !generationState && (
                    <div className="flex items-center justify-center min-h-[400px]">
                      <div className="text-center space-y-3 text-gray-400">
                        <Sparkles className="w-12 h-12 mx-auto opacity-50" />
                        <p>No active build to display</p>
                        <button
                          onClick={() => switchTab('chat')}
                          className="text-purple-400 hover:text-purple-300 underline text-sm"
                        >
                          Switch to Chat view
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Chat View - Show all messages */}
                  {activeView === 'chat' && (
                    <div className="space-y-6">
                      {messages.map((message) => (
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

                        if (isSummary) {
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
                      if (generationState?.isActive && part.type.startsWith('tool-')) {
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
                      ))}

                      {/* Loading indicator in chat view */}
                      {isGenerating && (!generationState || generationState.todos.length === 0) && (
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
                </div>
              </div>
            </motion.div>

            {/* Right Panel - Split into Tabbed Preview (top) and Terminal (bottom) */}
            <div className="lg:w-1/2 flex flex-col gap-4 min-w-0">
              {/* Tabbed Preview Panel - Top */}
              <div className="flex-1 min-h-0">
                <TabbedPreview
                  selectedProject={selectedProjectSlug}
                  projectId={currentProject?.id}
                  onStartServer={startDevServer}
                  onStopServer={stopDevServer}
                />
              </div>

              {/* Terminal Output - Bottom */}
              <div className="h-80">
                <TerminalOutput projectId={currentProject?.id} />
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
