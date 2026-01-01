/**
 * TUI Module Entry Point
 * Exports all TUI components and utilities
 */

// Types
export * from './types.js';

// State management
export { getTUIStateManager, resetTUIStateManager, TUIStateManager } from './state.js';

// Event processing
export { processRunnerEvent, createTUIEventHandler } from './event-processor.js';

// Components (data preparation utilities)
export { prepareHeaderData, renderHeaderAnsi } from './components/Header.js';
export { prepareTodoPanelData, renderTodoPanelAnsi } from './components/TodoPanel.js';
export { prepareActivityFeedData, renderActivityFeedAnsi } from './components/ActivityFeed.js';
export { prepareFooterData, renderFooterAnsi, renderHelpScreen } from './components/Footer.js';

// ANSI-based TUI renderer (stable, no external dependencies)
export { ANSIRenderer, createANSIRenderer } from './ansi-renderer.js';

// Legacy: OpenTUI renderer (may have API compatibility issues)
// export { TUIRenderer, createTUIRenderer } from './renderer.js';
