"use client";

import { Terminal, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "../CodeBlock";

interface InstallStepProps {
  onNext: () => void;
  onSkip: () => void;
}

export function InstallStep({ onNext, onSkip }: InstallStepProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-purple-500/10 rounded-lg">
          <Terminal className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Install the SentryVibe CLI</h3>
          <p className="text-sm text-zinc-400">Run this command in your terminal</p>
        </div>
      </div>

      {/* Install command */}
      <div className="space-y-3">
        <CodeBlock code="curl -fsSL https://sentryvibe.app/install | bash" />
        <p className="text-xs text-zinc-500">
          This installs the <code className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-300">sentryvibe</code> CLI 
          which runs builds locally on your machine using your AI subscriptions.
        </p>
      </div>

      {/* Requirements note */}
      <div className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg">
        <p className="text-xs text-zinc-400">
          <span className="font-medium text-zinc-300">Requirements:</span> Node.js 18+ and npm/pnpm installed on your system.
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onSkip}
          className="text-zinc-500 hover:text-zinc-300"
        >
          Skip for now
        </Button>
        <Button
          type="button"
          onClick={onNext}
          className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
        >
          I&apos;ve installed it
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
