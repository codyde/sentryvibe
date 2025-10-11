import { NextResponse } from 'next/server';

// DEPRECATED: This endpoint ran Claude Code locally for element changes
// For multi-runner support, all AI operations must go through the runner

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return NextResponse.json({
    error: 'Endpoint deprecated - element changes must be done through runner',
    todo: 'Use /api/projects/[id]/build with appropriate prompt for element modifications'
  }, { status: 501 });
}

export const maxDuration = 30;
