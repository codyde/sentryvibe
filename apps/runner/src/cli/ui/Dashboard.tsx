/**
 * Main TUI Dashboard Component for Local Mode
 * Redesigned to match Runner Mode UI style with split panel layout
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import { ServiceManager, ServiceState } from './service-manager.js';
import { Banner } from './components/Banner.js';

// Import shared theme from tui (for consistency)
const colors = {
  cyan: '#06b6d4',
  purple: '#a855f7',
  success: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
  white: '#ffffff',
  gray: '#6b7280',
  dimGray: '#4b5563',
  darkGray: '#374151',
};

const symbols = {
  filledDot: '●',
  hollowDot: '○',
  check: '✓',
  cross: '✗',
  spinnerFrames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
};

interface DashboardProps {
  serviceManager: ServiceManager;
  apiUrl: string;
  webPort: number;
  logFilePath: string | null;
}

type ViewMode = 'dashboard' | 'help' | 'fullLog';
type FilterMode = 'all' | 'errors' | 'tools' | 'verbose';

interface LogEntry {
  id: string;
  timestamp: Date;
  service: string;
  message: string;
  stream: 'stdout' | 'stderr';
  level: 'info' | 'success' | 'warn' | 'error';
  // Parsed fields for improved display
  tag?: string;        // e.g., [build-route], [build-events]
  emoji?: string;      // e.g., ✅, 📜, 📤, 🔧, 📡
  toolName?: string;   // e.g., Glob, Read, Edit
  content?: string;    // The actual message content after parsing
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { 
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getLogLevel(message: string, stream: 'stdout' | 'stderr'): 'info' | 'success' | 'warn' | 'error' {
  if (stream === 'stderr') return 'warn';
  const lower = message.toLowerCase();
  if (lower.includes('error') || lower.includes('failed') || lower.includes('exception')) return 'error';
  if (lower.includes('warn') || lower.includes('warning')) return 'warn';
  if (lower.includes('success') || lower.includes('ready') || lower.includes('started') || lower.includes('connected') || lower.includes('✅') || lower.includes('✓')) return 'success';
  return 'info';
}

// Parse log message to extract structured info (tags, emojis, tool names)
function parseLogMessage(message: string): { tag?: string; emoji?: string; toolName?: string; content: string } {
  let tag: string | undefined;
  let emoji: string | undefined;
  let toolName: string | undefined;
  let content = message;

  // Extract tag like [build-route], [build-events], etc.
  const tagMatch = content.match(/^\[([^\]]+)\]\s*/);
  if (tagMatch) {
    tag = tagMatch[1];
    content = content.substring(tagMatch[0].length);
  }

  // Extract leading emoji
  const emojiMatch = content.match(/^([\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|✅|✓|📜|📤|🔧|📡|⚠️|❌)\s*/u);
  if (emojiMatch) {
    emoji = emojiMatch[1];
    content = content.substring(emojiMatch[0].length);
  }

  // Check for tool calls (e.g., "tool-input-available: Glob")
  const toolMatch = content.match(/^tool-input-available:\s*(\w+)/i);
  if (toolMatch) {
    toolName = toolMatch[1];
    emoji = '🔧';
  }

  return { tag, emoji, toolName, content: content.trim() };
}

