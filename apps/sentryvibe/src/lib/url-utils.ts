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

  // First check: must contain a dot to be considered a URL
  // This prevents single words like "check" from being detected
  if (!lastWord.includes('.')) {
    return null;
  }

  // Second check: if it starts with http/https, validate directly
  if (lastWord.startsWith('http://') || lastWord.startsWith('https://')) {
    if (isValidUrl(lastWord)) {
      const remainingText = words.slice(0, -1).join(' ');
      return {
        url: lastWord,
        remainingText: remainingText,
      };
    }
    return null;
  }

  // Third check: for simple domains (like sentry.io), ensure valid structure
  // Must have at least 2 parts separated by dot and valid TLD
  const parts = lastWord.split('.');
  if (parts.length < 2) return null;

  // Check that each part has at least one character
  if (parts.some(part => part.length === 0)) return null;

  // Check that TLD is at least 2 characters
  const tld = parts[parts.length - 1];
  if (tld.length < 2) return null;

  // Now validate as URL with https:// prefix
  const normalized = normalizeUrl(lastWord);
  if (isValidUrl(normalized)) {
    const remainingText = words.slice(0, -1).join(' ');
    return {
      url: normalized,
      remainingText: remainingText,
    };
  }

  return null;
}
