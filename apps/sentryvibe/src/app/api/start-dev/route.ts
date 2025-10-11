import { NextResponse } from 'next/server';

// DEPRECATED: This endpoint started dev servers locally in Next.js
// For multi-runner support, use runner's start-dev-server command instead
// which handles processes on the remote runner machine

export async function POST(req: Request) {
  return NextResponse.json({
    error: 'Endpoint deprecated - dev servers must be started through runner for multi-runner support',
    todo: 'Use /api/projects/[id]/start endpoint which delegates to runner'
  }, { status: 501 });
}