export function Dashboard({ serviceManager, apiUrl, webPort, logFilePath }: DashboardProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [view, setView] = useState<ViewMode>('dashboard');
  const [services, setServices] = useState<ServiceState[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [serviceFilter, setServiceFilter] = useState<string | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isVerbose, setIsVerbose] = useState(false);
  const [logIdCounter, setLogIdCounter] = useState(0);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  // Full log view state
  const [fullLogSearchMode, setFullLogSearchMode] = useState(false);
  const [fullLogSearchQuery, setFullLogSearchQuery] = useState('');
  const [fullLogScrollOffset, setFullLogScrollOffset] = useState(0);

  // Terminal dimensions
  const terminalHeight = stdout?.rows || 40;
  const terminalWidth = stdout?.columns || 80;
  
  // Layout calculations (matching Runner Mode)
  const bannerHeight = 7;
  const headerHeight = 3;
  const statusBarHeight = 3;
  const contentHeight = Math.max(1, terminalHeight - bannerHeight - headerHeight - statusBarHeight);
  
  // 20/80 split for panels
  const servicesPanelWidth = Math.floor(terminalWidth * 0.2);
  const logPanelWidth = terminalWidth - servicesPanelWidth;

  // Check if all services are running
  const allServicesRunning = useMemo(() => {
    return services.length > 0 && services.every(s => s.status === 'running');
  }, [services]);

  // Update service states on changes
  useEffect(() => {
    const handleStatusChange = () => {
      setServices(serviceManager.getAllStates());
    };
    setServices(serviceManager.getAllStates());
    serviceManager.on('service:status-change', handleStatusChange);
    return () => {
      serviceManager.off('service:status-change', handleStatusChange);
    };
  }, [serviceManager]);

  // Listen to service output events
  useEffect(() => {
    const handleServiceOutput = (name: string, output: string, stream: 'stdout' | 'stderr') => {
      const lines = output.split('\n').filter(line => line.trim());
      
      setLogIdCounter(prev => {
        const newLogs: LogEntry[] = lines.map((line, idx) => {
          const trimmed = line.trim();
          const parsed = parseLogMessage(trimmed);
          return {
            id: `${Date.now()}-${prev + idx}`,
            timestamp: new Date(),
            service: name,
            message: trimmed,
            stream,
            level: getLogLevel(trimmed, stream),
            tag: parsed.tag,
            emoji: parsed.emoji,
            toolName: parsed.toolName,
            content: parsed.content,
          };
        });
        
        if (newLogs.length > 0) {
          setLogs(prevLogs => {
            const combined = [...prevLogs, ...newLogs];
            return combined.slice(-10000);
          });
        }
        
        return prev + lines.length;
      });
    };

    serviceManager.on('service:output', handleServiceOutput);
    return () => {
      serviceManager.off('service:output', handleServiceOutput);
    };
  }, [serviceManager]);

  // Filter logs for main dashboard
  const filteredLogs = useMemo(() => {
    let filtered = logs;
    
    // Filter out verbose logs unless verbose mode is on
    if (!isVerbose) {
      filtered = filtered.filter(log => 
        !log.message.toLowerCase().includes('debug') &&
        !log.message.toLowerCase().includes('trace')
      );
    }
    
    if (serviceFilter) {
      filtered = filtered.filter(log => log.service === serviceFilter);
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(log =>
        log.message.toLowerCase().includes(query) ||
        log.service.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  }, [logs, serviceFilter, searchQuery, isVerbose]);

  // Filter logs for full log view
  const fullLogFilteredLogs = useMemo(() => {
    let filtered = logs;
    
    // Apply filter mode
    if (filterMode === 'errors') {
      filtered = filtered.filter(log => log.level === 'error' || log.level === 'warn');
    } else if (filterMode === 'tools') {
      filtered = filtered.filter(log => log.toolName || log.message.includes('tool-input'));
    } else if (filterMode !== 'verbose') {
      filtered = filtered.filter(log => 
        !log.message.toLowerCase().includes('debug') &&
        !log.message.toLowerCase().includes('trace')
      );
    }
    
    // Apply search
    if (fullLogSearchQuery.trim()) {
      const query = fullLogSearchQuery.toLowerCase();
      filtered = filtered.filter(log =>
        log.message.toLowerCase().includes(query) ||
        log.service.toLowerCase().includes(query) ||
        (log.tag && log.tag.toLowerCase().includes(query)) ||
        (log.toolName && log.toolName.toLowerCase().includes(query))
      );
    }
    
    return filtered;
  }, [logs, filterMode, fullLogSearchQuery]);

  // Visible lines calculation
  const visibleLines = Math.max(1, contentHeight - 3);
  const fullLogVisibleLines = Math.max(1, terminalHeight - 6);
  
  // Auto-scroll when new logs arrive (main dashboard)
  useEffect(() => {
    if (autoScroll && filteredLogs.length > 0) {
      const maxScroll = Math.max(0, filteredLogs.length - visibleLines);
      setScrollOffset(maxScroll);
    }
  }, [filteredLogs.length, autoScroll, visibleLines]);

  // Auto-scroll for full log view
  useEffect(() => {
    if (view === 'fullLog') {
      const maxScroll = Math.max(0, fullLogFilteredLogs.length - fullLogVisibleLines);
      setFullLogScrollOffset(maxScroll);
    }
  }, [fullLogFilteredLogs.length, view, fullLogVisibleLines]);

  // Get displayed logs
  const displayedLogs = useMemo(() => {
    return filteredLogs.slice(scrollOffset, scrollOffset + visibleLines);
  }, [filteredLogs, scrollOffset, visibleLines]);

  // Get displayed logs for full log view
  const fullLogDisplayedLogs = useMemo(() => {
    return fullLogFilteredLogs.slice(fullLogScrollOffset, fullLogScrollOffset + fullLogVisibleLines);
  }, [fullLogFilteredLogs, fullLogScrollOffset, fullLogVisibleLines]);

  // Keyboard shortcuts
  useInput((input, key) => {
    if (isShuttingDown) return;

    // Full log view mode
    if (view === 'fullLog') {
      if (fullLogSearchMode) {
        if (key.escape || key.return) {
          setFullLogSearchMode(false);
        }
        return;
      }

      if (key.escape) {
        setView('dashboard');
        return;
      }
      if (input === 'l' || input === 't') {
        setView('dashboard');
        return;
      }
      if (input === '/') {
        setFullLogSearchMode(true);
        return;
      }
      if (input === 'f') {
        // Cycle through filter modes
        const modes: FilterMode[] = ['all', 'errors', 'tools', 'verbose'];
        const currentIndex = modes.indexOf(filterMode);
        setFilterMode(modes[(currentIndex + 1) % modes.length]);
        setFullLogScrollOffset(0);
        return;
      }
      if (key.upArrow) {
        setFullLogScrollOffset(prev => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        const maxScroll = Math.max(0, fullLogFilteredLogs.length - fullLogVisibleLines);
        setFullLogScrollOffset(prev => Math.min(maxScroll, prev + 1));
        return;
      }
      if (key.pageUp) {
        setFullLogScrollOffset(prev => Math.max(0, prev - fullLogVisibleLines));
        return;
      }
      if (key.pageDown) {
        const maxScroll = Math.max(0, fullLogFilteredLogs.length - fullLogVisibleLines);
        setFullLogScrollOffset(prev => Math.min(maxScroll, prev + fullLogVisibleLines));
        return;
      }
      if (input === 'q') {
        setIsShuttingDown(true);
        serviceManager.stopAll().then(() => exit());
        return;
      }
      return;
    }

    // Dashboard mode
    if (key.escape) {
      if (searchMode) {
        setSearchMode(false);
        setSearchQuery('');
      } else if (view !== 'dashboard') {
        setView('dashboard');
      }
      return;
    }

    if (searchMode) return;

    if (input === '/' && view === 'dashboard') {
      setSearchMode(true);
      setSearchQuery('');
      return;
    }

    if (input === 'q' || (key.ctrl && input === 'c')) {
      setIsShuttingDown(true);
      serviceManager.stopAll().then(() => exit());
    } else if (input === 'v') {
      setIsVerbose(!isVerbose);
    } else if (input === 'r' && view === 'dashboard') {
      serviceManager.restartAll();
    } else if (input === 'c' && view === 'dashboard') {
      setLogs([]);
      setScrollOffset(0);
      setAutoScroll(true);
    } else if (input === 'l' || input === 't') {
      // Both 'l' and 't' switch to full log view
      setView('fullLog');
      setFullLogScrollOffset(Math.max(0, fullLogFilteredLogs.length - fullLogVisibleLines));
    } else if (input === 'f') {
      setServiceFilter(current => {
        if (!current) return 'web';
        if (current === 'web') return 'runner';
        return null;
      });
    } else if (key.upArrow) {
      setAutoScroll(false);
      setScrollOffset(prev => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      const maxScroll = Math.max(0, filteredLogs.length - visibleLines);
      setScrollOffset(prev => Math.min(maxScroll, prev + 1));
      if (scrollOffset >= maxScroll - 1) {
        setAutoScroll(true);
      }
    } else if (key.pageUp) {
      setAutoScroll(false);
      setScrollOffset(prev => Math.max(0, prev - visibleLines));
    } else if (key.pageDown) {
      const maxScroll = Math.max(0, filteredLogs.length - visibleLines);
      setScrollOffset(prev => Math.min(maxScroll, prev + visibleLines));
    } else if (input === '?') {
      setView('help');
    }
  });

  // Highlight search matches in text
  const highlightSearch = (text: string, query: string): React.ReactNode => {
    if (!query) return text;
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);
    if (index === -1) return text;
    
    return (
      <>
        {text.slice(0, index)}
        <Text backgroundColor={colors.warning} color="black">
          {text.slice(index, index + query.length)}
        </Text>
        {text.slice(index + query.length)}
      </>
    );
  };

  // Full log view
  if (view === 'fullLog') {
    const maxScroll = Math.max(0, fullLogFilteredLogs.length - fullLogVisibleLines);
    
    return (
      <Box flexDirection="column" height={terminalHeight}>
        {/* Header with search */}
        <Box
          borderStyle="single"
          borderColor={colors.darkGray}
          paddingX={1}
          justifyContent="space-between"
        >
          <Text color={colors.cyan} bold>LOGS</Text>
          <Box>
            <Text color={colors.dimGray}>Search: </Text>
            {fullLogSearchMode ? (
              <Box borderStyle="round" borderColor={colors.cyan} paddingX={1}>
                <TextInput
                  value={fullLogSearchQuery}
                  onChange={setFullLogSearchQuery}
                  placeholder="type to search..."
                />
              </Box>
            ) : (
              <Text color={fullLogSearchQuery ? colors.white : colors.dimGray}>
                [{fullLogSearchQuery || 'none'}]
              </Text>
            )}
            <Text color={colors.dimGray}> [/]</Text>
          </Box>
        </Box>

        {/* Log content */}
        <Box
          flexDirection="column"
          flexGrow={1}
          borderStyle="single"
          borderColor={colors.darkGray}
          borderTop={false}
          borderBottom={false}
          paddingX={1}
        >
          {fullLogDisplayedLogs.map((log) => (
            <FullLogEntryRow 
              key={log.id} 
              log={log} 
              maxWidth={terminalWidth - 4}
              searchQuery={fullLogSearchQuery}
              highlightSearch={highlightSearch}
            />
          ))}
        </Box>

        {/* Footer with shortcuts and scroll position */}
        <Box
          borderStyle="single"
          borderColor={colors.darkGray}
          paddingX={1}
          justifyContent="space-between"
        >
          <Box>
            <Shortcut letter="l" label="dashboard" />
            <Shortcut letter="/" label="search" />
            <Shortcut letter="f" label={`filter: ${filterMode}`} />
            <Shortcut letter="↑↓" label="scroll" />
            <Shortcut letter="q" label="quit" />
          </Box>
          <Text color={colors.dimGray}>
            {fullLogScrollOffset + 1}-{Math.min(fullLogScrollOffset + fullLogVisibleLines, fullLogFilteredLogs.length)}/{fullLogFilteredLogs.length}
          </Text>
        </Box>
      </Box>
    );
  }

  // Help view
  if (view === 'help') {
    return (
      <Box flexDirection="column" height={terminalHeight}>
        <Banner />
        <Box flexDirection="column" padding={2}>
          <Text color={colors.cyan} bold>Keyboard Shortcuts</Text>
          <Text> </Text>
          <Text color={colors.white} bold>Navigation:</Text>
          <Text color={colors.gray}>  <Text color={colors.cyan}>↑/↓</Text>      Scroll logs</Text>
          <Text color={colors.gray}>  <Text color={colors.cyan}>PgUp/PgDn</Text> Scroll by page</Text>
          <Text color={colors.gray}>  <Text color={colors.cyan}>/</Text>         Search logs</Text>
          <Text color={colors.gray}>  <Text color={colors.cyan}>f</Text>         Filter by service</Text>
          <Text> </Text>
          <Text color={colors.white} bold>Views:</Text>
          <Text color={colors.gray}>  <Text color={colors.cyan}>l</Text>         Full log view</Text>
          <Text color={colors.gray}>  <Text color={colors.cyan}>v</Text>         Toggle verbose mode</Text>
          <Text color={colors.gray}>  <Text color={colors.cyan}>?</Text>         Show this help</Text>
          <Text> </Text>
          <Text color={colors.white} bold>Actions:</Text>
          <Text color={colors.gray}>  <Text color={colors.cyan}>r</Text>         Restart services</Text>
          <Text color={colors.gray}>  <Text color={colors.cyan}>c</Text>         Clear logs</Text>
          <Text color={colors.gray}>  <Text color={colors.cyan}>q</Text>         Quit</Text>
          <Text> </Text>
          <Text color={colors.dimGray}>Press Esc to return</Text>
        </Box>
      </Box>
    );
  }

  // Main dashboard view (Runner Mode style)
  return (
    <Box flexDirection="column" height={terminalHeight} width={terminalWidth}>
      {/* Banner */}
      <Banner />

      {/* Header bar with service status */}
      <Box
        borderStyle="single"
        borderColor={colors.darkGray}
        paddingX={1}
        justifyContent="space-between"
      >
        <Text color={colors.dimGray}>
          Web: <Text color={colors.cyan}>localhost:{webPort}</Text>
          {' • '}
          Mode: <Text color={colors.cyan}>Local</Text>
        </Text>
        <Box>
          <Text color={allServicesRunning ? colors.success : colors.warning}>
            {allServicesRunning ? symbols.filledDot : symbols.hollowDot}
          </Text>
          <Text color={colors.gray}>
            {' '}{allServicesRunning ? 'All Services Running' : 'Starting...'}
          </Text>
        </Box>
      </Box>

      {/* Main content - split panels */}
      <Box flexGrow={1} height={contentHeight}>
        {/* Services Panel (20%) */}
        <ServicesPanel 
          services={services} 
          width={servicesPanelWidth} 
          height={contentHeight}
        />
        
        {/* Log Panel (80%) */}
        <Box
          flexDirection="column"
          width={logPanelWidth}
          height={contentHeight}
          borderStyle="single"
          borderColor={colors.darkGray}
          paddingX={1}
        >
          {/* Log header */}
          <Box justifyContent="space-between" marginBottom={0}>
            <Text color={colors.cyan} bold>LOGS</Text>
            <Box>
              {serviceFilter && (
                <Text color={colors.dimGray}>filter: <Text color={colors.warning}>{serviceFilter}</Text>  </Text>
              )}
              <Text color={colors.dimGray}>
                [verbose: {isVerbose ? 'on' : 'off'}]
              </Text>
            </Box>
          </Box>

          {/* Log entries */}
          <Box flexDirection="column" flexGrow={1}>
            {displayedLogs.length === 0 ? (
              <Box justifyContent="center" alignItems="center" flexGrow={1}>
                <Text color={colors.dimGray}>Waiting for logs...</Text>
              </Box>
            ) : (
              displayedLogs.map((log) => (
                <LogEntryRow key={log.id} log={log} maxWidth={logPanelWidth - 4} />
              ))
            )}
          </Box>

          {/* Scroll indicator */}
          {filteredLogs.length > visibleLines && (
            <Box justifyContent="flex-end">
              <Text color={colors.dimGray}>
                {scrollOffset + 1}-{Math.min(scrollOffset + visibleLines, filteredLogs.length)}/{filteredLogs.length}
                {autoScroll ? ' (auto)' : ''}
              </Text>
            </Box>
          )}
        </Box>
      </Box>

      {/* Status bar */}
      <Box
        borderStyle="single"
        borderColor={colors.darkGray}
        paddingX={1}
        justifyContent="space-between"
      >
        <Box>
          <Text color={allServicesRunning ? colors.success : colors.warning}>
            {allServicesRunning ? symbols.filledDot : symbols.hollowDot}
          </Text>
          <Text color={colors.gray}>
            {' '}{isShuttingDown ? 'Shutting down...' : allServicesRunning ? 'Ready' : 'Starting'}
          </Text>
        </Box>
        
        {searchMode ? (
          <Box>
            <Text color={colors.cyan}>/</Text>
            <TextInput
              value={searchQuery}
              onChange={setSearchQuery}
              onSubmit={() => setSearchMode(false)}
              placeholder="Search... (Enter to apply, Esc to cancel)"
            />
          </Box>
        ) : (
          <Box>
            <Shortcut letter="q" label="quit" />
            <Shortcut letter="l" label="logs" />
            <Shortcut letter="v" label={`verbose: ${isVerbose ? 'on' : 'off'}`} />
            <Shortcut letter="/" label="search" />
            <Shortcut letter="f" label="filter" />
            <Shortcut letter="?" label="help" />
          </Box>
        )}
      </Box>
    </Box>
  );
}

// Services Panel component (similar to BuildPanel in Runner Mode)
function ServicesPanel({ services, width, height }: { services: ServiceState[], width: number, height: number }) {
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setSpinnerFrame(prev => (prev + 1) % symbols.spinnerFrames.length);
    }, 120);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Text color={colors.success}>{symbols.check}</Text>;
      case 'starting':
        return <Text color={colors.cyan}>{symbols.spinnerFrames[spinnerFrame]}</Text>;
      case 'error':
        return <Text color={colors.error}>{symbols.cross}</Text>;
      default:
        return <Text color={colors.dimGray}>{symbols.hollowDot}</Text>;
    }
  };

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="single"
      borderColor={colors.darkGray}
      paddingX={1}
    >
      {/* Header */}
      <Box marginBottom={1}>
        <Text color={colors.cyan} bold>SERVICES</Text>
      </Box>

      {/* Service list */}
      {services.map((service) => (
        <Box key={service.name} marginBottom={1} flexDirection="column">
          <Box>
            {getStatusIcon(service.status)}
            <Text color={colors.white}> {service.displayName}</Text>
          </Box>
          {service.status === 'running' && service.port && (
            <Text color={colors.dimGray}>  :{service.port}</Text>
          )}
          {service.status === 'error' && service.error && (
            <Text color={colors.error} wrap="truncate">  {service.error.substring(0, width - 4)}</Text>
          )}
        </Box>
      ))}

      {/* Uptime or status message */}
      <Box flexGrow={1} />
      <Box>
        <Text color={colors.dimGray}>
          {services.every(s => s.status === 'running') 
            ? `${symbols.check} All systems go` 
            : 'Initializing...'}
        </Text>
      </Box>
    </Box>
  );
}

