/**
 * URL detection and parsing utilities
 */

const URL_REGEX = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;

/**
 * Detects URLs in text
 */
export function detectUrls(text: string): string[] {
  const matches = text.match(URL_REGEX);
  return matches || [];
}

/**
 * Checks if text contains a URL
 */
export function containsUrl(text: string): boolean {
  return URL_REGEX.test(text);
}

/**
 * Validates if a string is a valid URL
 */
export function isValidUrl(urlString: string): boolean {
  try {
    new URL(urlString);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extracts URL from pasted content
 */
export function extractUrlFromPaste(text: string): string | null {
  const urls = detectUrls(text);
  return urls.length > 0 ? urls[0] : null;
}

/**
 * Checks if the pasted text is just a URL (and nothing else)
 */
export function isPureUrl(text: string): boolean {
  const trimmed = text.trim();
  const urls = detectUrls(trimmed);

  if (urls.length !== 1) {
    return false;
  }

  return trimmed === urls[0];
}
