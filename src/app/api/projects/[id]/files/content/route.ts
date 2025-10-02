import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { readFile, writeFile, stat } from 'fs/promises';
import { join } from 'path';

const MAX_FILE_SIZE = 500 * 1024; // 500KB limit

// GET /api/projects/:id/files/content?path=src/App.tsx
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const filePath = searchParams.get('path');

    if (!filePath) {
      return NextResponse.json({ error: 'File path is required' }, { status: 400 });
    }

    // Get project from DB
    const project = await db.select().from(projects).where(eq(projects.id, id)).limit(1);

    if (project.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const fullPath = join(project[0].path, filePath);

    // Security: Ensure path is within project directory
    if (!fullPath.startsWith(project[0].path)) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 403 });
    }

    // Check file size
    const stats = await stat(fullPath);
    if (stats.size > MAX_FILE_SIZE) {
      return NextResponse.json({
        error: 'File too large',
        message: `File exceeds ${MAX_FILE_SIZE / 1024}KB limit`,
      }, { status: 413 });
    }

    // Read file content
    const content = await readFile(fullPath, 'utf-8');

    return NextResponse.json({ content, size: stats.size });
  } catch (error) {
    console.error('Error reading file:', error);
    return NextResponse.json(
      {
        error: 'Failed to read file',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// PUT /api/projects/:id/files/content - Save file content
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { path: filePath, content } = await req.json();

    if (!filePath || content === undefined) {
      return NextResponse.json({ error: 'Path and content are required' }, { status: 400 });
    }

    // Get project from DB
    const project = await db.select().from(projects).where(eq(projects.id, id)).limit(1);

    if (project.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const fullPath = join(project[0].path, filePath);

    // Security: Ensure path is within project directory
    if (!fullPath.startsWith(project[0].path)) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 403 });
    }

    // Write file content
    await writeFile(fullPath, content, 'utf-8');

    console.log(`💾 Saved file: ${filePath} (${content.length} bytes)`);

    return NextResponse.json({ success: true, path: filePath });
  } catch (error) {
    console.error('Error writing file:', error);
    return NextResponse.json(
      {
        error: 'Failed to write file',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
