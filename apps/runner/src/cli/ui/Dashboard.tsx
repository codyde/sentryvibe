/**
 * Main TUI Dashboard Component for Local Mode
 * Redesigned to match Runner Mode UI style with split panel layout
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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

interface LogEntry {
  id: string;
  timestamp: Date;
  service: string;
  message: string;
  stream: 'stdout' | 'stderr';
  level: 'info' | 'success' | 'warn' | 'error';
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
  if (lower.includes('success') || lower.includes('ready') || lower.includes('started') || lower.includes('connected')) return 'success';
  return 'info';
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
        const newLogs: LogEntry[] = lines.map((line, idx) => ({
          id: `${Date.now()}-${prev + idx}`,
          timestamp: new Date(),
          service: name,
          message: line.trim(),
          stream,
          level: getLogLevel(line, stream),
        }));
        
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

  // Filter logs
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

  // Visible lines calculation
  const visibleLines = Math.max(1, contentHeight - 3);
  
  // Auto-scroll when new logs arrive
  useEffect(() => {
    if (autoScroll && filteredLogs.length > 0) {
      const maxScroll = Math.max(0, filteredLogs.length - visibleLines);
      setScrollOffset(maxScroll);
    }
  }, [filteredLogs.length, autoScroll, visibleLines]);

  // Get displayed logs
  const displayedLogs = useMemo(() => {
    return filteredLogs.slice(scrollOffset, scrollOffset + visibleLines);
  }, [filteredLogs, scrollOffset, visibleLines]);

  // Keyboard shortcuts
  useInput((input, key) => {
    if (isShuttingDown) return;

    // Handle Esc
    if (key.escape) {
      if (searchMode) {
        setSearchMode(false);
        setSearchQuery('');
      } else if (view !== 'dashboard') {
        setView('dashboard');
      }
      return;
    }

    // Don't process other keys when in search mode
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
    } else if (input === 't') {
      setView(view === 'dashboard' ? 'fullLog' : 'dashboard');
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

  // Full log view
  if (view === 'fullLog') {
    return (
      <Box flexDirection="column" height={terminalHeight}>
        <Box borderStyle="single" borderColor={colors.darkGray} paddingX={1}>
          <Text color={colors.cyan} bold>Full Log View</Text>
          <Text color={colors.dimGray}> - {filteredLogs.length} entries</Text>
        </Box>
        <Box flexDirection="column" flexGrow={1} paddingX={1}>
          {filteredLogs.slice(-50).map((log) => (
            <Box key={log.id}>
              <Text color={colors.dimGray}>{formatTime(log.timestamp)}</Text>
              <Text color={log.service === 'web' ? colors.cyan : colors.purple}> [{log.service}] </Text>
              <Text color={log.level === 'error' ? colors.error : log.level === 'warn' ? colors.warning : log.level === 'success' ? colors.success : colors.white}>
                {log.message}
              </Text>
            </Box>
          ))}
        </Box>
        <Box borderStyle="single" borderColor={colors.darkGray} paddingX={1}>
          <Shortcut letter="t" label="dashboard" />
          <Shortcut letter="↑↓" label="scroll" />
          <Shortcut letter="Esc" label="back" />
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
          <Text color={colors.gray}>  <Text color={colors.cyan}>t</Text>         Toggle text view</Text>
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
            <Shortcut letter="v" label={`verbose: ${isVerbose ? 'on' : 'off'}`} />
            <Shortcut letter="r" label="restart" />
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return colors.success;
      case 'starting': return colors.cyan;
      case 'error': return colors.error;
      default: return colors.dimGray;
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

// Log entry row component (matching Runner Mode style)
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

  const color = levelColors[log.level];
  const icon = levelIcons[log.level];
  
  // Service color
  const serviceColor = log.service === 'web' ? colors.cyan : colors.purple;
  
  // Truncate message
  const availableWidth = maxWidth - 18; // time + service + icon
  const truncatedMessage = log.message.length > availableWidth
    ? log.message.substring(0, availableWidth - 3) + '...'
    : log.message;

  return (
    <Box>
      <Text color={colors.dimGray}>{formatTime(log.timestamp)}</Text>
      <Text color={serviceColor}> [{log.service.substring(0, 3)}]</Text>
      <Text color={color}> {icon} </Text>
      <Text color={log.level === 'error' || log.level === 'warn' ? color : colors.white}>
        {truncatedMessage}
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
