import { NextResponse } from 'next/server';

// DEPRECATED: This endpoint ran Claude Code SDK directly in Next.js
// For multi-runner support, all AI operations must go through the runner
// Use /api/projects/[id]/build endpoint instead

export async function POST(req: Request) {
  return NextResponse.json({
    error: 'Endpoint deprecated - Claude operations must be done through runner for multi-runner support',
    todo: 'Use /api/projects/[id]/build endpoint which delegates to runner'
  }, { status: 501 });
}

export const maxDuration = 30;
