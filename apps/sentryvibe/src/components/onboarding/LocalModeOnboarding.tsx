"use client";

import { CheckCircle2, ArrowRight, Zap, Shield, Home } from "lucide-react";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface LocalModeOnboardingProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

export function LocalModeOnboarding({ open, onOpenChange, onComplete }: LocalModeOnboardingProps) {
  const handleComplete = async () => {
    try {
      await fetch("/api/user/onboarding", { method: "POST" });
    } catch (error) {
      console.error("Failed to mark onboarding complete:", error);
    }
    onComplete();
    onOpenChange(false);
  };

  const features = [
    {
      icon: <CheckCircle2 className="w-5 h-5" />,
      title: "Runner is built-in",
      description: "No additional setup or installation required",
      color: "text-green-400",
      bgColor: "bg-green-500/20",
    },
    {
      icon: <Shield className="w-5 h-5" />,
      title: "Uses your local credentials",
      description: "Connects to AI APIs via your environment variables",
      color: "text-blue-400",
      bgColor: "bg-blue-500/20",
    },
    {
      icon: <Zap className="w-5 h-5" />,
      title: "Everything stays local",
      description: "Your code and API keys never leave your machine",
      color: "text-purple-400",
      bgColor: "bg-purple-500/20",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-zinc-950 border-zinc-800 p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950">
          <div className="flex items-center justify-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
              className="w-16 h-16 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center"
            >
              <Home className="w-8 h-8 text-white" />
            </motion.div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Hero */}
          <motion.div 
            className="text-center space-y-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <h2 className="text-2xl font-bold text-white">
              Welcome to SentryVibe
            </h2>
            <p className="text-zinc-400">
              You&apos;re running in local mode - everything is ready to go!
            </p>
          </motion.div>

          {/* Status badge */}
          <motion.div 
            className="flex items-center justify-center gap-2 py-2 px-4 bg-green-500/10 border border-green-500/30 rounded-full mx-auto w-fit"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-sm text-green-400 font-medium">Local Mode Active</span>
          </motion.div>

          {/* Features */}
          <div className="space-y-3">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                className="flex items-start gap-3 p-3 rounded-lg bg-zinc-900/50 border border-zinc-800"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
              >
                <div className={`shrink-0 w-10 h-10 rounded-lg ${feature.bgColor} flex items-center justify-center ${feature.color}`}>
                  {feature.icon}
                </div>
                <div>
                  <h3 className="text-sm font-medium text-white">{feature.title}</h3>
                  <p className="text-xs text-zinc-500">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* API keys note */}
          <motion.div 
            className="p-4 rounded-lg bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <p className="text-sm text-amber-200">
              <span className="font-semibold">Note:</span> Make sure your AI API keys are configured in your environment 
              (<code className="px-1 py-0.5 bg-black/30 rounded text-amber-300">ANTHROPIC_API_KEY</code> or{" "}
              <code className="px-1 py-0.5 bg-black/30 rounded text-amber-300">OPENAI_API_KEY</code>)
            </p>
          </motion.div>

          {/* Action */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
          >
            <Button
              type="button"
              onClick={handleComplete}
              className="w-full h-12 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white text-base font-medium"
            >
              Start Building
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </motion.div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
