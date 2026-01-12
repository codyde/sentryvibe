"use client";

import { useEffect, useState } from "react";
import { Sparkles, CheckCircle2, ArrowRight, ArrowLeft, Zap, Shield, Rocket } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useRunner } from "@/contexts/RunnerContext";

interface CompleteStepProps {
  onComplete: () => void;
  onBack?: () => void;
}

// Confetti particle component
function Confetti() {
  const [particles] = useState(() => 
    Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 0.5,
      duration: 1 + Math.random() * 2,
      color: ['#a855f7', '#ec4899', '#22c55e', '#3b82f6', '#f59e0b'][Math.floor(Math.random() * 5)],
    }))
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute w-2 h-2 rounded-full"
          style={{ 
            left: `${p.x}%`, 
            backgroundColor: p.color,
            top: -10,
          }}
          initial={{ y: 0, opacity: 1, scale: 1 }}
          animate={{ 
            y: 400, 
            opacity: 0, 
            scale: 0,
            rotate: Math.random() * 360,
          }}
          transition={{ 
            duration: p.duration, 
            delay: p.delay,
            ease: "easeOut",
          }}
        />
      ))}
    </div>
  );
}

export function CompleteStep({ onComplete, onBack }: CompleteStepProps) {
  const { availableRunners } = useRunner();
  const connectedRunner = availableRunners[0];
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  const features = [
    {
      icon: <Zap className="w-5 h-5" />,
      title: "AI-Powered Builds",
      description: "Generate full-stack apps with natural language",
      color: "theme-gradient",
    },
    {
      icon: <Shield className="w-5 h-5" />,
      title: "Secure by Design",
      description: "Your code and API keys stay on your machine",
      color: "from-green-500 to-emerald-500",
    },
    {
      icon: <Rocket className="w-5 h-5" />,
      title: "Ship Faster",
      description: "From idea to deployed app in minutes",
      color: "from-blue-500 to-cyan-500",
    },
  ];

  return (
    <motion.div 
      className="space-y-6 relative"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
    >
      {showConfetti && <Confetti />}

      {/* Success animation */}
      <div className="flex flex-col items-center text-center space-y-4">
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
        >
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
              <Sparkles className="w-10 h-10 text-white" />
            </div>
            <motion.div
              className="absolute inset-0 rounded-full bg-green-500/30"
              initial={{ scale: 1 }}
              animate={{ scale: 1.5, opacity: 0 }}
              transition={{ duration: 1, repeat: 2 }}
            />
          </div>
        </motion.div>

        <div>
          <h2 className="text-2xl font-bold text-white">You&apos;re all set!</h2>
          {connectedRunner && (
            <motion.p 
              className="text-zinc-400 mt-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              Runner <span className="text-green-400 font-medium">&quot;{connectedRunner.runnerId}&quot;</span> is connected
            </motion.p>
          )}
        </div>
      </div>

      {/* Connected status */}
      <motion.div 
        className="flex items-center justify-center gap-2 py-2 px-4 bg-green-500/10 border border-green-500/30 rounded-full mx-auto w-fit"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <span className="text-sm text-green-400 font-medium">Connected & Ready</span>
      </motion.div>

      {/* Features */}
      <div className="grid gap-3">
        {features.map((feature, i) => (
          <motion.div
            key={feature.title}
            className="flex items-start gap-3 p-3 rounded-lg bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-colors"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + i * 0.1 }}
          >
            <div className={`shrink-0 w-10 h-10 rounded-lg ${feature.color === "theme-gradient" ? "bg-theme-gradient" : `bg-gradient-to-br ${feature.color}`} flex items-center justify-center text-white`}>
              {feature.icon}
            </div>
            <div>
              <h3 className="text-sm font-medium text-white">{feature.title}</h3>
              <p className="text-xs text-zinc-500">{feature.description}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Quick tip */}
      <motion.div 
        className="p-4 rounded-lg bg-theme-gradient-muted border-theme-primary/20"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
      >
        <p className="text-sm text-zinc-300">
          <span className="font-semibold text-theme-primary">Quick tip:</span> Try describing your app idea in the chat. 
          Be specific about features, tech stack, and design preferences!
        </p>
      </motion.div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        {onBack && (
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
        )}
        <Button
          type="button"
          onClick={onComplete}
          className={`bg-theme-gradient hover:opacity-90 text-white px-8 h-12 text-base font-medium ${!onBack ? 'w-full' : ''}`}
        >
          Start Building
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
      </div>
    </motion.div>
  );
}
