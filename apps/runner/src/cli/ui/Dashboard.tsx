/**
 * Main TUI Dashboard Component for Local Mode
 * Redesigned to match Runner Mode UI style with split panel layout
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import { exec } from 'child_process';
import { platform } from 'os';
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

// Theme definitions (matching web app themes)
type ThemeName = 'sentry' | 'ocean' | 'ember' | 'forest' | 'noir';

interface ThemeInfo {
  name: ThemeName;
  label: string;
  description: string;
  colors: {
    primary: string;
    secondary: string;
  };
}

const THEMES: Record<ThemeName, ThemeInfo> = {
  sentry: {
    name: 'sentry',
    label: 'Sentry',
    description: 'Purple-pink gradient',
    colors: { primary: '#a855f7', secondary: '#ec4899' },
  },
  ocean: {
    name: 'ocean',
    label: 'Ocean',
    description: 'Cool blue & teal',
    colors: { primary: '#3b82f6', secondary: '#22d3ee' },
  },
  ember: {
    name: 'ember',
    label: 'Ember',
    description: 'Warm orange & red',
    colors: { primary: '#f97316', secondary: '#ef4444' },
  },
  forest: {
    name: 'forest',
    label: 'Forest',
    description: 'Green & earth tones',
    colors: { primary: '#10b981', secondary: '#84cc16' },
  },
  noir: {
    name: 'noir',
    label: 'Noir',
    description: 'Monochrome dark',
    colors: { primary: '#ffffff', secondary: '#a1a1aa' },
  },
};

const THEME_ORDER: ThemeName[] = ['sentry', 'ocean', 'ember', 'forest', 'noir'];

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
  tag?: string;
  emoji?: string;
  toolName?: string;
  content?: string;
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

function parseLogMessage(message: string): { tag?: string; emoji?: string; toolName?: string; content: string } {
  let tag: string | undefined;
  let emoji: string | undefined;
  let toolName: string | undefined;
  let content = message;

  const tagMatch = content.match(/^\[([^\]]+)\]\s*/);
  if (tagMatch) {
    tag = tagMatch[1];
    content = content.substring(tagMatch[0].length);
  }

  const emojiMatch = content.match(/^([\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|✅|✓|📜|📤|🔧|📡|⚠️|❌)\s*/u);
  if (emojiMatch) {
    emoji = emojiMatch[1];
    content = content.substring(emojiMatch[0].length);
  }

  const toolMatch = content.match(/^tool-input-available:\s*(\w+)/i);
  if (toolMatch) {
    toolName = toolMatch[1];
    emoji = '🔧';
  }

  return { tag, emoji, toolName, content: content.trim() };
}

