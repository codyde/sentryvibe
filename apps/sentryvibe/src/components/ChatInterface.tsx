'use client';

import { useLiveQuery } from '@tanstack/react-db';
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
  const [isDBHydrated, setIsDBHydrated] = useState(false);

  useEffect(() => {
    setIsDBHydrated(true);

    // CRITICAL: Manually trigger QueryCollection fetch on mount
    // QueryCollection queryFn doesn't auto-run, needs explicit refetch
    if (messageCollection) {
      console.log('[ChatInterface] Triggering manual refetch of messages');
      messageCollection.utils.refetch().catch((err: Error) => {
        console.error('[ChatInterface] Failed to refetch messages:', err);
      });
    }
  }, []);

  // TanStack DB Live Query for messages
  // ALWAYS call hook (Rules of Hooks), return null when not ready
  const { data: messagesFromDB } = useLiveQuery(
    (q) => {
      // Guard against null/undefined at query execution time
      try {
        if (!isDBHydrated) {
          console.log('[ChatInterface] Query skipped - DB not hydrated');
          return null;
        }

        if (!messageCollection) {
          console.log('[ChatInterface] Query skipped - collection not initialized');
          return null;
        }

        if (!currentProjectId) {
          console.log('[ChatInterface] Query skipped - no projectId');
          return null;
        }

        console.log('[ChatInterface] Building query for projectId:', currentProjectId);

        // Double-check collection is still valid before building query
        if (!messageCollection || typeof messageCollection.getAll !== 'function') {
          console.log('[ChatInterface] Collection invalid at query build time');
          return null;
        }

        return q
          .from({ message: messageCollection })
          .where(({ message }) => message.projectId === currentProjectId)
          .orderBy(({ message }) => message.timestamp);
      } catch (error) {
        console.error('[ChatInterface] Error building query:', error);
        return null;
      }
    },
    [isDBHydrated, currentProjectId]
  );

  // Use TanStack DB if available, fallback to legacy
  const messages =
    messagesFromDB && messagesFromDB.length > 0 ? messagesFromDB : messages_LEGACY;

  // Debug logging - detailed
  useEffect(() => {
    console.log('[ChatInterface] Messages updated:', {
      fromDB: messagesFromDB?.length || 0,
      fromLegacy: messages_LEGACY.length,
      using: messagesFromDB?.length > 0 ? 'TanStack DB' : 'Legacy',
      total: messages.length,
      projectId: currentProjectId,
      collectionInitialized: !!messageCollection,
      isDBHydrated,
    });

    if (messagesFromDB && messagesFromDB.length > 0) {
      console.log('[ChatInterface] Messages from DB:', messagesFromDB.map(m => ({
        id: m.id.substring(0, 8),
        type: m.type,
        contentPreview: m.content.substring(0, 50),
      })));
    }
  }, [messagesFromDB, messages_LEGACY, messages, currentProjectId, isDBHydrated]);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      {messages.map((message, index) => {
        const isUser = message.type === "user";
        const isSystem = message.type === "system";
        const isToolCall = message.type === "tool-call";

        // Skip tool calls and system messages for now (can render differently later)
        if (isToolCall || isSystem) {
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