// Log entry row component for main dashboard (matching Runner Mode style)
function LogEntryRow({ log, maxWidth }: { log: LogEntry, maxWidth: number }) {
  const levelColors = {
    info: colors.cyan,
    success: colors.success,
    warn: colors.warning,
    error: colors.error,
  };

  const levelIcons = {
    info: symbols.filledDot,
    success: symbols.check,
    warn: '⚠',
    error: symbols.cross,
  };

  // Service color
  const serviceColor = log.service === 'web' ? colors.cyan : colors.purple;
  
  // Use parsed emoji or level icon
  const icon = log.emoji || levelIcons[log.level];
  const color = levelColors[log.level];
  
  // Build display with tag if present
  let displayContent = log.content || log.message;
  
  // Truncate message
  const tagPart = log.tag ? `[${log.tag}] ` : '';
  const availableWidth = maxWidth - 16 - tagPart.length; // time + service + icon + tag
  const truncatedMessage = displayContent.length > availableWidth
    ? displayContent.substring(0, availableWidth - 3) + '...'
    : displayContent;

  // Tool calls get special formatting
  if (log.toolName) {
    return (
      <Box>
        <Text color={colors.dimGray}>{formatTime(log.timestamp)}</Text>
        <Text color={serviceColor}> [{log.service.substring(0, 3)}]</Text>
        <Text color={colors.cyan}> 🔧 </Text>
        <Text color={colors.white}>{log.toolName}</Text>
        {log.content && log.content !== log.toolName && (
          <Text color={colors.gray}> {log.content.replace(`tool-input-available: ${log.toolName}`, '').trim()}</Text>
        )}
      </Box>
    );
  }

  return (
    <Box>
      <Text color={colors.dimGray}>{formatTime(log.timestamp)}</Text>
      <Text color={serviceColor}> [{log.service.substring(0, 3)}]</Text>
      <Text color={color}> {icon} </Text>
      {log.tag && <Text color={colors.dimGray}>[{log.tag}] </Text>}
      <Text color={log.level === 'error' || log.level === 'warn' ? color : colors.white}>
        {truncatedMessage}
      </Text>
    </Box>
  );
}

