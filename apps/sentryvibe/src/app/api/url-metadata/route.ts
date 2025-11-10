import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const requestSchema = z.object({
  url: z.string().url(),
});

interface UrlMetadata {
  url: string;
  title: string;
  description?: string;
  image?: string;
  favicon?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = requestSchema.parse(body);

    // Fetch the URL
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SentryVibe/1.0; +https://sentryvibe.com)',
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch URL' },
        { status: response.status }
      );
    }

    const html = await response.text();
    const metadata = extractMetadata(html, url);

    return NextResponse.json(metadata);
  } catch (error) {
    console.error('Error fetching URL metadata:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid URL provided' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch URL metadata' },
      { status: 500 }
    );
  }
}

function extractMetadata(html: string, url: string): UrlMetadata {
  const metadata: UrlMetadata = {
    url,
    title: url, // Fallback to URL
  };

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    metadata.title = titleMatch[1].trim();
  }

  // Extract Open Graph title (preferred over regular title)
  const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
  if (ogTitleMatch) {
    metadata.title = ogTitleMatch[1].trim();
  }

  // Extract description
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  if (descMatch) {
    metadata.description = descMatch[1].trim();
  }

  // Extract Open Graph description (preferred)
  const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
  if (ogDescMatch) {
    metadata.description = ogDescMatch[1].trim();
  }

  // Extract Open Graph image
  const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  if (ogImageMatch) {
    metadata.image = ogImageMatch[1].trim();
    // Make relative URLs absolute
    if (metadata.image && !metadata.image.startsWith('http')) {
      const urlObj = new URL(url);
      metadata.image = new URL(metadata.image, urlObj.origin).href;
    }
  }

  // Extract favicon
  const faviconMatch = html.match(/<link[^>]*rel=["'](?:icon|shortcut icon)["'][^>]*href=["']([^"']+)["']/i);
  if (faviconMatch) {
    metadata.favicon = faviconMatch[1].trim();
    // Make relative URLs absolute
    if (metadata.favicon && !metadata.favicon.startsWith('http')) {
      const urlObj = new URL(url);
      metadata.favicon = new URL(metadata.favicon, urlObj.origin).href;
    }
  } else {
    // Default favicon location
    const urlObj = new URL(url);
    metadata.favicon = `${urlObj.origin}/favicon.ico`;
  }

  return metadata;
}
