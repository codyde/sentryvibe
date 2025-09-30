'use client';

import { useChat } from '@ai-sdk/react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';

export default function Home() {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status } = useChat();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isLoading = status === 'streaming';
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput('');
  };

  const isLoading = status === 'streaming';

  return (
    <div className="min-h-screen bg-black text-white flex flex-col transition-all duration-700 ease-in-out">
      {/* Landing Page */}
      {messages.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-4 transition-all duration-500">
          <div className="w-full max-w-3xl text-center space-y-12">
            {/* Title */}
            <div className="space-y-4">
              <h1 className="text-6xl md:text-7xl font-light tracking-tight">
                SentryVibe
              </h1>
              <p className="text-xl text-gray-400 font-light">What would you like to create?</p>
            </div>

            {/* Main Input - Centered */}
            <form onSubmit={handleSubmit} className="relative max-w-2xl mx-auto">
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg shadow-2xl overflow-hidden hover:border-white/20 transition-all duration-300">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your message..."
                  className="w-full px-6 py-5 bg-transparent text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white/20 text-lg font-light"
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-3 rounded-md bg-white text-black hover:bg-gray-200 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed transition-all duration-200"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Chat View - Animated transition */}
      {messages.length > 0 && (
        <div className="flex-1 flex flex-col animate-in fade-in duration-700">
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto p-6 space-y-6">
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-4 duration-500`}>
                  <div className={`max-w-[85%] rounded-lg p-4 shadow-lg ${message.role === 'user' ? 'bg-white text-black' : 'bg-white/5 border border-white/10 text-white'}`}>
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
                                  <pre className="bg-black text-white p-4 rounded-lg overflow-x-auto border border-white/10">
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
                                  <a href={href} className="text-gray-300 underline hover:text-white" target="_blank" rel="noopener noreferrer">
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
                          <div key={i} className="mt-2 p-3 bg-black/40 rounded-lg border border-white/10">
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
                          <div key={i} className="mt-2 p-3 bg-black/40 rounded-lg border border-white/10">
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
                          <div key={i} className="mt-2 p-3 bg-black/40 rounded-lg border border-white/10">
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
            </div>
          </div>

          {/* Fixed Bottom Input */}
          <div className="border-t border-white/10 bg-black/50 backdrop-blur-sm p-4">
            <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
              <div className="relative bg-white/5 border border-white/10 rounded-lg overflow-hidden hover:border-white/20 transition-all duration-300">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Continue the conversation..."
                  className="w-full px-6 py-4 bg-transparent text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white/20 font-light"
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-3 rounded-md bg-white text-black hover:bg-gray-200 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed transition-all duration-200"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
