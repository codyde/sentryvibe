import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { SELECTION_SCRIPT } from '@/lib/selection/injector';

/**
 * Proxy the user's dev server through our app to enable same-origin access
 * This allows us to inject the selection script without CORS issues
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const path = url.searchParams.get('path') || '/';

    // Get project from DB
    const project = await db.select().from(projects).where(eq(projects.id, id)).limit(1);

    if (project.length === 0) {
      return new NextResponse('Project not found', { status: 404 });
    }

    const proj = project[0];

    // Check if dev server is running
    if (proj.devServerStatus !== 'running' || !proj.devServerPort) {
      return new NextResponse('Dev server not running', { status: 503 });
    }

    // Fetch from user's dev server
    const targetUrl = `http://localhost:${proj.devServerPort}${path}`;
    console.log(`🔀 Proxying: ${targetUrl}`);

    const response = await fetch(targetUrl);
    const contentType = response.headers.get('content-type') || '';

    // If it's HTML, inject our selection script and fix asset paths
    if (contentType.includes('text/html')) {
      let html = await response.text();

      // Add base tag to fix relative asset paths
      const baseTag = `<base href="http://localhost:${proj.devServerPort}/" target="_parent">`;
      html = html.replace('<head>', `<head>\n${baseTag}`);

      // Inject selection script before closing body tag
      const scriptTag = `
<!-- SentryVibe Selection Tool -->
<script>
${SELECTION_SCRIPT}
</script>
</body>`;

      html = html.replace('</body>', scriptTag);

      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'X-Frame-Options': 'SAMEORIGIN',
        },
      });
    }

    // For non-HTML (CSS, JS, images, etc.), proxy as-is
    const buffer = await response.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': response.headers.get('cache-control') || 'public, max-age=31536000',
      },
    });

  } catch (error) {
    console.error('❌ Proxy error:', error);
    return new NextResponse('Proxy failed', { status: 500 });
  }
}
