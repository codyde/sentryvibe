import { NextResponse } from 'next/server';

// DEPRECATED: This endpoint accessed local filesystem directly
// For multi-runner support, use runner's list-files command instead

export async function GET() {
  return NextResponse.json({
    error: 'Endpoint deprecated - file listing must be done through runner for multi-runner support',
    files: [],
    todo: 'Implement using runner list-files command with event stream'
  }, { status: 501 });
}
