import { NextResponse } from 'next/server';

// DEPRECATED: This was the old build endpoint that ran Claude Code locally
// Replaced by /api/projects/[id]/build which uses the runner architecture

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return NextResponse.json({
    error: 'Endpoint deprecated - use /api/projects/[id]/build instead',
    todo: 'This endpoint ran Claude locally. Use the runner-based build endpoint.'
  }, { status: 501 });
}

export const maxDuration = 30;
