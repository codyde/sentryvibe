import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const MAX_FILE_SIZE = 500 * 1024; // 500KB limit

// TODO: This endpoint needs refactoring to use runner commands (read-file/write-file)
// For now, it's deprecated - file operations should go through the runner
// This ensures multi-runner support where files may be on remote systems

// GET /api/projects/:id/files/content?path=src/App.tsx
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // TODO: Implement using runner read-file command with event stream response
  // This requires waiting for file-content event from runner
  return NextResponse.json({
    error: 'Endpoint deprecated - file reading must be done through runner for multi-runner support',
    todo: 'Implement read-file command with event stream'
  }, { status: 501 });
}

// PUT /api/projects/:id/files/content - Save file content
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // TODO: Implement using runner write-file command with event stream response
  // This requires waiting for file-written event from runner
  return NextResponse.json({
    error: 'Endpoint deprecated - file writing must be done through runner for multi-runner support',
    todo: 'Implement write-file command with event stream'
  }, { status: 501 });
}
