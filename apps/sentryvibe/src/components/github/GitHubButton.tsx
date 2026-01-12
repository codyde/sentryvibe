'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Github, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGitHubStatus } from '@/queries/github';
import { GitHubDropdown } from './GitHubDropdown';

// GitHub chat messages - defined here to avoid importing server-side code from agent-core
// The message includes structured output instructions so the frontend can parse the result
const GITHUB_SETUP_MESSAGE = `Set up GitHub repository for this project.

Instructions:
1. Check if gh CLI is installed: \`gh --version\`
2. Check if authenticated: \`gh auth status\`
3. Initialize git if needed: \`git init\`
4. Create initial commit if no commits: \`git add . && git commit -m "Initial commit from SentryVibe"\`
5. Create GitHub repo and push: \`gh repo create {project-name} --public --source=. --remote=origin --push\`
6. Get repo info: \`gh repo view --json url,name,owner\`

CRITICAL: At the end of your response, output the result in this exact format on a single line:
GITHUB_RESULT:{"success":true,"repo":"owner/repo-name","url":"https://github.com/owner/repo-name","branch":"main","action":"setup"}

If there's an error, output:
GITHUB_RESULT:{"success":false,"action":"error","error":"description of what went wrong"}`;

interface GitHubButtonProps {
  projectId: string;
  projectSlug: string;
  onSetupClick?: () => void;
  className?: string;
  variant?: 'default' | 'compact';
  /** Whether a generation/build is currently running */
  isGenerating?: boolean;
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
  isGenerating = false,
}: GitHubButtonProps) {
  const { data: status, isLoading, refetch } = useGitHubStatus(projectId);
  const [isSettingUp, setIsSettingUp] = useState(false);

  // Track if we were generating and now stopped - trigger a refetch
  const wasGeneratingRef = useRef(isGenerating);
  useEffect(() => {
    if (wasGeneratingRef.current && !isGenerating) {
      // Generation just completed - refetch GitHub status
      refetch();
    }
    wasGeneratingRef.current = isGenerating;
  }, [isGenerating, refetch]);

  const handleSetupClick = () => {
    setIsSettingUp(true);
    // Call the parent handler which will send the chat message
    onSetupClick?.();
  };

  // Reset isSettingUp when generation completes
  useEffect(() => {
    if (!isGenerating && isSettingUp) {
      setIsSettingUp(false);
    }
  }, [isGenerating, isSettingUp]);

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

  // Show running state during generation or setup
  const isRunning = isSettingUp || isGenerating;

  // Not connected - show setup button
  return (
    <motion.button
      onClick={handleSetupClick}
      disabled={isRunning}
      whileHover={isRunning ? {} : { scale: 1.02 }}
      whileTap={isRunning ? {} : { scale: 0.98 }}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 text-xs rounded-md transition-all',
        isRunning 
          ? 'bg-purple-900/30 border border-purple-700/50 text-purple-400'
          : 'bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 text-gray-300 hover:text-white',
        'disabled:cursor-not-allowed',
        className
      )}
    >
      {isRunning ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Github className="w-3.5 h-3.5" />
      )}
      {variant === 'default' && (
        <span>{isRunning ? 'Setting up...' : 'Setup GitHub'}</span>
      )}
    </motion.button>
  );
}

/**
 * Get the chat message to trigger GitHub setup
 */
export function getGitHubSetupMessage(): string {
  return GITHUB_SETUP_MESSAGE;
}
