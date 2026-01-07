import { useState, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import { colors, symbols, layout } from '../theme.js';

export interface StreamTask {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  detail?: string;
  error?: string;
}

interface TaskStreamProps {
  /** Current step ID - clears stream when this changes */
  stepId: string;
  /** Tasks for the current step */
  tasks: StreamTask[];
  /** Called when typewriter animation completes for a detail */
  onTypewriterComplete?: (taskId: string) => void;
}

interface DisplayLine {
  id: string;
  text: string;
  displayedText: string;
  color: string;
  prefix: string;
  prefixColor: string;
  showCursor: boolean;
  checkmark?: boolean; // Show green checkmark after prefix
}

// Match the stepper width: cellWidth(10) * 4 + connectorWidth(7) * 3 = 61
const BOX_WIDTH = 61;
const BOX_INNER_WIDTH = BOX_WIDTH - 4; // Account for "│ " and " │"

/**
 * TaskStream - Shows current step's tasks in a terminal-style box
 * 
 * ┌───────────────────────────────────────────────────────────┐
 * │ ⠋ Configuring database                                    │
 * │   └── Setting up Neon database...▌                        │
 * └───────────────────────────────────────────────────────────┘
 */
export function TaskStream({ stepId, tasks, onTypewriterComplete }: TaskStreamProps) {
  const [spinnerIndex, setSpinnerIndex] = useState(0);
  const [cursorVisible, setCursorVisible] = useState(true);
  const [typedChars, setTypedChars] = useState<Record<string, number>>({});
  const [completedTyping, setCompletedTyping] = useState<Set<string>>(new Set());
  const prevStepRef = useRef(stepId);
  
  // Reset typed chars when step changes
  useEffect(() => {
    if (stepId !== prevStepRef.current) {
      setTypedChars({});
      setCompletedTyping(new Set());
      prevStepRef.current = stepId;
    }
  }, [stepId]);
  
  // Spinner animation - runs independently
  useEffect(() => {
    let mounted = true;
    const animate = () => {
      if (!mounted) return;
      setSpinnerIndex(prev => (prev + 1) % symbols.spinnerFrames.length);
      setTimeout(animate, layout.spinnerInterval);
    };
    const timeout = setTimeout(animate, layout.spinnerInterval);
    return () => {
      mounted = false;
      clearTimeout(timeout);
    };
  }, []);
  
  // Cursor blink - runs independently  
  useEffect(() => {
    let mounted = true;
    const blink = () => {
      if (!mounted) return;
      setCursorVisible(prev => !prev);
      setTimeout(blink, 400);
    };
    const timeout = setTimeout(blink, 400);
    return () => {
      mounted = false;
      clearTimeout(timeout);
    };
  }, []);
  
  // Find tasks by status
  const runningTask = tasks.find(t => t.status === 'running');
  const failedTask = tasks.find(t => t.status === 'failed');
  const completedTasks = tasks.filter(t => t.status === 'completed');
  
  // Primary task: running > failed > last completed (to prevent visual jump)
  const primaryTask = runningTask || failedTask || completedTasks[completedTasks.length - 1];
  
  // Previous completed tasks (all except the one shown as primary)
  const previousCompleted = primaryTask?.status === 'completed' 
    ? completedTasks.slice(0, -1) 
    : completedTasks;
  
  // Build display lines
  const lines: DisplayLine[] = [];
  
  // Main task line (running, failed, or last completed)
  if (primaryTask) {
    const isRunning = primaryTask.status === 'running';
    const isCompleted = primaryTask.status === 'completed';
    const isFailed = primaryTask.status === 'failed';
    
    let prefix: string;
    let prefixColor: string;
    let textColor: string;
    
    if (isRunning) {
      prefix = `${symbols.spinnerFrames[spinnerIndex]} `;
      prefixColor = colors.cyan;
      textColor = colors.white;
    } else if (isCompleted) {
      prefix = `${symbols.check} `;
      prefixColor = colors.success;
      textColor = colors.white;
    } else {
      prefix = `${symbols.cross} `;
      prefixColor = colors.error;
      textColor = colors.error;
    }
    
    lines.push({
      id: `main-${primaryTask.id}`,
      text: primaryTask.label,
      displayedText: primaryTask.label,
      color: textColor,
      prefix,
      prefixColor,
      showCursor: false,
    });
  }
  
  // Previous completed tasks as subtasks - with green checkmark
  previousCompleted.forEach((task, index) => {
    const hasMore = primaryTask?.detail || primaryTask?.error || index < previousCompleted.length - 1;
    const connector = hasMore ? '├──' : '└──';
    
    lines.push({
      id: `completed-${task.id}`,
      text: task.label,
      displayedText: task.label,
      color: colors.white,
      prefix: `  ${connector} `,
      prefixColor: colors.dimGray,
      showCursor: false,
      checkmark: true,
    });
  });
  
  // Detail line (no typewriter for progress updates - show immediately)
  if (primaryTask?.detail && primaryTask.status === 'running') {
    lines.push({
      id: `detail-${primaryTask.id}`,
      text: primaryTask.detail,
      displayedText: primaryTask.detail, // Show full text immediately for progress updates
      color: colors.dimGray,
      prefix: '  └── ',
      prefixColor: colors.dimGray,
      showCursor: false, // No cursor for instant updates
    });
  }
  
  // Error line (typewriter effect)
  if (primaryTask?.error && primaryTask.status === 'failed') {
    const errorId = `error-${primaryTask.id}`;
    const currentChars = typedChars[errorId] || 0;
    const displayedText = primaryTask.error.slice(0, currentChars);
    const isTyping = currentChars < primaryTask.error.length;
    
    lines.push({
      id: errorId,
      text: primaryTask.error,
      displayedText,
      color: colors.error,
      prefix: '  └── ',
      prefixColor: colors.dimGray,
      showCursor: isTyping && cursorVisible,
    });
  }
  
  // Typewriter animation - only for errors now (details show instantly for progress)
  const errorToType = primaryTask?.error && primaryTask.status === 'failed' ? primaryTask.error : null;
  const textToType = errorToType;
  const typeId = errorToType ? `error-${primaryTask?.id}` : null;
  
  useEffect(() => {
    if (!typeId || !textToType) return;
    
    const currentChars = typedChars[typeId] || 0;
    
    // Check if we just finished typing
    if (currentChars >= textToType.length) {
      // Fire callback once when typing completes
      if (!completedTyping.has(typeId) && onTypewriterComplete && primaryTask) {
        setCompletedTyping(prev => new Set(prev).add(typeId));
        onTypewriterComplete(primaryTask.id);
      }
      return;
    }
    
    // Continue typing animation
    const timeout = setTimeout(() => {
      setTypedChars(prev => ({
        ...prev,
        [typeId]: (prev[typeId] || 0) + 1,
      }));
    }, 30);
    
    return () => clearTimeout(timeout);
  }, [typeId, textToType, typedChars[typeId || ''], completedTyping, onTypewriterComplete, primaryTask]);
  
  // Empty state - show empty box to maintain layout
  if (lines.length === 0) {
    return (
      <Box flexDirection="column" alignItems="center" marginTop={1}>
        <Box flexDirection="column" width={BOX_WIDTH}>
          <Text color={colors.dimGray}>┌{'─'.repeat(BOX_WIDTH - 2)}┐</Text>
          <Box>
            <Text color={colors.dimGray}>│</Text>
            <Text>{' '.repeat(BOX_WIDTH - 2)}</Text>
            <Text color={colors.dimGray}>│</Text>
          </Box>
          <Text color={colors.dimGray}>└{'─'.repeat(BOX_WIDTH - 2)}┘</Text>
        </Box>
      </Box>
    );
  }
  
  return (
    <Box flexDirection="column" alignItems="center" marginTop={1}>
      <Box flexDirection="column" width={BOX_WIDTH}>
        {/* Top border */}
        <Text color={colors.dimGray}>┌{'─'.repeat(BOX_WIDTH - 2)}┐</Text>
        
        {/* Content lines */}
        {lines.map(line => {
          const checkmarkStr = line.checkmark ? `${symbols.check} ` : '';
          const content = `${line.prefix}${checkmarkStr}${line.displayedText}`;
          const cursor = line.showCursor ? '▌' : '';
          const paddingNeeded = Math.max(0, BOX_INNER_WIDTH - content.length - cursor.length);
          
          return (
            <Box key={line.id}>
              <Text color={colors.dimGray}>│ </Text>
              <Text color={line.prefixColor}>{line.prefix}</Text>
              {line.checkmark && <Text color={colors.success}>{symbols.check} </Text>}
              <Text color={line.color}>{line.displayedText}</Text>
              {line.showCursor && <Text color={colors.cyan}>▌</Text>}
              <Text>{' '.repeat(paddingNeeded)}</Text>
              <Text color={colors.dimGray}> │</Text>
            </Box>
          );
        })}
        
        {/* Bottom border */}
        <Text color={colors.dimGray}>└{'─'.repeat(BOX_WIDTH - 2)}┘</Text>
      </Box>
    </Box>
  );
}
