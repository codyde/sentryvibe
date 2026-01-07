"use client";

import { Home, CheckCircle2, ArrowRight, Key } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface LocalModeOnboardingProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

export function LocalModeOnboarding({ open, onOpenChange, onComplete }: LocalModeOnboardingProps) {
  const handleComplete = async () => {
    // Mark onboarding as complete (will be no-op in local mode but keeps consistency)
    try {
      await fetch("/api/user/onboarding", { method: "POST" });
    } catch (error) {
      console.error("Failed to mark onboarding complete:", error);
    }
    onComplete();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-zinc-950 border-zinc-800">
        <DialogHeader>
          <DialogTitle className="text-xl text-white">
            Welcome to SentryVibe
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4 space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <Home className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Running in Local Mode</h3>
              <p className="text-sm text-zinc-400">The runner is built-in and ready to go</p>
            </div>
          </div>

          {/* Features list */}
          <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg space-y-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-zinc-200">
                  Integrated runner ready
                </p>
                <p className="text-xs text-zinc-500">
                  No additional setup or configuration needed
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-zinc-200">
                  Uses your local AI credentials
                </p>
                <p className="text-xs text-zinc-500">
                  Connects to Claude, GPT, and other AI APIs via your environment
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-zinc-200">
                  Everything stays on your machine
                </p>
                <p className="text-xs text-zinc-500">
                  Your code and API keys never leave your local environment
                </p>
              </div>
            </div>
          </div>

          {/* API keys note */}
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <div className="flex items-start gap-2">
              <Key className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm text-amber-200">
                  Make sure your AI API keys are configured
                </p>
                <p className="text-xs text-amber-400/70 mt-1">
                  Set <code className="px-1 py-0.5 bg-black/30 rounded">ANTHROPIC_API_KEY</code> for Claude
                  or <code className="px-1 py-0.5 bg-black/30 rounded">OPENAI_API_KEY</code> for GPT models
                </p>
              </div>
            </div>
          </div>

          {/* Action */}
          <div className="pt-2">
            <Button
              type="button"
              onClick={handleComplete}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
            >
              Start Building
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
