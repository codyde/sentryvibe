'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { motion, AnimatePresence } from 'framer-motion';
import TabbedPreview from '@/components/TabbedPreview';
import TerminalOutput from '@/components/TerminalOutput';
import ProcessManagerModal from '@/components/ProcessManagerModal';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { useProjects, type Project } from '@/contexts/ProjectContext';

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
}

export default function Home() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(null);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const hasStartedGenerationRef = useRef<Set<string>>(new Set());
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
        console.log('   Setting messages:', formattedMessages.length);
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
        setCurrentProject(project);
        loadMessages(project.id);
      }
    } else {
      setCurrentProject(null);
      setMessages([]);
      // Clear generation tracking when leaving project
      hasStartedGenerationRef.current.clear();
    }
  }, [selectedProjectSlug, projects]);

  // Auto-start generation if needed
  useEffect(() => {
    if (
      currentProject &&
      shouldGenerate &&
      messages.length === 0 &&
      !isGenerating &&
      !hasStartedGenerationRef.current.has(currentProject.id)
    ) {
      // Mark this project as having started generation
      hasStartedGenerationRef.current.add(currentProject.id);

      // Use original prompt from database, fallback to description
      const promptToUse = currentProject.originalPrompt || currentProject.description;

      // Clean up URL (remove generate flag)
      router.replace(`/?project=${currentProject.slug}`);

      // Add user message to UI before starting generation
      if (promptToUse) {
        const userMessage: Message = {
          id: `msg-${Date.now()}`,
          role: 'user',
          parts: [{ type: 'text', text: promptToUse }],
        };
        setMessages([userMessage]);

        // Start generation (don't add message again since we just did)
        startGeneration(currentProject.id, promptToUse, false);
      }
    }
  }, [currentProject, shouldGenerate, messages.length, isGenerating]);

  const startGeneration = async (projectId: string, prompt: string, addUserMessage = false) => {
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
              currentMessage = {
                id: data.messageId || `msg-${Date.now()}`,
                role: 'assistant',
                parts: [],
              };
            } else if (data.type === 'text-start') {
              currentTextPart = { id: data.id, text: '' };
            } else if (data.type === 'text-delta' && currentTextPart) {
              currentTextPart.text += data.delta;

              if (currentMessage) {
                const existingPartIndex = currentMessage.parts.findIndex(p => p.type === 'text' && p.text?.includes(currentTextPart!.text));
                if (existingPartIndex === -1) {
                  currentMessage.parts.push({ type: 'text', text: currentTextPart.text });
                } else {
                  currentMessage.parts[existingPartIndex] = { type: 'text', text: currentTextPart.text };
                }

                setMessages(prev => {
                  const existing = prev.find(m => m.id === currentMessage!.id);
                  if (existing) {
                    return prev.map(m => m.id === currentMessage!.id ? { ...currentMessage! } : m);
                  }
                  return [...prev, { ...currentMessage! }];
                });
              }
            } else if (data.type === 'tool-input-available' && currentMessage) {
              currentMessage.parts.push({
                type: `tool-${data.toolName}`,
                toolCallId: data.toolCallId,
                toolName: data.toolName,
                input: data.input,
                state: 'input-available',
              });
              setMessages(prev => prev.map(m => m.id === currentMessage!.id ? { ...currentMessage! } : m));
            } else if (data.type === 'tool-output-available' && currentMessage) {
              const toolPart = currentMessage.parts.find(p => p.toolCallId === data.toolCallId);
              if (toolPart) {
                toolPart.output = data.output;
                toolPart.state = 'output-available';
                setMessages(prev => prev.map(m => m.id === currentMessage!.id ? { ...currentMessage! } : m));
              }
            } else if (data.type === 'finish') {
              currentMessage = null;
              currentTextPart = null;
            }
          } catch (e) {
            // Skip malformed JSON
          }
        }
      }

      refetch(); // Refresh project list to update status
    } catch (error) {
      console.error('Generation error:', error);
    } finally {
      setIsGenerating(false);
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

        refetch(); // Refresh project list

        // Redirect to new project with generate flag (prompt stored in DB)
        router.push(`/?project=${project.slug}&generate=true`);
      } catch (error) {
        console.error('Error creating project:', error);
      } finally {
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

            {/* Loading state for project creation */}
            {isCreatingProject && (
              <motion.div
                key="creating"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex-1 flex items-center justify-center p-4"
              >
                <div className="text-center space-y-4">
                  <div className="flex items-center gap-3 justify-center">
                    <div className="w-3 h-3 bg-white rounded-full animate-bounce"></div>
                    <div className="w-3 h-3 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-3 h-3 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                  </div>
                  <p className="text-xl font-light">Creating your project...</p>
                </div>
              </motion.div>
            )}

            {/* Three-Panel Layout - Chat on left, Preview/Explorer on right */}
            {(messages.length > 0 || selectedProjectSlug) && !isCreatingProject && (
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
                      {/* Status Indicator Circle */}
                      <div className="relative group">
                        <div className={`w-3 h-3 rounded-full ${
                          currentProject.status === 'pending' ? 'bg-gray-500' :
                          currentProject.status === 'in_progress' ? 'bg-yellow-500 animate-pulse' :
                          currentProject.status === 'completed' ? 'bg-green-500' :
                          'bg-red-500'
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
                      <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-red-400 mb-1">Generation Failed</p>
                            {currentProject.errorMessage && (
                              <p className="text-xs text-red-300/80">{currentProject.errorMessage}</p>
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
                            className="px-3 py-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded transition-colors"
                          >
                            Retry
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-6 min-h-0">
                  <div className="space-y-6">
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-4 duration-500`}>
                  <div className={`max-w-[85%] rounded-lg p-4 shadow-lg break-words ${message.role === 'user' ? 'bg-white text-black' : 'bg-white/5 border border-white/10 text-white'}`}>
                    {message.parts.map((part, i) => {
                      if (part.type === 'text') {
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
                                    <code className="bg-white/10 text-white px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                                      {children}
                                    </code>
                                  ) : (
                                    <code className={className} {...props}>
                                      {children}
                                    </code>
                                  );
                                },
                                pre: ({ children }) => (
                                  <pre className="bg-background text-white p-4 rounded-lg overflow-x-auto border border-white/10">
                                    {children}
                                  </pre>
                                ),
                                p: ({ children }) => <p className="mb-4 last:mb-0">{children}</p>,
                                ul: ({ children }) => <ul className="list-disc list-inside mb-4 space-y-1">{children}</ul>,
                                ol: ({ children }) => <ol className="list-decimal list-inside mb-4 space-y-1">{children}</ol>,
                                li: ({ children }) => <li className="ml-2">{children}</li>,
                                h1: ({ children }) => <h1 className="text-2xl font-semibold mb-4 mt-6 first:mt-0">{children}</h1>,
                                h2: ({ children }) => <h2 className="text-xl font-semibold mb-3 mt-5 first:mt-0">{children}</h2>,
                                h3: ({ children }) => <h3 className="text-lg font-semibold mb-2 mt-4 first:mt-0">{children}</h3>,
                                blockquote: ({ children }) => (
                                  <blockquote className="border-l-4 border-white/20 pl-4 italic my-4">{children}</blockquote>
                                ),
                                a: ({ children, href }) => (
                                  <a href={href} className="text-blue-400 underline hover:text-blue-300 break-all" target="_blank" rel="noopener noreferrer">
                                    {children}
                                  </a>
                                ),
                              }}
                            >
                              {part.text}
                            </ReactMarkdown>
                          </div>
                        );
                      }

                      // Handle dynamic tool parts
                      if (part.type.startsWith('tool-')) {
                        const toolName = part.toolName || part.type.replace('tool-', '');
                        const state = part.state;

                        return (
                          <div key={i} className="mt-2 p-3 bg-gradient-to-r from-purple-900/20 to-pink-900/20 rounded-lg border border-purple-500/30">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="text-xs font-mono text-purple-300">🔧 {toolName}</div>
                              {state === 'input-streaming' && (
                                <div className="text-xs text-gray-400 animate-pulse">Preparing...</div>
                              )}
                              {state === 'input-available' && (
                                <div className="text-xs text-yellow-400">Running...</div>
                              )}
                              {state === 'output-available' && (
                                <div className="text-xs text-green-400">✓ Complete</div>
                              )}
                            </div>

                            {part.input !== undefined && part.input !== null && (
                              <div className="mb-2">
                                <div className="text-xs font-mono text-gray-400 mb-1">Input:</div>
                                <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap">
                                  {typeof part.input === 'string' ? part.input : JSON.stringify(part.input, null, 2)}
                                </pre>
                              </div>
                            )}

                            {part.output !== undefined && part.output !== null && (
                              <div>
                                <div className="text-xs font-mono text-gray-400 mb-1">Output:</div>
                                <pre className="text-xs text-gray-400 font-mono max-h-40 overflow-y-auto whitespace-pre-wrap">
                                  {typeof part.output === 'string' ? part.output : JSON.stringify(part.output, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        );
                      }

                      return null;
                    })}
                  </div>
                </div>
              ))}
              {isGenerating && (
                <div className="flex justify-start animate-in fade-in duration-500">
                  <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                    </div>
                  </div>
                </div>
              )}
                    <div ref={messagesEndRef} />
                  </div>
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
