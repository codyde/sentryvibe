"use client";

import { motion } from "framer-motion";
import { ChevronRight, Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { useSidebar } from "@/components/ui/sidebar";

export function MenuIndicator() {
  const [shouldPulse, setShouldPulse] = useState(false);
  const { toggleSidebar, open } = useSidebar();

  useEffect(() => {
    // Pulse every 5 seconds when sidebar is closed
    if (open) return;

    const interval = setInterval(() => {
      setShouldPulse(true);
      // Reset after animation completes
      setTimeout(() => setShouldPulse(false), 1000);
    }, 5000);

    return () => clearInterval(interval);
  }, [open]);

  // Hide indicator when sidebar is open
  if (open) return null;

  return (
    <motion.div
      className="fixed left-0 z-50"
      style={{ top: "calc(50% - 60px)" }}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
    >
      <button
        onClick={toggleSidebar}
        className="pointer-events-auto cursor-pointer transition-transform duration-200 origin-left hover:scale-105"
        aria-label="Open mission control menu"
      >
        <motion.div
          className="relative origin-left"
          animate={
            shouldPulse
              ? {
                  scaleX: [1, 1.15, 1],
                  scaleY: [1, 1.05, 1],
                  opacity: [0.7, 1, 0.7],
                }
              : { scaleX: 1, scaleY: 1, opacity: 0.85 }
          }
          transition={{
            duration: 1,
            ease: "easeInOut",
          }}
          style={{ transformOrigin: "left center" }}
        >
          <motion.div
            className="absolute inset-0 bg-purple-500/30 blur-lg"
            animate={
              shouldPulse
                ? {
                    scaleX: [1, 1.4, 1],
                    scaleY: [1, 1.1, 1],
                    opacity: [0.3, 0.6, 0.3],
                  }
                : {}
            }
            transition={{
              duration: 1,
              ease: "easeInOut",
            }}
            style={{ transformOrigin: "left center" }}
          />
          <div className="relative flex items-center gap-1 px-1.5 py-2 rounded-r-lg bg-linear-to-r from-purple-900/50 to-pink-900/40 border-r border-t border-b border-purple-500/30">
            <Menu className="w-3.5 h-3.5 text-purple-400" />
          </div>
        </motion.div>
      </button>
    </motion.div>
  );
}
