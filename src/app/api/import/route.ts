import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { projects } from '@/lib/db/schema';
import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';

// POST /api/import - Import existing projects from filesystem
export async function POST(req: Request) {
  try {
    const { directories } = await req.json();

    if (!Array.isArray(directories) || directories.length === 0) {
      return NextResponse.json({ error: 'Directories array is required' }, { status: 400 });
    }

    const projectsDir = join(process.cwd(), 'projects');
    const imported = [];
    const errors = [];

    for (const dirName of directories) {
      try {
        const projectPath = join(projectsDir, dirName);

        // Verify directory exists
        await stat(projectPath);

        // Try to read package.json
        let projectType = 'unknown';
        let runCommand = 'npm run dev';
        let port = 3001;
        let description = null;

        try {
          const packageJsonPath = join(projectPath, 'package.json');
          const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));

          // Detect project type
          if (packageJson.dependencies?.next) {
            projectType = 'next';
            port = 3001;
          } else if (packageJson.devDependencies?.vite) {
            projectType = 'vite';
            port = 5173;
          }

          // Use package.json name/description if available
          description = packageJson.description || null;
        } catch (error) {
          console.warn(`No package.json found for ${dirName}`);
        }

        // Create project record
        const newProject = await db.insert(projects).values({
          name: dirName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          slug: dirName,
          description,
          status: 'completed', // Assume already completed since it exists
          projectType,
          path: projectPath,
          runCommand,
          port,
        }).returning();

        imported.push(newProject[0]);
        console.log(`✅ Imported project: ${dirName}`);
      } catch (error) {
        console.error(`Failed to import ${dirName}:`, error);
        errors.push({
          directory: dirName,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      imported,
      errors,
      summary: {
        attempted: directories.length,
        successful: imported.length,
        failed: errors.length,
      },
    });
  } catch (error) {
    console.error('Error importing projects:', error);
    return NextResponse.json(
      {
        error: 'Failed to import projects',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
