import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { join } from 'path';
import { getWorkspaceRoot } from '@/lib/workspace';

// Store active processes with metadata
const activeProcesses = new Map<string, { process: any; port: number }>();

export async function POST(request: NextRequest) {
  try {
    const { directory } = await request.json();

    if (!directory) {
      return NextResponse.json({ error: 'Directory is required' }, { status: 400 });
    }

    // Handle both formats: "hello-sentry" and "projects/hello-sentry"
    const cleanDirectory = directory.startsWith('projects/') ? directory.substring('projects/'.length) : directory;
    const projectPath = join(getWorkspaceRoot(), cleanDirectory);

    // Kill existing process for this directory if any
    if (activeProcesses.has(cleanDirectory)) {
      const existing = activeProcesses.get(cleanDirectory);
      existing?.process.kill();
      activeProcesses.delete(cleanDirectory);
    }

    // Generate random port in range 3100-3199
    const randomPort = Math.floor(Math.random() * 100) + 3100;

    // Start pnpm dev process with PORT environment variable
    const devProcess = spawn('pnpm', ['dev'], {
      cwd: projectPath,
      stdio: 'pipe',
      detached: false,
      env: {
        ...process.env,
        PORT: randomPort.toString(),
      },
    });

    let devUrl = `http://localhost:${randomPort}`; // Use assigned port
    let urlDetected = false;

    // Listen for output to detect the dev server URL
    devProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[${cleanDirectory}] ${output}`);

      // Try to extract URL from common patterns
      const urlMatch = output.match(/(?:Local:|http:\/\/|https:\/\/)[\w:./-]+/);
      if (urlMatch && !urlDetected) {
        const matched = urlMatch[0];
        devUrl = matched.startsWith('http') ? matched : `http://${matched.replace('Local:', '').trim()}`;
        urlDetected = true;
      }
    });

    devProcess.stderr.on('data', (data) => {
      console.error(`[${cleanDirectory}] Error: ${data}`);
    });

    devProcess.on('close', (code) => {
      console.log(`[${cleanDirectory}] Process exited with code ${code}`);
      activeProcesses.delete(cleanDirectory);
    });

    // Store the process with metadata
    activeProcesses.set(cleanDirectory, { process: devProcess, port: randomPort });

    // Wait a bit to try to capture the URL
    await new Promise(resolve => setTimeout(resolve, 2000));

    return NextResponse.json({
      success: true,
      url: devUrl,
      pid: devProcess.pid,
      port: randomPort,
    });
  } catch (error) {
    console.error('Error starting dev server:', error);
    return NextResponse.json({ error: 'Failed to start dev server' }, { status: 500 });
  }
}

// Delete endpoint to stop a running process
export async function DELETE(request: NextRequest) {
  try {
    const { directory } = await request.json();

    if (!directory) {
      return NextResponse.json({ error: 'Directory is required' }, { status: 400 });
    }

    // Handle both formats: "hello-sentry" and "projects/hello-sentry"
    const cleanDirectory = directory.startsWith('projects/') ? directory.substring('projects/'.length) : directory;

    console.log(`Attempting to stop process for directory: ${cleanDirectory}`);
    console.log(`Active processes:`, Array.from(activeProcesses.keys()));

    if (activeProcesses.has(cleanDirectory)) {
      const processData = activeProcesses.get(cleanDirectory);
      if (processData?.process) {
        console.log(`Killing process for ${cleanDirectory} (PID: ${processData.process.pid})`);
        processData.process.kill('SIGTERM');

        // Give it a moment to terminate gracefully
        setTimeout(() => {
          if (activeProcesses.has(cleanDirectory)) {
            const pd = activeProcesses.get(cleanDirectory);
            if (pd?.process) {
              try {
                pd.process.kill('SIGKILL');
              } catch (e) {
                // Process already dead
              }
            }
            activeProcesses.delete(cleanDirectory);
          }
        }, 1000);

        return NextResponse.json({ success: true });
      }
    }

    console.log(`No active process found for directory: ${cleanDirectory}`);
    return NextResponse.json({ error: 'No active process found', directory: cleanDirectory, activeProcesses: Array.from(activeProcesses.keys()) }, { status: 404 });
  } catch (error) {
    console.error('Error stopping dev server:', error);
    return NextResponse.json({ error: 'Failed to stop dev server' }, { status: 500 });
  }
}
