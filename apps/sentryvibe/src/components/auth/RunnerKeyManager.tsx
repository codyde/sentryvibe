"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  Clock,
} from "lucide-react";

interface RunnerKey {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

interface RunnerKeyManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RunnerKeyManager({ open, onOpenChange }: RunnerKeyManagerProps) {
  const { isAuthenticated, isLocalMode } = useAuth();
  const [keys, setKeys] = useState<RunnerKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [deletingKeyId, setDeletingKeyId] = useState<string | null>(null);

  // Fetch keys on mount
  useEffect(() => {
    if (open && isAuthenticated && !isLocalMode) {
      fetchKeys();
    }
  }, [open, isAuthenticated, isLocalMode]);

  const fetchKeys = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/runner-keys");
      if (!res.ok) {
        throw new Error("Failed to fetch runner keys");
      }
      const data = await res.json();
      setKeys(data.keys || []);
    } catch (err) {
      console.error("Error fetching keys:", err);
      setError("Failed to load runner keys");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    setIsCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/runner-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create key");
      }

      const data = await res.json();
      setNewlyCreatedKey(data.key); // Full key shown only once
      setNewKeyName("");
      await fetchKeys(); // Refresh list
    } catch (err) {
      console.error("Error creating key:", err);
      setError(err instanceof Error ? err.message : "Failed to create key");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    setDeletingKeyId(keyId);
    setError(null);
    try {
      const res = await fetch(`/api/runner-keys/${keyId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to revoke key");
      }

      await fetchKeys(); // Refresh list
    } catch (err) {
      console.error("Error deleting key:", err);
      setError("Failed to revoke key");
    } finally {
      setDeletingKeyId(null);
    }
  };

  const handleCopyKey = async (key: string, keyId?: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedKeyId(keyId || "new");
      setTimeout(() => setCopiedKeyId(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Local mode - show info message
  if (isLocalMode) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md bg-zinc-950 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-xl text-white">Runner Keys</DialogTitle>
          </DialogHeader>
          <div className="py-6 text-center">
            <Key className="w-12 h-12 mx-auto mb-4 text-zinc-600" />
            <p className="text-zinc-400">
              Runner keys are not needed in local mode.
            </p>
            <p className="text-sm text-zinc-500 mt-2">
              When running locally, the runner connects directly without authentication.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-zinc-950 border-zinc-800">
        <DialogHeader>
          <DialogTitle className="text-xl text-white">Runner Keys</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Create keys to authenticate your runners. Each key is shown only once when created.
          </DialogDescription>
        </DialogHeader>

        {/* New key display */}
        {newlyCreatedKey && (
          <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Check className="w-4 h-4 text-green-400" />
              <span className="text-sm font-medium text-green-400">
                Key created! Copy it now - it won&apos;t be shown again.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-black/40 rounded font-mono text-sm text-white overflow-x-auto">
                {newlyCreatedKey}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleCopyKey(newlyCreatedKey)}
                className="shrink-0"
              >
                {copiedKeyId === "new" ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setNewlyCreatedKey(null)}
              className="mt-2 text-zinc-500 hover:text-zinc-300"
            >
              I&apos;ve copied the key
            </Button>
          </div>
        )}

        {/* Create new key form */}
        <form onSubmit={handleCreateKey} className="flex gap-2">
          <Input
            placeholder="Key name (e.g., My MacBook)"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            className="flex-1 bg-zinc-900 border-zinc-800 text-white"
          />
          <Button
            type="submit"
            disabled={isCreating || !newKeyName.trim()}
            className="shrink-0 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
          >
            {isCreating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
          </Button>
        </form>

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Keys list */}
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
            </div>
          ) : keys.length === 0 ? (
            <div className="py-8 text-center">
              <Key className="w-10 h-10 mx-auto mb-3 text-zinc-700" />
              <p className="text-sm text-zinc-500">No runner keys yet</p>
              <p className="text-xs text-zinc-600 mt-1">
                Create a key to connect your runner
              </p>
            </div>
          ) : (
            keys.map((key) => (
              <div
                key={key.id}
                className="flex items-center justify-between p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-zinc-500" />
                    <span className="text-sm font-medium text-white truncate">
                      {key.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <code className="text-xs text-zinc-500 font-mono">
                      {key.keyPrefix}
                    </code>
                    <span className="flex items-center gap-1 text-xs text-zinc-600">
                      <Clock className="w-3 h-3" />
                      {key.lastUsedAt ? `Used ${formatDate(key.lastUsedAt)}` : "Never used"}
                    </span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDeleteKey(key.id)}
                  disabled={deletingKeyId === key.id}
                  className="text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                >
                  {deletingKeyId === key.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </Button>
              </div>
            ))
          )}
        </div>

        {/* Usage instructions */}
        <div className="pt-4 border-t border-zinc-800">
          <p className="text-xs text-zinc-500">
            Use your key when starting the runner:
          </p>
          <code className="block mt-1 px-2 py-1 bg-zinc-900 rounded text-xs text-zinc-400 font-mono">
            RUNNER_KEY=sv_xxx sentryvibe run
          </code>
        </div>
      </DialogContent>
    </Dialog>
  );
}
