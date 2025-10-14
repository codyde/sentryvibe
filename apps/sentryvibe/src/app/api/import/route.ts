import { NextResponse } from 'next/server';

// DEPRECATED: This endpoint accessed local filesystem directly to import projects
// For multi-runner support, projects should be created through the runner
// which will handle the filesystem on its own machine

// POST /api/import - Import existing projects from filesystem
export async function POST(req: Request) {
  return NextResponse.json({
    error: 'Endpoint deprecated - project import must be done through runner for multi-runner support',
    todo: 'Implement project scanning and import via runner commands'
  }, { status: 501 });
}
