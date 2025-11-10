'use client';

import { useRef, useEffect } from 'react';
import { detectUrls, normalizeUrl } from '@/lib/url-utils';

interface InlineUrlInputProps {
  value: string;
  urls: string[];
  onChange: (value: string) => void;
  onUrlsChange: (urls: string[]) => void;
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
  onSubmit,
  placeholder = 'What do you want to build?',
  disabled = false,
  className = '',
}: InlineUrlInputProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  // Apply URL styling after space or paste
  const applyUrlStyling = () => {
    if (!editorRef.current) return;

    const text = editorRef.current.textContent || '';
    const detectedUrls = detectUrls(text);

    if (detectedUrls.length === 0) {
      onChange(text);
      onUrlsChange([]);
      return;
    }

    // Build HTML with inline styled spans
    let html = text;
    const normalizedUrls: string[] = [];

    detectedUrls.forEach((url) => {
      const normalized = normalizeUrl(url);
      normalizedUrls.push(normalized);

      // Create inline styled span
      const styledUrl = `<span class="inline-block px-2 py-0.5 mx-0.5 bg-purple-500/20 text-purple-300 rounded border border-purple-500/30 text-sm font-medium">${url}</span>`;
      html = html.replace(url, styledUrl);
    });

    // Save cursor position
    const selection = window.getSelection();
    let cursorOffset = 0;
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      cursorOffset = range.startOffset;
    }

    // Update HTML
    editorRef.current.innerHTML = html;

    // Restore cursor
    try {
      const newRange = document.createRange();
      const sel = window.getSelection();
      if (editorRef.current.firstChild) {
        newRange.setStart(editorRef.current.firstChild, Math.min(cursorOffset, editorRef.current.textContent?.length || 0));
        newRange.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(newRange);
      }
    } catch (e) {
      // Cursor restoration failed, not critical
    }

    onChange(text);
    onUrlsChange(normalizedUrls);
  };

  const handleInput = () => {
    if (!editorRef.current) return;
    const text = editorRef.current.textContent || '';
    onChange(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === ' ') {
      // Delay to let the space character be inserted
      setTimeout(applyUrlStyling, 0);
    }

    if (e.key === 'Enter' && !e.shiftKey && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');

    // Insert as plain text
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      selection.deleteFromDocument();
      selection.getRangeAt(0).insertNode(document.createTextNode(text));
      selection.collapseToEnd();
    }

    // Apply URL styling
    setTimeout(applyUrlStyling, 0);
  };

  return (
    <div className="flex-1">
      <div
        ref={editorRef}
        contentEditable={!disabled}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        className={`w-full min-h-[60px] px-4 py-3 bg-transparent text-white text-xl font-light focus:outline-none ${className}`}
        style={{ lineHeight: '1.5' }}
        data-placeholder={placeholder}
        suppressContentEditableWarning
      />

      <style jsx>{`
        [contenteditable][data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: rgb(107, 114, 128);
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
