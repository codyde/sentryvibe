import { NextResponse } from 'next/server';
import { listRunnerConnections } from '@/lib/runner/broker-state';

export async function GET() {
  const connections = (await listRunnerConnections()).map((connection) => ({
    runnerId: connection.runnerId,
    lastHeartbeat: connection.lastHeartbeat,
  }));

  return NextResponse.json({
    connections,
  });
}
