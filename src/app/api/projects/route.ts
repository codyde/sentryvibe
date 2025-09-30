import { NextResponse } from 'next/server';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';

export async function GET() {
  try {
    const projectsPath = join(process.cwd(), 'projects');

    // Check if projects directory exists
    try {
      await stat(projectsPath);
    } catch {
      return NextResponse.json({ projects: [] });
    }

    const entries = await readdir(projectsPath, { withFileTypes: true });
    const projects = entries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(entry => ({
        name: entry.name,
        slug: entry.name,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ projects });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}
