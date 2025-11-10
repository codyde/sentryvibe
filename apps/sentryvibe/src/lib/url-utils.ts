/**
 * URL detection and parsing utilities
 */

const FULL_URL_REGEX = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;

// Matches simple domains like "sentry.io" or "github.com"
const SIMPLE_DOMAIN_REGEX = /\b[a-zA-Z0-9][-a-zA-Z0-9]{0,62}(\.[a-zA-Z0-9][-a-zA-Z0-9]{0,62})+\.?/g;

/**
 * Detects full URLs in text (with http/https)
 */
export function detectFullUrls(text: string): string[] {
  const matches = text.match(FULL_URL_REGEX);
  return matches || [];
}

/**
 * Detects simple domain patterns (e.g., "sentry.io", "github.com")
 */
export function detectSimpleDomains(text: string): string[] {
  const matches = text.match(SIMPLE_DOMAIN_REGEX);
  if (!matches) return [];

  // Filter out patterns that are clearly not domains
  return matches.filter(match => {
    // Must have at least one dot
    if (!match.includes('.')) return false;

    // Must have valid TLD (at least 2 chars after last dot)
    const parts = match.split('.');
    const tld = parts[parts.length - 1];
    if (tld.length < 2) return false;

    // Should have at least domain.tld structure
    if (parts.length < 2) return false;

    return true;
  });
}

/**
 * Detects all URLs in text (both full URLs and simple domains)
 */
export function detectUrls(text: string): string[] {
  const fullUrls = detectFullUrls(text);
  const simpleDomains = detectSimpleDomains(text);

  // Combine and deduplicate
  const all = [...fullUrls, ...simpleDomains];
  return Array.from(new Set(all));
}

/**
 * Checks if text contains a URL
 */
export function containsUrl(text: string): boolean {
  return detectUrls(text).length > 0;
}

/**
 * Validates if a string is a valid URL
 */
export function isValidUrl(urlString: string): boolean {
  try {
    new URL(urlString);
    return true;
  } catch {
    // Try with https:// prefix for simple domains
    try {
      new URL(`https://${urlString}`);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Normalizes a URL string (adds https:// if missing)
 */
export function normalizeUrl(urlString: string): string {
  const trimmed = urlString.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/**
 * Extracts URL from pasted content
 */
export function extractUrlFromPaste(text: string): string | null {
  const urls = detectUrls(text);
  return urls.length > 0 ? urls[0] : null;
}

/**
 * Checks if the text is just a URL (and nothing else)
 */
export function isPureUrl(text: string): boolean {
  const trimmed = text.trim();
  const urls = detectUrls(trimmed);

  if (urls.length !== 1) {
    return false;
  }

  return trimmed === urls[0];
}

/**
 * Extracts URL at the end of text (when user finishes typing)
 * Returns null if no URL at end, or the URL with the remaining text
 */
export function extractTrailingUrl(text: string): { url: string; remainingText: string } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Check if text ends with a space followed by a URL-like pattern
  const words = trimmed.split(/\s+/);
  const lastWord = words[words.length - 1];

  if (!lastWord) return null;

  // Check if last word is a URL
  if (isValidUrl(lastWord) || isValidUrl(normalizeUrl(lastWord))) {
    const remainingText = words.slice(0, -1).join(' ');
    return {
      url: normalizeUrl(lastWord),
      remainingText: remainingText,
    };
  }

  return null;
}
