"use client";

import { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { useRunner } from "@/contexts/RunnerContext";
import { StepProgress } from "./StepProgress";
import { InstallStep } from "./steps/InstallStep";
import { CreateKeyStep } from "./steps/CreateKeyStep";
import { ConnectStep } from "./steps/ConnectStep";
import { CompleteStep } from "./steps/CompleteStep";

type Step = 1 | 2 | 3 | 4;

interface OnboardingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
  /** Force start at step 1, ignoring runner connection status (for testing) */
  forceStartAtStepOne?: boolean;
}

export function OnboardingModal({ open, onOpenChange, onComplete, forceStartAtStepOne = false }: OnboardingModalProps) {
  const { availableRunners } = useRunner();
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);

  // If a runner connects while modal is open, jump to complete step
  // But not if we're forcing step one (testing mode)
  // Use availableRunners.length instead of availableRunners to avoid re-running
  // when heartbeat polling updates the runner objects' lastHeartbeat timestamps
  useEffect(() => {
    if (!forceStartAtStepOne && availableRunners.length > 0 && currentStep < 4 && hasInitialized) {
      setCurrentStep(4);
    }
  }, [availableRunners.length, currentStep, forceStartAtStepOne, hasInitialized]);

  // Initialize state when modal first opens
  // Preserve createdKey and currentStep when modal is closed and reopened
  // so users don't lose progress if they accidentally close the modal
  useEffect(() => {
    if (open && !hasInitialized) {
      // If forcing step one (testing), always start at 1 and reset key
      if (forceStartAtStepOne) {
        setCurrentStep(1);
        setCreatedKey(null);
      } else if (createdKey) {
        // User has a key from previous session - resume where they left off
        // Don't reset their progress
      } else if (availableRunners.length > 0) {
        // If runners are already connected and no existing progress, start at complete
        setCurrentStep(4);
      } else {
        // Fresh start
        setCurrentStep(1);
      }
      setHasInitialized(true);
    } else if (!open) {
      // Only reset initialization flag when modal closes
      // Keep createdKey and currentStep so user can resume
      setHasInitialized(false);
    }
  }, [open, availableRunners.length, forceStartAtStepOne, hasInitialized, createdKey]);

  const handleSkip = async () => {
    // Mark onboarding as complete even when skipping, so it doesn't show again
    try {
      const response = await fetch("/api/user/onboarding", { method: "POST" });
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
      onComplete();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to mark onboarding complete on skip:", error);
      // Don't close modal if API call failed - keeps UI in sync with database
      // User can try again or complete the onboarding flow
    }
  };

  const handleComplete = async () => {
    // Mark onboarding as complete
    try {
      const response = await fetch("/api/user/onboarding", { method: "POST" });
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
      // Reset state on successful completion
      setCurrentStep(1);
      setCreatedKey(null);
      onComplete();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to mark onboarding complete:", error);
      // Don't update client state if server update failed
      // This keeps UI in sync with database
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl bg-zinc-950 border-zinc-800 p-0 gap-0 overflow-hidden">
        {/* Header with progress */}
        <div className="p-6 pb-4 border-b border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950">
          <h2 className="text-lg font-semibold text-white mb-4">Get Started</h2>
          <StepProgress currentStep={currentStep} />
        </div>

        {/* Content */}
        <div className="p-6 min-h-[400px]">
          <AnimatePresence mode="wait">
            {currentStep === 1 && (
              <InstallStep
                key="install"
                onNext={() => setCurrentStep(2)}
                onSkip={handleSkip}
              />
            )}

            {currentStep === 2 && (
              <CreateKeyStep
                key="create-key"
                onNext={(key) => {
                  setCreatedKey(key);
                  setCurrentStep(3);
                }}
                onBack={() => setCurrentStep(1)}
              />
            )}

            {currentStep === 3 && (
              <ConnectStep
                key="connect"
                runnerKey={createdKey || "<your-key>"}
                onNext={() => setCurrentStep(4)}
                onBack={() => setCurrentStep(2)}
                onSkip={handleSkip}
              />
            )}

            {currentStep === 4 && (
              <CompleteStep 
                key="complete"
                onComplete={handleComplete} 
                onBack={forceStartAtStepOne ? () => setCurrentStep(3) : undefined}
              />
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
