"use client";

import { Sparkles, CheckCircle2, ArrowRight, Server, Cloud, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRunner } from "@/contexts/RunnerContext";

interface CompleteStepProps {
  onComplete: () => void;
}

export function CompleteStep({ onComplete }: CompleteStepProps) {
  const { availableRunners } = useRunner();
  const connectedRunner = availableRunners[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-green-500/10 rounded-lg">
          <Sparkles className="w-5 h-5 text-green-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">You&apos;re all set!</h3>
          <p className="text-sm text-zinc-400">Your runner is connected and ready</p>
        </div>
      </div>

      {/* Connected runner info */}
      {connectedRunner && (
        <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <span className="text-sm text-green-400 font-medium">
              Runner &quot;{connectedRunner.runnerId}&quot; connected
            </span>
          </div>
        </div>
      )}

      {/* Architecture diagram */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-zinc-300">How it works:</p>
        <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg">
          <div className="flex items-center justify-between gap-4">
            {/* SentryVibe */}
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="p-3 bg-purple-500/10 rounded-lg">
                <Cloud className="w-6 h-6 text-purple-400" />
              </div>
              <span className="text-xs text-zinc-400">SentryVibe</span>
              <span className="text-[10px] text-zinc-600">(this app)</span>
            </div>

            {/* Connection arrow */}
            <div className="flex-1 flex items-center justify-center">
              <div className="flex items-center gap-1 text-zinc-600">
                <div className="h-px w-full bg-gradient-to-r from-purple-500/50 to-pink-500/50"></div>
                <span className="text-[10px] whitespace-nowrap px-2">WebSocket</span>
                <div className="h-px w-full bg-gradient-to-r from-pink-500/50 to-purple-500/50"></div>
              </div>
            </div>

            {/* Runner */}
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="p-3 bg-green-500/10 rounded-lg">
                <Server className="w-6 h-6 text-green-400" />
              </div>
              <span className="text-xs text-zinc-400">Your Runner</span>
              <span className="text-[10px] text-zinc-600">(local machine)</span>
            </div>

            {/* Arrow down */}
            <div className="flex items-center text-zinc-600">
              <ArrowRight className="w-4 h-4 rotate-90" />
            </div>

            {/* AI APIs */}
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="p-3 bg-blue-500/10 rounded-lg">
                <Cpu className="w-6 h-6 text-blue-400" />
              </div>
              <span className="text-xs text-zinc-400">AI APIs</span>
              <span className="text-[10px] text-zinc-600">(Claude, GPT)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Key points */}
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-zinc-500 mt-0.5 shrink-0" />
          <p className="text-sm text-zinc-400">
            The runner executes builds using <span className="text-zinc-300">your AI subscriptions</span>
          </p>
        </div>
        <div className="flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-zinc-500 mt-0.5 shrink-0" />
          <p className="text-sm text-zinc-400">
            Your code and API keys <span className="text-zinc-300">never leave your machine</span>
          </p>
        </div>
      </div>

      {/* Action */}
      <div className="pt-2">
        <Button
          type="button"
          onClick={onComplete}
          className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
        >
          Start Building
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