// Open URL in default browser
function openBrowser(url: string): void {
  const os = platform();
  let command: string;
  
  if (os === 'darwin') {
    command = `open "${url}"`;
  } else if (os === 'win32') {
    command = `start "" "${url}"`;
  } else {
    command = `xdg-open "${url}"`;
  }
  
  exec(command, (error) => {
    if (error) {
      // Silently fail - user can manually open browser
    }
  });
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
  const [fullLogSearchMode, setFullLogSearchMode] = useState(false);
  const [fullLogSearchQuery, setFullLogSearchQuery] = useState('');
  const [fullLogScrollOffset, setFullLogScrollOffset] = useState(0);
  
  // Theme state
  const [selectedTheme, setSelectedTheme] = useState<ThemeName>('sentry');
  const [helpMenuIndex, setHelpMenuIndex] = useState(0);

  const terminalHeight = stdout?.rows || 40;
  const terminalWidth = stdout?.columns || 80;
  
  const bannerHeight = 7;
  const headerHeight = 3;
  const statusBarHeight = 3;
  const contentHeight = Math.max(1, terminalHeight - bannerHeight - headerHeight - statusBarHeight);
  
  const servicesPanelWidth = Math.floor(terminalWidth * 0.2);
  const logPanelWidth = terminalWidth - servicesPanelWidth;

  const allServicesRunning = useMemo(() => {
    return services.length > 0 && services.every(s => s.status === 'running');
  }, [services]);

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

  const filteredLogs = useMemo(() => {
    let filtered = logs;
    
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

  const fullLogFilteredLogs = useMemo(() => {
    let filtered = logs;
    
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

  const visibleLines = Math.max(1, contentHeight - 3);
  const fullLogVisibleLines = Math.max(1, terminalHeight - 6);
  
  useEffect(() => {
    if (autoScroll && filteredLogs.length > 0) {
      const maxScroll = Math.max(0, filteredLogs.length - visibleLines);
      setScrollOffset(maxScroll);
    }
  }, [filteredLogs.length, autoScroll, visibleLines]);

  useEffect(() => {
    if (view === 'fullLog') {
      const maxScroll = Math.max(0, fullLogFilteredLogs.length - fullLogVisibleLines);
      setFullLogScrollOffset(maxScroll);
    }
  }, [fullLogFilteredLogs.length, view, fullLogVisibleLines]);

  const displayedLogs = useMemo(() => {
    return filteredLogs.slice(scrollOffset, scrollOffset + visibleLines);
  }, [filteredLogs, scrollOffset, visibleLines]);

  const fullLogDisplayedLogs = useMemo(() => {
    return fullLogFilteredLogs.slice(fullLogScrollOffset, fullLogScrollOffset + fullLogVisibleLines);
  }, [fullLogFilteredLogs, fullLogScrollOffset, fullLogVisibleLines]);

  // Handle theme change - updates web app via API
  const changeTheme = async (theme: ThemeName) => {
    setSelectedTheme(theme);
    try {
      // Call API to update theme in web app
      await fetch(`http://localhost:${webPort}/api/theme`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme }),
      }).catch(() => {
        // API might not exist yet, that's ok
      });
    } catch {
      // Silently fail
    }
  };

  useInput((input, key) => {
    if (isShuttingDown) return;

    // Help/Menu view
    if (view === 'help') {
      if (key.escape) {
        setView('dashboard');
        return;
      }
      if (input === 't') {
        // Cycle to next theme
        const currentIndex = THEME_ORDER.indexOf(selectedTheme);
        const nextIndex = (currentIndex + 1) % THEME_ORDER.length;
        changeTheme(THEME_ORDER[nextIndex]);
        return;
      }
      if (input === 'b') {
        openBrowser(`http://localhost:${webPort}`);
        return;
      }
      if (input === 'q') {
        setIsShuttingDown(true);
        serviceManager.stopAll().then(() => exit());
        return;
      }
      if (key.upArrow) {
        const currentIndex = THEME_ORDER.indexOf(selectedTheme);
        const prevIndex = (currentIndex - 1 + THEME_ORDER.length) % THEME_ORDER.length;
        changeTheme(THEME_ORDER[prevIndex]);
        return;
      }
      if (key.downArrow) {
        const currentIndex = THEME_ORDER.indexOf(selectedTheme);
        const nextIndex = (currentIndex + 1) % THEME_ORDER.length;
        changeTheme(THEME_ORDER[nextIndex]);
        return;
      }
      return;
    }

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
      if (input === 'b') {
        openBrowser(`http://localhost:${webPort}`);
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
    } else if (input === 'b') {
      // Open browser
      openBrowser(`http://localhost:${webPort}`);
    } else if (input === 'v') {
      setIsVerbose(!isVerbose);
    } else if (input === 'r' && view === 'dashboard') {
      serviceManager.restartAll();
    } else if (input === 'c' && view === 'dashboard') {
      setLogs([]);
      setScrollOffset(0);
      setAutoScroll(true);
    } else if (input === 'l' || input === 't') {
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
    return (
      <Box flexDirection="column" height={terminalHeight}>
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
            <Shortcut letter="b" label="browser" />
            <Shortcut letter="q" label="quit" />
          </Box>
          <Text color={colors.dimGray}>
            {fullLogScrollOffset + 1}-{Math.min(fullLogScrollOffset + fullLogVisibleLines, fullLogFilteredLogs.length)}/{fullLogFilteredLogs.length}
          </Text>
        </Box>
      </Box>
    );
  }

  // Help/Menu view with theme selector
  if (view === 'help') {
    const currentTheme = THEMES[selectedTheme];
    
    return (
      <Box flexDirection="column" height={terminalHeight}>
        <Banner />
        <Box flexDirection="column" padding={2}>
          <Text color={colors.cyan} bold>Settings & Help</Text>
          <Text> </Text>
          
          {/* Theme Selector */}
          <Box flexDirection="column" marginBottom={1}>
            <Text color={colors.white} bold>Theme</Text>
            <Box marginTop={1}>
              {THEME_ORDER.map((themeName) => {
                const theme = THEMES[themeName];
                const isSelected = themeName === selectedTheme;
                return (
                  <Box key={themeName} marginRight={2}>
                    <Text color={isSelected ? theme.colors.primary : colors.dimGray}>
                      {isSelected ? '●' : '○'}
                    </Text>
                    <Text color={isSelected ? colors.white : colors.gray}> {theme.label}</Text>
                  </Box>
                );
              })}
            </Box>
            <Box marginTop={1}>
              <Text color={colors.dimGray}>
                Press <Text color={colors.cyan}>t</Text> or <Text color={colors.cyan}>↑↓</Text> to change theme
              </Text>
            </Box>
          </Box>
          
          <Text> </Text>
          <Text color={colors.white} bold>Keyboard Shortcuts</Text>
          <Text> </Text>
          <Text color={colors.gray}>  <Text color={colors.cyan}>b</Text>         Open in browser</Text>
          <Text color={colors.gray}>  <Text color={colors.cyan}>l</Text>         Full log view</Text>
          <Text color={colors.gray}>  <Text color={colors.cyan}>/</Text>         Search logs</Text>
          <Text color={colors.gray}>  <Text color={colors.cyan}>f</Text>         Filter by service</Text>
          <Text color={colors.gray}>  <Text color={colors.cyan}>v</Text>         Toggle verbose mode</Text>
          <Text color={colors.gray}>  <Text color={colors.cyan}>r</Text>         Restart services</Text>
          <Text color={colors.gray}>  <Text color={colors.cyan}>c</Text>         Clear logs</Text>
          <Text color={colors.gray}>  <Text color={colors.cyan}>q</Text>         Quit</Text>
          <Text> </Text>
          <Text color={colors.dimGray}>Press <Text color={colors.cyan}>Esc</Text> to return to dashboard</Text>
        </Box>
      </Box>
    );
  }

  // Main dashboard view
  return (
    <Box flexDirection="column" height={terminalHeight} width={terminalWidth}>
      <Banner />

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
          {' • '}
          Theme: <Text color={THEMES[selectedTheme].colors.primary}>{THEMES[selectedTheme].label}</Text>
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

      <Box flexGrow={1} height={contentHeight}>
        <ServicesPanel 
          services={services} 
          width={servicesPanelWidth} 
          height={contentHeight}
        />
        
        <Box
          flexDirection="column"
          width={logPanelWidth}
          height={contentHeight}
          borderStyle="single"
          borderColor={colors.darkGray}
          paddingX={1}
        >
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
            <Shortcut letter="b" label="browser" />
            <Shortcut letter="l" label="logs" />
            <Shortcut letter="/" label="search" />
            <Shortcut letter="?" label="menu" />
            <Shortcut letter="q" label="quit" />
          </Box>
        )}
      </Box>
    </Box>
  );
}

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
      <Box marginBottom={1}>
        <Text color={colors.cyan} bold>SERVICES</Text>
      </Box>

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

  const serviceColor = log.service === 'web' ? colors.cyan : colors.purple;
  const icon = log.emoji || levelIcons[log.level];
  const color = levelColors[log.level];
  
  let displayContent = log.content || log.message;
  const tagPart = log.tag ? `[${log.tag}] ` : '';
  const availableWidth = maxWidth - 16 - tagPart.length;
  const truncatedMessage = displayContent.length > availableWidth
    ? displayContent.substring(0, availableWidth - 3) + '...'
    : displayContent;

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
