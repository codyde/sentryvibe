"use client";

import { useState } from "react";
import { Key, ArrowRight, ArrowLeft, Loader2, AlertCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CodeBlock } from "../CodeBlock";

interface CreateKeyStepProps {
  onNext: (key: string) => void;
  onBack: () => void;
}

export function CreateKeyStep({ onNext, onBack }: CreateKeyStepProps) {
  const [keyName, setKeyName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [hasCopied, setHasCopied] = useState(false);

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) return;

    setIsCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/runner-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: keyName.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create key");
      }

      const data = await res.json();
      setCreatedKey(data.key);
    } catch (err) {
      console.error("Error creating key:", err);
      setError(err instanceof Error ? err.message : "Failed to create key");
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopyAndNext = async () => {
    if (!createdKey) return;
    
    try {
      await navigator.clipboard.writeText(createdKey);
      setHasCopied(true);
      // Brief delay to show the copied feedback
      setTimeout(() => {
        onNext(createdKey);
      }, 300);
    } catch (err) {
      console.error("Failed to copy:", err);
      // Still proceed even if copy fails
      onNext(createdKey);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-purple-500/10 rounded-lg">
          <Key className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Create a Runner Key</h3>
          <p className="text-sm text-zinc-400">Generate a key to authenticate your runner</p>
        </div>
      </div>

      {!createdKey ? (
        <>
          {/* Create key form */}
          <form onSubmit={handleCreateKey} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="keyName" className="text-sm font-medium text-zinc-300">
                Key name
              </label>
              <Input
                id="keyName"
                type="text"
                placeholder="e.g., My MacBook Pro"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500"
                disabled={isCreating}
              />
              <p className="text-xs text-zinc-500">
                A friendly name to identify this runner in the dashboard
              </p>
            </div>

            {/* Error message */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              disabled={isCreating || !keyName.trim()}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating key...
                </>
              ) : (
                <>
                  <Key className="w-4 h-4 mr-2" />
                  Create Key
                </>
              )}
            </Button>
          </form>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="text-zinc-500 hover:text-zinc-300"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </div>
        </>
      ) : (
        <>
          {/* Key created success */}
          <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg space-y-3">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-400" />
              <span className="text-sm font-medium text-green-400">
                Key created successfully!
              </span>
            </div>
            <CodeBlock code={createdKey} />
            <p className="text-xs text-amber-400/90 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Copy this key now - it won&apos;t be shown again!
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="text-zinc-500 hover:text-zinc-300"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <Button
              type="button"
              onClick={handleCopyAndNext}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
            >
              {hasCopied ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  I&apos;ve copied it
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
