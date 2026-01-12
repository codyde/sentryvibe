'use client';

import { useState } from 'react';
import { 
  Github, 
  ExternalLink, 
  GitBranch, 
  Clock, 
  AlertCircle, 
  GitCommit,
  Upload,
  RefreshCw,
  Settings,
  Unlink,
  Loader2,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GitHubStatus } from '@sentryvibe/agent-core';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import { usePushToGitHub, useSyncGitHub, useUpdateGitHubSettings, useDisconnectGitHub } from '@/mutations/github';
import { useToast } from '@/components/ui/toast';

interface GitHubDropdownProps {
  projectId: string;
  status: GitHubStatus;
  className?: string;
  variant?: 'default' | 'compact';
}

/**
 * Dropdown menu showing GitHub repo info and actions
 */
export function GitHubDropdown({
  projectId,
  status,
  className,
  variant = 'default',
}: GitHubDropdownProps) {
  const { addToast } = useToast();
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  
  const pushMutation = usePushToGitHub(projectId);
  const syncMutation = useSyncGitHub(projectId);
  const settingsMutation = useUpdateGitHubSettings(projectId);
  const disconnectMutation = useDisconnectGitHub(projectId);

  const handlePush = async () => {
    try {
      await pushMutation.mutateAsync();
      addToast({
        title: 'Push initiated',
        description: 'Your changes are being pushed to GitHub.',
        type: 'success',
      });
    } catch (error) {
      addToast({
        title: 'Push failed',
        description: error instanceof Error ? error.message : 'Failed to push to GitHub',
        type: 'error',
      });
    }
  };

  const handleSync = async () => {
    try {
      await syncMutation.mutateAsync();
      addToast({
        title: 'Sync initiated',
        description: 'Fetching latest repository info.',
        type: 'success',
      });
    } catch (error) {
      addToast({
        title: 'Sync failed',
        description: error instanceof Error ? error.message : 'Failed to sync',
        type: 'error',
      });
    }
  };

  const handleToggleAutoPush = async () => {
    try {
      await settingsMutation.mutateAsync({ autoPush: !status.autoPush });
      addToast({
        title: status.autoPush ? 'Auto-push disabled' : 'Auto-push enabled',
        description: status.autoPush 
          ? 'Changes will no longer be pushed automatically after builds.'
          : 'Changes will be automatically pushed after successful builds.',
        type: 'success',
      });
    } catch (error) {
      addToast({
        title: 'Failed to update settings',
        description: error instanceof Error ? error.message : 'Unknown error',
        type: 'error',
      });
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectMutation.mutateAsync();
      addToast({
        title: 'GitHub disconnected',
        description: 'GitHub integration has been removed from this project.',
        type: 'success',
      });
      setShowDisconnectConfirm(false);
    } catch (error) {
      addToast({
        title: 'Disconnect failed',
        description: error instanceof Error ? error.message : 'Failed to disconnect',
        type: 'error',
      });
    }
  };

  const formatRelativeTime = (date: Date | string | null) => {
    if (!date) return 'Never';
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  };

  const repoName = status.repo?.split('/')[1] || status.repo || 'Unknown';
  const isLoading = pushMutation.isPending || syncMutation.isPending || 
                    settingsMutation.isPending || disconnectMutation.isPending;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 text-xs rounded-md transition-all',
            'bg-green-900/30 hover:bg-green-900/50 border border-green-700/50 hover:border-green-600',
            'text-green-400 hover:text-green-300',
            className
          )}
        >
          <Github className="w-3.5 h-3.5" />
          {variant === 'default' && (
            <span className="truncate max-w-[100px]">{repoName}</span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent 
        className="w-72 bg-gray-900 border-gray-700" 
        align="end"
        sideOffset={8}
      >
        {/* Repository Header */}
        <div className="px-3 py-2 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Github className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-white truncate">
              {status.repo}
            </span>
          </div>
          {status.url && (
            <a
              href={status.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 mt-1 text-xs text-blue-400 hover:text-blue-300"
            >
              <ExternalLink className="w-3 h-3" />
              Open on GitHub
            </a>
          )}
        </div>

        {/* Repository Info */}
        <div className="px-3 py-2 space-y-1.5 text-xs border-b border-gray-700">
          <div className="flex items-center gap-2 text-gray-400">
            <GitBranch className="w-3 h-3" />
            <span>Branch: <span className="text-gray-300">{status.branch || 'main'}</span></span>
          </div>
          <div className="flex items-center gap-2 text-gray-400">
            <Clock className="w-3 h-3" />
            <span>Last push: <span className="text-gray-300">{formatRelativeTime(status.lastPushedAt)}</span></span>
          </div>
          {status.meta?.openIssuesCount !== undefined && (
            <div className="flex items-center gap-2 text-gray-400">
              <AlertCircle className="w-3 h-3" />
              <span>Open issues: <span className="text-gray-300">{status.meta.openIssuesCount}</span></span>
            </div>
          )}
        </div>

        {/* Recent Commits */}
        {status.meta?.recentCommits && status.meta.recentCommits.length > 0 && (
          <div className="px-3 py-2 border-b border-gray-700">
            <DropdownMenuLabel className="px-0 py-1 text-xs text-gray-500">
              Recent Commits
            </DropdownMenuLabel>
            <div className="space-y-1">
              {status.meta.recentCommits.slice(0, 3).map((commit) => (
                <div key={commit.sha} className="flex items-start gap-2 text-xs">
                  <GitCommit className="w-3 h-3 text-gray-500 mt-0.5 shrink-0" />
                  <span className="text-gray-400 truncate">{commit.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="py-1">
          <DropdownMenuItem
            onClick={handlePush}
            disabled={isLoading}
            className="text-white hover:bg-gray-800 cursor-pointer"
          >
            {pushMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            ) : (
              <Upload className="w-4 h-4 text-gray-400" />
            )}
            <span>Push Changes</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={handleSync}
            disabled={isLoading}
            className="text-white hover:bg-gray-800 cursor-pointer"
          >
            {syncMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            ) : (
              <RefreshCw className="w-4 h-4 text-gray-400" />
            )}
            <span>Refresh Info</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator className="bg-gray-700" />

          {/* Auto-push Toggle */}
          <DropdownMenuCheckboxItem
            checked={status.autoPush}
            onCheckedChange={handleToggleAutoPush}
            disabled={settingsMutation.isPending}
            className="text-white hover:bg-gray-800"
          >
            <span>Auto-push after builds</span>
          </DropdownMenuCheckboxItem>

          <DropdownMenuSeparator className="bg-gray-700" />

          {/* Disconnect */}
          {showDisconnectConfirm ? (
            <div className="px-2 py-2 space-y-2">
              <p className="text-xs text-gray-400">
                Are you sure? This won&apos;t delete the GitHub repository.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleDisconnect}
                  disabled={disconnectMutation.isPending}
                  className="flex-1 px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded"
                >
                  {disconnectMutation.isPending ? 'Disconnecting...' : 'Confirm'}
                </button>
                <button
                  onClick={() => setShowDisconnectConfirm(false)}
                  className="flex-1 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <DropdownMenuItem
              onClick={() => setShowDisconnectConfirm(true)}
              className="text-red-400 hover:bg-red-900/20 cursor-pointer"
            >
              <Unlink className="w-4 h-4" />
              <span>Disconnect GitHub</span>
            </DropdownMenuItem>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
