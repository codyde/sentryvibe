'use client';

import { useRef, KeyboardEvent } from 'react';
import { UrlPreview } from './UrlPreview';
import { isPureUrl, isValidUrl, extractTrailingUrl, normalizeUrl } from '@/lib/url-utils';

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

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = e.clipboardData.getData('text');

    // Normalize the URL if it's a pure URL
    if (isPureUrl(pastedText)) {
      const normalizedUrl = normalizeUrl(pastedText);
      if (isValidUrl(normalizedUrl)) {
        e.preventDefault();

        // Add URL to the list if not already there
        if (!urls.includes(normalizedUrl)) {
          onUrlsChange([...urls, normalizedUrl]);
        }

        // Focus back on textarea
        setTimeout(() => {
          textareaRef.current?.focus();
        }, 0);
      }
    }
  };

  const checkForUrlInText = (text: string) => {
    const result = extractTrailingUrl(text);
    if (result) {
      const { url, remainingText } = result;

      // Add URL to the list if not already there
      if (!urls.includes(url)) {
        onUrlsChange([...urls, url]);
        // Keep the remaining text (everything before the URL)
        onChange(remainingText);
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // If space is pressed, check for URL at the end
    if (e.key === ' ' && value.trim()) {
      // Check if what's currently in the input ends with a URL
      checkForUrlInText(value + ' ');
    }

    // If backspace and textarea is empty, remove last URL
    if (e.key === 'Backspace' && !value && urls.length > 0) {
      e.preventDefault();
      const newUrls = urls.slice(0, -1);
      onUrlsChange(newUrls);
      return;
    }

    // If Enter without Shift, submit
    if (e.key === 'Enter' && !e.shiftKey && onSubmit) {
      e.preventDefault();
      onSubmit();
      return;
    }

    // Pass through to parent handler
    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  const removeUrl = (urlToRemove: string) => {
    onUrlsChange(urls.filter(url => url !== urlToRemove));
    // Focus back on textarea
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

  return (
    <div className="flex flex-wrap items-start gap-2 w-full">
      {/* Text Input - First */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        placeholder={urls.length === 0 ? placeholder : ''}
        disabled={disabled}
        className={`flex-1 min-w-[200px] bg-transparent text-white placeholder-gray-500 focus:outline-none text-xl font-light resize-none ${className}`}
        style={{
          minHeight: '60px',
          lineHeight: '1.5',
        }}
        rows={1}
      />

      {/* URL Chips - After text */}
      {urls.map((url) => (
        <div key={url} className="flex-shrink-0">
          <UrlPreview
            url={url}
            onRemove={() => removeUrl(url)}
          />
        </div>
      ))}
    </div>
  );
}