// Full log entry row with search highlighting
function FullLogEntryRow({ 
  log, 
  maxWidth, 
  searchQuery,
  highlightSearch 
}: { 
  log: LogEntry, 
  maxWidth: number,
  searchQuery: string,
  highlightSearch: (text: string, query: string) => React.ReactNode
}) {
  const levelColors = {
    info: colors.cyan,
    success: colors.success,
    warn: colors.warning,
    error: colors.error,
  };

  const levelIcons = {
    info: symbols.filledDot,
    success: symbols.check,
    warn: '⚠',
    error: symbols.cross,
  };

  const serviceColor = log.service === 'web' ? colors.cyan : colors.purple;
  const icon = log.emoji || levelIcons[log.level];
  const color = levelColors[log.level];

  // Tool calls
  if (log.toolName) {
    return (
      <Box>
        <Text color={colors.dimGray}>{formatTime(log.timestamp)}</Text>
        <Text color={serviceColor}> [{log.service}]</Text>
        <Text color={colors.cyan}> 🔧 </Text>
        <Text color={colors.white}>{highlightSearch(log.toolName, searchQuery)}</Text>
        {log.content && (
          <Text color={colors.gray}> {highlightSearch(log.content.replace(`tool-input-available: ${log.toolName}`, '').trim(), searchQuery)}</Text>
        )}
      </Box>
    );
  }

  return (
    <Box>
      <Text color={colors.dimGray}>{formatTime(log.timestamp)}</Text>
      <Text color={serviceColor}> [{log.service}]</Text>
      <Text color={color}> {icon} </Text>
      {log.tag && <Text color={colors.dimGray}>[{log.tag}] </Text>}
      <Text color={log.level === 'error' || log.level === 'warn' ? color : colors.white}>
        {highlightSearch(log.content || log.message, searchQuery)}
      </Text>
    </Box>
  );
}

// Shortcut helper component (matching Runner Mode style)
function Shortcut({ letter, label }: { letter: string; label: string }) {
  return (
    <Box marginRight={2}>
      <Text color={colors.dimGray}>[</Text>
      <Text color={colors.cyan}>{letter}</Text>
      <Text color={colors.dimGray}>]</Text>
      <Text color={colors.gray}>{label}</Text>
    </Box>
  );
}
