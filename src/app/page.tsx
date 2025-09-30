'use client';

import { useChat } from '@ai-sdk/react';
import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { motion, AnimatePresence } from 'framer-motion';
import FileExplorer from '@/components/FileExplorer';
import PreviewPanel from '@/components/PreviewPanel';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { useProjects } from '@/contexts/ProjectContext';

export default function Home() {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const selectedProject = searchParams.get('project');
  const [lastProjectName, setLastProjectName] = useState<string | null>(null);
  const { projects } = useProjects();

  const isLoading = status === 'streaming';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Watch for new project directories being created
  useEffect(() => {
    // Extract project name from the last assistant message if it's about creating a project
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === 'assistant') {
      const textParts = lastMessage.parts.filter(part => part.type === 'text');
      const fullText = textParts.map(part => 'text' in part ? part.text : '').join(' ');

      // Look for project name patterns in the message
      const projectNameMatch = fullText.match(/(?:creating|created|building|project)\s+(?:called\s+)?["']?([a-z0-9-]+)["']?/i);
      if (projectNameMatch) {
        const projectName = projectNameMatch[1];
        if (projectName !== lastProjectName) {
          setLastProjectName(projectName);
        }
      }
    }
  }, [messages, lastProjectName]);

  // Auto-select the project when its directory appears
  useEffect(() => {
    if (lastProjectName && !selectedProject) {
      // Check if the project now exists in the projects list
      const projectExists = projects.some(p => p.slug === lastProjectName);
      if (projectExists) {
        // Update the URL to select this project
        router.push(`/?project=${lastProjectName}`);
      }
    }
  }, [lastProjectName, selectedProject, projects, router]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  return (
    <SidebarProvider defaultOpen={!selectedProject}>
      <AppSidebar />
      <SidebarInset className="bg-gradient-to-tr from-[#1D142F] to-[#31145F]">
        <div className="h-screen bg-gradient-to-tr from-[#1D142F] to-[#31145F] text-white flex flex-col overflow-hidden">
          {/* Sidebar Trigger - Always visible */}
          <div className="absolute top-4 left-4 z-50">
            <SidebarTrigger />
          </div>

          {/* Landing Page */}
          <AnimatePresence mode="wait">
            {messages.length === 0 && !selectedProject && (
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
                    <h1 className="text-[6rem] md:text-[8rem] font-bold inline-block">
                      <div>Code <span className="inline-block -rotate-[10deg]" style={{ color: '#FD44B0' }}>breaks</span>,</div>
                      <div>build it anyways.</div>
                    </h1>
                    <p className="text-xl text-gray-400 font-light">What would you like to create?</p>
                  </div>

                  {/* Main Input - Centered */}
                  <form onSubmit={handleSubmit} className="relative max-w-2xl mx-auto">
                    <div className="relative bg-gray-900 border border-white/10 rounded-lg shadow-2xl overflow-hidden hover:border-white/20 focus-within:border-white/30 transition-all duration-300">
                      <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Type your message..."
                        rows={3}
                        className="w-full px-6 py-5 pr-16 bg-transparent text-white placeholder-gray-500 focus:outline-none text-lg font-light resize-none"
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
              </motion.div>
            )}

            {/* Three-Panel Layout - Chat on left, Preview/Explorer on right */}
            {(messages.length > 0 || selectedProject) && (
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
                                code: ({ node, className, children, ...props }) => {
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
                      if (part.type === 'tool-bash') {
                        const bashInput = part.input as { command?: string } | undefined;
                        return (
                          <div key={i} className="mt-2 p-3 bg-background/40 rounded-lg border border-white/10">
                            <div className="text-xs font-mono text-gray-400 mb-2">$ BASH</div>
                            <pre className="text-sm text-gray-300 font-mono">{bashInput?.command || 'No command'}</pre>
                            {'output' in part && part.output ? (
                              <div className="mt-2">
                                <div className="text-xs font-mono text-gray-400 mb-1">Output:</div>
                                <pre className="text-xs text-gray-500 font-mono">{JSON.stringify(part.output, null, 2)}</pre>
                              </div>
                            ) : null}
                          </div>
                        );
                      }
                      if (part.type === 'tool-text_editor') {
                        return (
                          <div key={i} className="mt-2 p-3 bg-background/40 rounded-lg border border-white/10">
                            <div className="text-xs font-mono text-gray-400 mb-2">EDITOR</div>
                            <pre className="text-xs text-gray-300 font-mono">{part.input ? JSON.stringify(part.input, null, 2) : 'No input'}</pre>
                            {'output' in part && part.output ? (
                              <div className="mt-2">
                                <div className="text-xs font-mono text-gray-400 mb-1">Output:</div>
                                <pre className="text-xs text-gray-500 font-mono">{JSON.stringify(part.output, null, 2)}</pre>
                              </div>
                            ) : null}
                          </div>
                        );
                      }
                      if (part.type === 'tool-web_search') {
                        const searchInput = part.input as { query?: string } | undefined;
                        return (
                          <div key={i} className="mt-2 p-3 bg-background/40 rounded-lg border border-white/10">
                            <div className="text-xs font-mono text-gray-400 mb-2">SEARCH</div>
                            <pre className="text-xs text-gray-300 font-mono">{searchInput?.query || 'No query'}</pre>
                            {'output' in part && part.output ? (
                              <div className="mt-2">
                                <div className="text-xs font-mono text-gray-400 mb-1">Results:</div>
                                <pre className="text-xs text-gray-500 font-mono max-h-40 overflow-y-auto">{JSON.stringify(part.output, null, 2)}</pre>
                              </div>
                            ) : null}
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                </div>
              ))}
              {isLoading && (
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

            {/* Right Panel - Split into Preview (top) and File Explorer (bottom) */}
            <div className="lg:w-1/2 flex flex-col gap-4 min-w-0">
              {/* Preview Panel - Top */}
              <div className="flex-1 min-h-0">
                <PreviewPanel selectedProject={selectedProject} />
              </div>

              {/* File Explorer - Bottom */}
              <div className="h-80">
                <FileExplorer
                  projectFilter={selectedProject}
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
