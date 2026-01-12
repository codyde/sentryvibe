'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Github, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGitHubStatus } from '@/queries/github';
import { GitHubDropdown } from './GitHubDropdown';
import { GITHUB_CHAT_MESSAGES } from '@sentryvibe/agent-core';

interface GitHubButtonProps {
  projectId: string;
  projectSlug: string;
  onSetupClick?: () => void;
  className?: string;
  variant?: 'default' | 'compact';
}

/**
 * GitHub integration button that shows either:
 * - "Setup GitHub" button when not connected (triggers chat flow)
 * - GitHub dropdown with repo info when connected
 */
export function GitHubButton({
  projectId,
  projectSlug,
  onSetupClick,
  className,
  variant = 'default',
}: GitHubButtonProps) {
  const { data: status, isLoading } = useGitHubStatus(projectId);
  const [isSettingUp, setIsSettingUp] = useState(false);

  const handleSetupClick = () => {
    setIsSettingUp(true);
    // Call the parent handler which will send the chat message
    onSetupClick?.();
    // Reset after a delay (the actual setup happens via chat)
    setTimeout(() => setIsSettingUp(false), 2000);
  };

  if (isLoading) {
    return (
      <div className={cn(
        'flex items-center gap-2 px-3 py-1.5 text-xs text-gray-400',
        className
      )}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {variant === 'default' && <span>Loading...</span>}
      </div>
    );
  }

  // If connected, show the dropdown
  if (status?.isConnected) {
    return (
      <GitHubDropdown
        projectId={projectId}
        status={status}
        className={className}
        variant={variant}
      />
    );
  }

  // Not connected - show setup button
  return (
    <motion.button
      onClick={handleSetupClick}
      disabled={isSettingUp}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 text-xs rounded-md transition-all',
        'bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600',
        'text-gray-300 hover:text-white',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
    >
      {isSettingUp ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Github className="w-3.5 h-3.5" />
      )}
      {variant === 'default' && (
        <span>{isSettingUp ? 'Setting up...' : 'Setup GitHub'}</span>
      )}
    </motion.button>
  );
}

/**
 * Get the chat message to trigger GitHub setup
 */
export function getGitHubSetupMessage(): string {
  return GITHUB_CHAT_MESSAGES.SETUP;
}
