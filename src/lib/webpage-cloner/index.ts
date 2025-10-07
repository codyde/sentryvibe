import puppeteer from 'puppeteer';
import type { ClonedWebpage, ClonedAsset, CloneOptions, ComputedStyleMap } from './types';
import { analyzeTechStack } from './tech-analyzer';

/**
 * Sanitize CSS to remove JavaScript code that might have been injected
 */
function sanitizeCSS(css: string): string {
  // Remove JavaScript patterns that shouldn't be in CSS
  const jsPatterns = [
    /\(\)\s*=>\s*/g,                    // Arrow functions: () =>
    /function\s*\(/g,                    // Function declarations
    /void\s+0/g,                         // void 0
    /!==\s*null/g,                       // Strict comparisons
    /!==\s*void/g,                       // void comparisons
    /\.includes\(/g,                     // Method calls
    /&&[^&]/g,                           // Logical AND (but not CSS &&)
    /\|\|[^|]/g,                         // Logical OR
    /emotion_react/g,                    // Emotion CSS-in-JS
    /styled_components/g,                // styled-components
  ];

  let sanitized = css;

  // Remove lines that contain JavaScript code
  sanitized = sanitized.split('\n')
    .filter(line => {
      // Skip lines that look like JavaScript
      const looksLikeJS = jsPatterns.some(pattern => pattern.test(line));
      return !looksLikeJS;
    })
    .join('\n');

  return sanitized;
}

export async function cloneWebpage(options: CloneOptions): Promise<ClonedWebpage> {
  const {
    url,
    waitForNetworkIdle = true,
    captureAssets = true,
    timeout = 30000,
    viewport = { width: 1920, height: 1080 },
  } = options;

  console.log('🌐 Starting webpage clone:', url);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080',
    ],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    protocolTimeout: 60000, // Increase protocol timeout
  });

  try {
    const page = await browser.newPage();

    // Set user agent to avoid bot detection
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

    await page.setViewport(viewport);

    // Navigate to the page
    console.log('   Navigating to URL...');
    try {
      await page.goto(url, {
        waitUntil: waitForNetworkIdle ? 'networkidle2' : 'load',
        timeout,
      });
    } catch (navError) {
      console.warn('⚠️  Navigation warning:', navError instanceof Error ? navError.message : 'Unknown');
      // Try with less strict wait condition
      console.log('   Retrying with domcontentloaded...');
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout,
      });
    }

    // Wait a bit for any dynamic content
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get page metadata FIRST
    console.log('   Extracting metadata...');
    const metadata = await page.evaluate(() => {
      const getMetaContent = (name: string) => {
        const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
        return meta?.getAttribute('content') || '';
      };

      return {
        title: document.title || '',
        description: getMetaContent('description') || getMetaContent('og:description'),
        favicon: document.querySelector('link[rel*="icon"]')?.getAttribute('href') || '',
        viewport: getMetaContent('viewport'),
      };
    });

    // Analyze tech stack (get HTML sample for analysis)
    console.log('   Analyzing tech stack...');
    const htmlSample = await page.content();
    const pageContext = await page.evaluate(() => {
      return {
        React: !!(window as any).React,
        Vue: !!(window as any).Vue,
        __NEXT_DATA__: !!(window as any).__NEXT_DATA__,
        ng: !!(window as any).ng,
      };
    });

    const techStack = analyzeTechStack(htmlSample, pageContext);
    console.log('   Detected:', techStack.detectedLibraries.join(', ') || 'Plain HTML');

    // Extract stylesheets
    console.log('   Extracting styles...');
    const stylesheets = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
      return links.map((link) => (link as HTMLLinkElement).href);
    });

    // Fetch and combine all CSS
    let combinedCSS = '';
    for (const href of stylesheets) {
      try {
        const response = await page.goto(href);
        if (response) {
          const css = await response.text();
          const sanitizedCSS = sanitizeCSS(css);
          combinedCSS += `\n/* ${href} */\n${sanitizedCSS}\n`;
        }
      } catch (error) {
        console.warn(`   Failed to fetch stylesheet: ${href}`);
      }
    }

    // Extract inline styles
    const inlineStyles = await page.evaluate(() => {
      const styles = Array.from(document.querySelectorAll('style'));
      return styles.map((s) => s.textContent || '').join('\n');
    });

    // Sanitize inline styles to remove JavaScript code
    const sanitizedInlineStyles = sanitizeCSS(inlineStyles);
    combinedCSS += '\n/* Inline Styles */\n' + sanitizedInlineStyles;

    // Inject computed styles directly into HTML elements
    console.log('   Injecting computed styles into elements...');
    await page.evaluate(() => {
      const elements = document.querySelectorAll('*');
      let styledCount = 0;

      elements.forEach((el) => {
        if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;

        const computed = window.getComputedStyle(el);
        const styleObj: any = {};

        // Critical properties to keep for accurate rendering
        const criticalProps = [
          'display', 'position', 'top', 'left', 'right', 'bottom',
          'width', 'height', 'maxWidth', 'maxHeight',
          'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
          'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
          'backgroundColor', 'color',
          'fontSize', 'fontFamily', 'fontWeight', 'lineHeight', 'textAlign',
          'border', 'borderRadius', 'boxShadow',
          'flexDirection', 'alignItems', 'justifyContent', 'gap', 'flex',
          'gridTemplateColumns', 'gridTemplateRows', 'gridGap',
          'overflow', 'overflowX', 'overflowY',
          'zIndex', 'opacity',
          'transform', 'transition',
          'backgroundImage', 'backgroundSize',
        ];

        let hasStyles = false;
        for (const prop of criticalProps) {
          const value = computed.getPropertyValue(prop);
          if (value && value !== 'none' && value !== 'normal' && value !== 'auto' && value !== '0px' && value !== 'rgba(0, 0, 0, 0)') {
            styleObj[prop] = value;
            hasStyles = true;
          }
        }

        // Set the style attribute with computed styles
        if (hasStyles) {
          const styleString = Object.entries(styleObj)
            .map(([k, v]) => `${k}: ${v}`)
            .join('; ');
          (el as HTMLElement).setAttribute('style', styleString);
          styledCount++;
        }
      });

      console.log(`Injected styles into ${styledCount} elements`);
    });

    // Now get the HTML with injected styles
    const html = await page.content();

    // We don't need the computedStyles map anymore since styles are in HTML
    const computedStyles: ComputedStyleMap = {};

    // Collect assets
    const assets: ClonedAsset[] = [];

    if (captureAssets) {
      console.log('   Collecting assets...');

      // Get images
      const images = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img'));
        return imgs.map((img) => img.src).filter(Boolean);
      });

      images.forEach((url) => {
        assets.push({ type: 'image', url });
      });

      // Get background images from CSS
      const bgImages = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('*'));
        const urls: string[] = [];

        elements.forEach((el) => {
          const style = window.getComputedStyle(el);
          const bgImage = style.backgroundImage;
          if (bgImage && bgImage !== 'none') {
            const match = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
            if (match && match[1]) {
              urls.push(match[1]);
            }
          }
        });

        return urls;
      });

      bgImages.forEach((url) => {
        assets.push({ type: 'image', url });
      });

      console.log(`   Found ${assets.length} assets`);
    }

    await browser.close();

    console.log('✅ Webpage cloned successfully');

    return {
      html,
      css: combinedCSS,
      computedStyles,
      assets,
      techStack,
      metadata,
      originalUrl: url,
    };
  } catch (error) {
    console.error('❌ Error cloning webpage:', error);
    try {
      await browser.close();
    } catch (closeError) {
      console.warn('⚠️  Error closing browser:', closeError);
    }
    throw new Error(`Failed to clone webpage: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function detectUrlInPrompt(prompt: string): string | null {
  // Try to extract a URL from the prompt
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  const matches = prompt.match(urlRegex);

  if (matches && matches.length > 0) {
    const url = matches[0];
    // Clean up trailing punctuation
    return url.replace(/[.,;!?]+$/, '');
  }

  return null;
}

export * from './types';
export * from './tech-analyzer';
export * from './html-to-react';
