import { NextResponse } from 'next/server';
import { listRunnerConnections } from '@sentryvibe/agent-core/lib/runner/broker-state';
import { buildWebSocketServer } from '@sentryvibe/agent-core';

export async function GET() {
  const stats = buildWebSocketServer.getStats();
  
  const connections = (await listRunnerConnections()).map((connection) => ({
    runnerId: connection.runnerId,
    lastHeartbeat: connection.lastHeartbeat,
    lastHeartbeatAge: connection.lastHeartbeatAge,
  }));

  return NextResponse.json({
    connections,
    stats: {
      totalRunners: stats.totalRunners,
      runnerMetrics: stats.runnerMetrics,
    },
  });
}
