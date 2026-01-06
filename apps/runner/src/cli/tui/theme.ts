/**
 * Theme and color definitions for the TUI
 */

export const colors = {
  // Primary brand colors
  cyan: '#06b6d4',
  purple: '#a855f7',
  brightPurple: '#c084fc',
  
  // Status colors
  success: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
  
  // Neutral colors
  white: '#ffffff',
  gray: '#6b7280',
  dimGray: '#4b5563',
  darkGray: '#374151',
};

export const symbols = {
  // Progress indicators
  filledDot: '●',
  hollowDot: '○',
  errorDot: '✗',
  
  // Task states
  check: '✓',
  cross: '✗',
  
  // Connectors
  horizontalLine: '─',
  treeConnector: '└─',
  
  // Spinners (will cycle through these)
  spinnerFrames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
};

export const layout = {
  // Animation timing (slower as requested)
  spinnerInterval: 120, // ms between spinner frames
  taskCompletionDelay: 400, // ms to pause after task completion
  stepTransitionDelay: 300, // ms between step transitions
};
