"use client";

import { useState, useEffect } from "react";
import { Plug, ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CodeBlock } from "../CodeBlock";
import { useRunner } from "@/contexts/RunnerContext";

interface ConnectStepProps {
  runnerKey: string;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export function ConnectStep({ runnerKey, onNext, onBack, onSkip }: ConnectStepProps) {
  const { availableRunners } = useRunner();
  const [includeRunnerId, setIncludeRunnerId] = useState(false);
  const [runnerId, setRunnerId] = useState("");
  const [hasConnected, setHasConnected] = useState(false);

  // Build the command based on options
  const baseCommand = `sentryvibe runner --secret ${runnerKey}`;
  const commandWithId = runnerId.trim() 
    ? `${baseCommand} --id ${runnerId.trim()}`
    : baseCommand;
  const displayCommand = includeRunnerId ? commandWithId : baseCommand;

  // Watch for runner connection
  useEffect(() => {
    if (availableRunners.length > 0 && !hasConnected) {
      setHasConnected(true);
      // Auto-advance after brief delay to show success state
      setTimeout(() => {
        onNext();
      }, 1500);
    }
  }, [availableRunners, hasConnected, onNext]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-purple-500/10 rounded-lg">
          <Plug className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Connect Your Runner</h3>
          <p className="text-sm text-zinc-400">Start the runner with your key</p>
        </div>
      </div>

      {/* Main command */}
      <div className="space-y-3">
        <CodeBlock code={displayCommand} />
        
        {/* Runner ID option */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeRunnerId}
              onChange={(e) => setIncludeRunnerId(e.target.checked)}
              className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-purple-500 focus:ring-purple-500 focus:ring-offset-0"
            />
            <span className="text-sm text-zinc-400">Include runner ID (optional)</span>
          </label>
          
          {includeRunnerId && (
            <Input
              type="text"
              placeholder="e.g., my-macbook"
              value={runnerId}
              onChange={(e) => setRunnerId(e.target.value)}
              className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500"
            />
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-zinc-800"></div>
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="px-2 bg-zinc-950 text-zinc-500">or use interactive mode</span>
        </div>
      </div>

      {/* Alternative: Interactive TUI */}
      <div className="space-y-2">
        <CodeBlock code="sentryvibe" />
        <p className="text-xs text-zinc-500">
          Then select <span className="text-zinc-300">&quot;Runner mode&quot;</span> and paste your key when prompted.
        </p>
      </div>

      {/* Connection status */}
      <div className={`p-3 rounded-lg border transition-colors ${
        hasConnected 
          ? "bg-green-500/10 border-green-500/30" 
          : "bg-zinc-900/50 border-zinc-800"
      }`}>
        <div className="flex items-center gap-2">
          {hasConnected ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-green-400" />
              <span className="text-sm text-green-400 font-medium">
                Runner connected!
              </span>
            </>
          ) : (
            <>
              <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />
              <span className="text-sm text-zinc-400">
                Waiting for runner to connect...
              </span>
            </>
          )}
        </div>
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
          variant="ghost"
          size="sm"
          onClick={onSkip}
          className="text-zinc-500 hover:text-zinc-300"
        >
          Skip for now
        </Button>
      </div>
    </div>
  );
}
