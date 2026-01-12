/**
 * Utility to extract meaningful error messages from build output
 * Works with TypeScript, Next.js, Turbo, and other common build tools
 */

// Patterns that indicate error lines
const ERROR_PATTERNS = [
  /error TS\d+:/i,           // TypeScript errors
  /error:/i,                  // General errors
  /Error:/,                   // Error messages (case sensitive for JS errors)
  /ERR!/,                     // npm/pnpm errors
  /failed/i,                  // Failed messages
  /Cannot find/i,             // Module not found
  /Module not found/i,        // Webpack/Next.js errors
  /SyntaxError/i,             // Syntax errors
  /TypeError/i,               // Type errors
  /ReferenceError/i,          // Reference errors
  /ENOENT/i,                  // File not found
  /EACCES/i,                  // Permission errors
  /✖|✗|×/,                   // Error symbols
  /Type '.+' is not assignable/i,  // TypeScript type errors
  /Property '.+' does not exist/i, // TypeScript property errors
  /has no exported member/i,  // Export errors
  /Unexpected token/i,        // Parse errors
];

// Patterns that indicate we should stop collecting (success or unrelated output)
const STOP_PATTERNS = [
  /successfully/i,
  /completed/i,
  /✓|✔/,                      // Success symbols
  /Build succeeded/i,
];

/**
 * Extract the most relevant error lines from build output
 * @param output Combined stdout and stderr from build process
 * @param maxLines Maximum number of lines to return (default: 15)
 * @returns Array of relevant error lines
 */
export function extractBuildErrors(output: string, maxLines: number = 15): string[] {
  if (!output || !output.trim()) {
    return [];
  }

  const allLines = output.trim().split('\n');
  const relevantLines: string[] = [];
  let inErrorBlock = false;
  let emptyLineCount = 0;

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    const trimmedLine = line.trim();
    
    // Check if this line matches an error pattern
    const isErrorLine = ERROR_PATTERNS.some(pattern => pattern.test(line));
    
    // Check if we should stop collecting
    const shouldStop = STOP_PATTERNS.some(pattern => pattern.test(line));
    
    if (shouldStop && inErrorBlock) {
      // Don't stop immediately - there might be more errors after a success message
      inErrorBlock = false;
      emptyLineCount = 0;
      continue;
    }

    if (isErrorLine) {
      inErrorBlock = true;
      emptyLineCount = 0;
      
      // Include 1-2 lines before for context if we're starting a new error block
      if (relevantLines.length === 0 || !relevantLines[relevantLines.length - 1]) {
        // Add file path context if the previous line looks like a file reference
        if (i > 0) {
          const prevLine = allLines[i - 1].trim();
          // File paths often contain '/' or '\' and end with line numbers like :10:5
          if (prevLine && (prevLine.includes('/') || prevLine.includes('\\') || /:\d+:\d+/.test(prevLine))) {
            if (!relevantLines.includes(prevLine)) {
              relevantLines.push(prevLine);
            }
          }
        }
      }
    }

    if (inErrorBlock) {
      // Track empty lines - stop after 2 consecutive empty lines
      if (trimmedLine === '') {
        emptyLineCount++;
        if (emptyLineCount >= 2) {
          inErrorBlock = false;
          emptyLineCount = 0;
          continue;
        }
      } else {
        emptyLineCount = 0;
      }

      // Don't add duplicate lines
      if (!relevantLines.includes(trimmedLine) || trimmedLine === '') {
        relevantLines.push(trimmedLine);
      }

      // Stop if we've collected enough
      if (relevantLines.length >= maxLines) {
        break;
      }
    }
  }

  // If we didn't find specific error patterns, fall back to last N lines
  if (relevantLines.length === 0) {
    return allLines
      .slice(-10)
      .map(line => line.trim())
      .filter(line => line.length > 0);
  }

  // Clean up: remove trailing empty lines
  while (relevantLines.length > 0 && relevantLines[relevantLines.length - 1] === '') {
    relevantLines.pop();
  }

  // Truncate very long lines but keep enough context
  return relevantLines.map(line => {
    if (line.length > 150) {
      return line.substring(0, 147) + '...';
    }
    return line;
  });
}

/**
 * Format extracted errors for display
 * @param errors Array of error lines
 * @param indent Indentation string (default: '  ')
 * @returns Formatted string ready for console output
 */
export function formatBuildErrors(errors: string[], indent: string = '  '): string {
  if (errors.length === 0) {
    return '';
  }

  const separator = '─'.repeat(60);
  const lines = [
    'Build errors:',
    separator,
    ...errors.map(line => `${indent}${line}`),
    separator,
    '',
  ];

  return lines.join('\n');
}
