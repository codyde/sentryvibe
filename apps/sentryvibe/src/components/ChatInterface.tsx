'use client';

import { useLiveQuery, eq } from '@tanstack/react-db';
import { messageCollection, uiStateCollection, type Message } from '@/collections';
import ChatUpdate from './ChatUpdate';
import { useEffect, useState } from 'react';

interface ChatInterfaceProps {
  currentProjectId: string | undefined;
  messages_LEGACY: Message[];
  isLoadingProject: boolean;
  isGenerating: boolean;
  generationState: any;
  messagesEndRef: React.RefObject<HTMLDivElement>;
}

/**
 * ChatInterface - Client-Only Component
 *
 * This component uses TanStack DB collections and useLiveQuery,
 * which require client-side rendering only (no SSR).
 *
 * Imported with dynamic(() => import(), { ssr: false }) to avoid
 * Next.js pre-rendering issues with useSyncExternalStore.
 */
export function ChatInterface({
  currentProjectId,
  messages_LEGACY,
  isLoadingProject,
  isGenerating,
  generationState,
  messagesEndRef,
}: ChatInterfaceProps) {
  // Client-only hydration pattern
  // Start as true since this component only loads client-side (ssr: false)
  const [isDBHydrated, setIsDBHydrated] = useState(true);

  // TanStack DB Live Query for messages
  const { data: messagesFromDB } = useLiveQuery(
    (q) => {
      try {
        if (!isDBHydrated || !messageCollection || !currentProjectId) {
          return null;
        }

        return q
          .from({ message: messageCollection })
          .where(({ message }) => eq(message.projectId, currentProjectId))
          .orderBy(({ message }) => message.timestamp, 'asc');
      } catch (error) {
        console.error('❌ [ChatInterface] Query error:', error);
        return null;
      }
    },
    [isDBHydrated, currentProjectId]
  );

  // Hybrid display: Use legacy during active generation (live updates)
  // Use TanStack DB after generation complete (persisted messages)
  const messages = messagesFromDB && messagesFromDB.length > 0 ? messagesFromDB : messages_LEGACY;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      {messages.map((message, index) => {
        // Skip if no message or no content
        if (!message || !message.content) {
          return null;
        }

        const isUser = message.type === "user";
        const isSystem = message.type === "system";
        const isToolCall = message.type === "tool-call";
        const isToolResult = message.type === "tool-result";

        // Skip tool calls, system messages, and tool results (shown in BuildProgress)
        if (isToolCall || isSystem || isToolResult) {
          return null;
        }

        // Skip empty content
        if (message.content.trim().length === 0) {
          return null;
        }

        return (
          <div
            key={message.id || index}
            className={`flex ${isUser ? "justify-end" : "justify-start"} animate-in fade-in duration-500`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-4 ${
                isUser
                  ? "bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30"
                  : "bg-white/5 border border-white/10"
              }`}
            >
              <ChatUpdate
                content={message.content}
                defaultCollapsed={false}
              />
            </div>
          </div>
        );
      })}

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

      <div ref={messagesEndRef} />
    </div>
  );
}
