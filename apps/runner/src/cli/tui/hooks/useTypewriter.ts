import { useState, useEffect, useRef } from 'react';

export interface UseTypewriterOptions {
  /** Speed in ms per character */
  speed?: number;
  /** Delay before starting to type */
  delay?: number;
  /** Callback when typing completes */
  onComplete?: () => void;
}

export interface UseTypewriterReturn {
  /** The currently displayed text */
  displayText: string;
  /** Whether typing is in progress */
  isTyping: boolean;
  /** Whether typing has completed */
  isComplete: boolean;
  /** Show blinking cursor */
  showCursor: boolean;
}

/**
 * Hook that creates a typewriter effect for text
 * Returns progressively longer substring until complete
 */
export function useTypewriter(
  text: string,
  options: UseTypewriterOptions = {}
): UseTypewriterReturn {
  const { speed = 20, delay = 0, onComplete } = options;
  
  const [displayText, setDisplayText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [showCursor, setShowCursor] = useState(true);
  
  const currentIndexRef = useRef(0);
  const previousTextRef = useRef(text);
  
  // Reset when text changes
  useEffect(() => {
    if (text !== previousTextRef.current) {
      currentIndexRef.current = 0;
      setDisplayText('');
      setIsComplete(false);
      setIsTyping(false);
      previousTextRef.current = text;
    }
  }, [text]);
  
  // Typewriter effect
  useEffect(() => {
    if (!text) {
      setIsComplete(true);
      return;
    }
    
    // Initial delay
    const delayTimeout = setTimeout(() => {
      setIsTyping(true);
      
      const typeInterval = setInterval(() => {
        if (currentIndexRef.current < text.length) {
          currentIndexRef.current += 1;
          setDisplayText(text.slice(0, currentIndexRef.current));
        } else {
          clearInterval(typeInterval);
          setIsTyping(false);
          setIsComplete(true);
          onComplete?.();
        }
      }, speed);
      
      return () => clearInterval(typeInterval);
    }, delay);
    
    return () => clearTimeout(delayTimeout);
  }, [text, speed, delay, onComplete]);
  
  // Blinking cursor
  useEffect(() => {
    if (isComplete) {
      // Hide cursor after completion
      const timeout = setTimeout(() => setShowCursor(false), 500);
      return () => clearTimeout(timeout);
    }
    
    // Blink while typing
    const blinkInterval = setInterval(() => {
      setShowCursor(prev => !prev);
    }, 400);
    
    return () => clearInterval(blinkInterval);
  }, [isComplete]);
  
  return {
    displayText,
    isTyping,
    isComplete,
    showCursor: !isComplete && showCursor,
  };
}

/**
 * Hook for animating connector lines: ├── or └──
 * Animates: ├ → ├─ → ├──
 */
export function useAnimatedConnector(
  isLast: boolean,
  options: { speed?: number; delay?: number } = {}
): string {
  const { speed = 50, delay = 0 } = options;
  const [stage, setStage] = useState(0);
  
  const connector = isLast ? '└' : '├';
  const stages = [connector, `${connector}─`, `${connector}──`];
  
  useEffect(() => {
    setStage(0);
    
    const delayTimeout = setTimeout(() => {
      const interval = setInterval(() => {
        setStage(prev => {
          if (prev >= stages.length - 1) {
            clearInterval(interval);
            return prev;
          }
          return prev + 1;
        });
      }, speed);
      
      return () => clearInterval(interval);
    }, delay);
    
    return () => clearTimeout(delayTimeout);
  }, [isLast, speed, delay]);
  
  return stages[stage] || stages[stages.length - 1];
}
