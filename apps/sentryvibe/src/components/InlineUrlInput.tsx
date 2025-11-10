'use client';

import { useRef, KeyboardEvent, useMemo } from 'react';
import { UrlPreview } from './UrlPreview';
import { detectUrls, isPureUrl, isValidUrl, normalizeUrl } from '@/lib/url-utils';

interface InlineUrlInputProps {
  value: string;
  urls: string[];
  onChange: (value: string) => void;
  onUrlsChange: (urls: string[]) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit?: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

interface TextSegment {
  type: 'text' | 'url';
  content: string;
}

export function InlineUrlInput({
  value,
  urls,
  onChange,
  onUrlsChange,
  onKeyDown,
  onSubmit,
  placeholder = 'What do you want to build?',
  disabled = false,
  className = '',
}: InlineUrlInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Parse text into segments for rendering
  const segments = useMemo(() => {
    if (!value) return [];

    const detectedUrls = detectUrls(value);
    if (detectedUrls.length === 0) return [];

    const segments: TextSegment[] = [];
    let remaining = value;
    let position = 0;

    detectedUrls.forEach((url) => {
      const index = remaining.indexOf(url);
      if (index === -1) return;

      // Add text before URL
      if (index > 0) {
        segments.push({
          type: 'text',
          content: remaining.substring(0, index),
        });
      }

      // Add URL
      segments.push({
        type: 'url',
        content: normalizeUrl(url),
      });

      // Continue with text after URL
      remaining = remaining.substring(index + url.length);
    });

    // Add any remaining text
    if (remaining) {
      segments.push({
        type: 'text',
        content: remaining,
      });
    }

    return segments;
  }, [value]);

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = e.clipboardData.getData('text');

    // Just let it paste normally - we'll detect URLs on render
    // No special handling needed
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Backspace with empty value - remove last URL from urls array if needed
    if (e.key === 'Backspace' && !value && urls.length > 0) {
      e.preventDefault();
      onUrlsChange(urls.slice(0, -1));
      return;
    }

    // Enter without Shift - submit
    if (e.key === 'Enter' && !e.shiftKey && onSubmit) {
      e.preventDefault();
      onSubmit();
      return;
    }

    // Pass through
    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  const removeUrl = (urlToRemove: string) => {
    // Remove URL from the text value
    const newValue = value.replace(urlToRemove, '').trim();
    onChange(newValue);

    // Also remove from URLs array
    onUrlsChange(urls.filter(url => url !== urlToRemove));

    // Focus textarea
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

  // If no URLs detected, show regular textarea
  if (segments.length === 0) {
    return (
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={`flex-1 min-w-[200px] bg-transparent text-white placeholder-gray-500 focus:outline-none text-xl font-light resize-none ${className}`}
        style={{
          minHeight: '60px',
          lineHeight: '1.5',
        }}
        rows={1}
      />
    );
  }

  // Render segments with URL chips
  return (
    <div className="flex flex-wrap items-center gap-2 w-full relative">
      {/* Hidden textarea for actual editing */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className="absolute inset-0 opacity-0 pointer-events-auto cursor-text"
        style={{
          minHeight: '60px',
          lineHeight: '1.5',
        }}
        rows={1}
      />

      {/* Visual representation with chips */}
      <div className="flex flex-wrap items-center gap-2 w-full pointer-events-none">
        {segments.map((segment, index) => {
          if (segment.type === 'url') {
            return (
              <div key={`url-${index}`} className="pointer-events-auto">
                <UrlPreview
                  url={segment.content}
                  onRemove={() => removeUrl(segment.content)}
                />
              </div>
            );
          }

          // Text segment
          return (
            <span
              key={`text-${index}`}
              className="text-xl font-light text-white whitespace-pre-wrap"
            >
              {segment.content}
            </span>
          );
        })}
      </div>

      {/* Placeholder when empty */}
      {!value && (
        <div className="absolute inset-0 pointer-events-none text-xl font-light text-gray-500">
          {placeholder}
        </div>
      )}
    </div>
  );
}
