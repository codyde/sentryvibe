'use client';

import { useRef, KeyboardEvent, useEffect } from 'react';
import { detectUrls, normalizeUrl } from '@/lib/url-utils';

interface InlineUrlInputProps {
  value: string;
  urls: string[];
  onChange: (value: string) => void;
  onUrlsChange: (urls: string[]) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
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
  const editorRef = useRef<HTMLDivElement>(null);
  const isProcessingRef = useRef(false);

  // Sync external value changes to contentEditable
  useEffect(() => {
    if (!editorRef.current || isProcessingRef.current) return;

    const currentText = getPlainText();
    if (currentText !== value) {
      renderFormattedContent(value);
    }
  }, [value]);

  const getPlainText = (): string => {
    if (!editorRef.current) return '';
    return editorRef.current.textContent || '';
  };

  const renderFormattedContent = (text: string) => {
    if (!editorRef.current) return;

    const detectedUrls = detectUrls(text);
    if (detectedUrls.length === 0) {
      editorRef.current.textContent = text;
      return;
    }

    // Build HTML with styled URL spans
    let html = text;
    const urlsToTrack: string[] = [];

    detectedUrls.forEach((url) => {
      const normalizedUrl = normalizeUrl(url);
      urlsToTrack.push(normalizedUrl);

      // Replace URL with styled span
      const styledSpan = `<span class="inline-flex items-center gap-1 px-2 py-1 mx-1 bg-accent/50 rounded-md border border-border text-sm font-medium text-foreground" contenteditable="false" data-url="${normalizedUrl}">${url}</span>`;
      html = html.replace(url, styledSpan);
    });

    editorRef.current.innerHTML = html;

    // Update URLs list
    onUrlsChange(urlsToTrack);

    // Move cursor to end
    moveCursorToEnd();
  };

  const moveCursorToEnd = () => {
    if (!editorRef.current) return;

    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(editorRef.current);
    range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  const handleInput = () => {
    if (isProcessingRef.current) return;

    const text = getPlainText();
    onChange(text);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Space pressed - check for URLs
    if (e.key === ' ') {
      setTimeout(() => {
        isProcessingRef.current = true;
        const text = getPlainText();
        renderFormattedContent(text);
        isProcessingRef.current = false;
      }, 0);
    }

    // Enter without Shift - submit
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

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);

    // Check for URLs after paste
    setTimeout(() => {
      isProcessingRef.current = true;
      const currentText = getPlainText();
      renderFormattedContent(currentText);
      isProcessingRef.current = false;
    }, 0);
  };

  return (
    <div className="flex-1 min-w-[200px] relative">
      <div
        ref={editorRef}
        contentEditable={!disabled}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        className={`w-full min-h-[60px] bg-transparent text-white placeholder-gray-500 focus:outline-none text-xl font-light ${className}`}
        style={{
          lineHeight: '1.5',
        }}
        data-placeholder={placeholder}
        suppressContentEditableWarning
      />

      {/* Placeholder styling */}
      <style jsx>{`
        [contenteditable][data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: rgb(107, 114, 128);
          pointer-events: none;
          position: absolute;
        }
      `}</style>
    </div>
  );
}
