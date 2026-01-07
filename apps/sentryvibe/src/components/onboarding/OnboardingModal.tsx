"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRunner } from "@/contexts/RunnerContext";
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
  useEffect(() => {
    if (!forceStartAtStepOne && availableRunners.length > 0 && currentStep < 4 && hasInitialized) {
      setCurrentStep(4);
    }
  }, [availableRunners, currentStep, forceStartAtStepOne, hasInitialized]);

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

  const handleSkip = () => {
    onOpenChange(false);
  };

  const handleComplete = async () => {
    // Mark onboarding as complete
    try {
      await fetch("/api/user/onboarding", { method: "POST" });
    } catch (error) {
      console.error("Failed to mark onboarding complete:", error);
    }
    // Reset state on successful completion
    setCurrentStep(1);
    setCreatedKey(null);
    onComplete();
    onOpenChange(false);
  };

  const stepTitles: Record<Step, string> = {
    1: "Install the CLI",
    2: "Create a Key",
    3: "Connect Runner",
    4: "Ready to Build",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-zinc-950 border-zinc-800">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl text-white">
              {stepTitles[currentStep]}
            </DialogTitle>
            <div className="flex items-center gap-1">
              {([1, 2, 3, 4] as Step[]).map((step) => (
                <div
                  key={step}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    step === currentStep
                      ? "bg-purple-500"
                      : step < currentStep
                      ? "bg-purple-500/50"
                      : "bg-zinc-700"
                  }`}
                />
              ))}
            </div>
          </div>
        </DialogHeader>

        <div className="mt-4">
          {currentStep === 1 && (
            <InstallStep
              onNext={() => setCurrentStep(2)}
              onSkip={handleSkip}
            />
          )}

          {currentStep === 2 && (
            <CreateKeyStep
              onNext={(key) => {
                setCreatedKey(key);
                setCurrentStep(3);
              }}
              onBack={() => setCurrentStep(1)}
            />
          )}

          {currentStep === 3 && (
            <ConnectStep
              runnerKey={createdKey || "<your-key>"}
              onNext={() => setCurrentStep(4)}
              onBack={() => setCurrentStep(2)}
              onSkip={handleSkip}
            />
          )}

          {currentStep === 4 && (
            <CompleteStep 
              onComplete={handleComplete} 
              onBack={forceStartAtStepOne ? () => setCurrentStep(3) : undefined}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
