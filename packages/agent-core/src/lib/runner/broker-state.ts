/**
 * Runner Communication Module
 * 
 * Provides functions to send commands to runners and query runner status.
 * Commands are sent directly via WebSocket connections managed by buildWebSocketServer.
 * 
 * NOTE: This module was previously named "broker-state" when it communicated via
 * a separate broker service. It now communicates directly with runners through
 * the WebSocket server, but keeps the same API for backward compatibility.
 */

import type { RunnerCommand } from '../../shared/runner/messages';
import { buildWebSocketServer } from '../websocket/server';

/**
 * Send a command to a specific runner via WebSocket
 * 
 * @param runnerId - The ID of the runner to send the command to
 * @param command - The command to send
 * @throws Error if runner is not connected or command fails to send
 */
export async function sendCommandToRunner(runnerId: string, command: RunnerCommand) {
  const success = buildWebSocketServer.sendCommandToRunner(runnerId, command);
  
  if (!success) {
    throw new Error(`Runner '${runnerId}' is not connected`);
  }
}

/**
 * List all connected runners with their status
 * 
 * @param userId - Optional user ID to filter runners (for multi-tenancy)
 * @returns Array of connected runners with heartbeat information
 */
export async function listRunnerConnections(userId?: string) {
  return buildWebSocketServer.listRunnerConnections(userId);
}

/**
 * Check if a specific runner is connected
 * 
 * @param runnerId - The ID of the runner to check
 * @returns true if runner is connected and ready
 */
export function isRunnerConnected(runnerId: string): boolean {
  return buildWebSocketServer.isRunnerConnected(runnerId);
}

/**
 * Get runner connection metrics
 * 
 * @returns Metrics about runner connections (events, commands, errors)
 */
export function getRunnerMetrics() {
  return buildWebSocketServer.getRunnerMetrics();
}

/**
 * Register a callback to be notified when runner status changes
 * This allows the app layer to emit project events when runners connect/disconnect
 * 
 * @param callback - Function called when runner connects/disconnects
 *                   (runnerId, connected, affectedProjectIds)
 */
export function onRunnerStatusChange(
  callback: (runnerId: string, connected: boolean, affectedProjectIds: string[]) => void
) {
  buildWebSocketServer.onRunnerStatusChange(callback);
}
