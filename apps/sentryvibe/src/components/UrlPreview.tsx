'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, X } from 'lucide-react';

interface UrlMetadata {
  url: string;
  title: string;
  description?: string;
  image?: string;
  favicon?: string;
}

interface UrlPreviewProps {
  url: string;
  onRemove?: () => void;
  className?: string;
}

export function UrlPreview({ url, onRemove, className = '' }: UrlPreviewProps) {
  const [metadata, setMetadata] = useState<UrlMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewPosition, setPreviewPosition] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    fetchMetadata();
  }, [url]);

  useEffect(() => {
    if (showPreview && cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      setPreviewPosition({
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX + rect.width / 2,
      });
    }
  }, [showPreview]);

  const fetchMetadata = async () => {
    try {
      setLoading(true);
      setError(false);

      const response = await fetch('/api/url-metadata', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch metadata');
      }

      const data = await response.json();
      setMetadata(data);
    } catch (err) {
      console.error('Error fetching URL metadata:', err);
      setError(true);
      // Use URL as fallback
      setMetadata({
        url,
        title: url,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleMouseEnter = () => {
    setShowPreview(true);
  };

  const handleMouseLeave = () => {
    setShowPreview(false);
  };

  if (loading) {
    return (
      <div className={`inline-flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-md border border-border/50 ${className}`}>
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="text-sm text-muted-foreground">Loading URL...</span>
      </div>
    );
  }

  if (!metadata) {
    return null;
  }

  // Truncate title to 15 characters
  const displayTitle = metadata.title.length > 15
    ? metadata.title.substring(0, 15) + '...'
    : metadata.title;

  const previewContent = showPreview && mounted && (
    <div
      ref={previewRef}
      className="fixed z-[9999] w-80 bg-popover border border-border rounded-lg shadow-xl overflow-hidden animate-in fade-in-0 zoom-in-95"
      style={{
        top: `${previewPosition.top}px`,
        left: `${previewPosition.left}px`,
        transform: 'translateX(-50%)',
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {metadata.image && (
        <div className="w-full h-40 bg-muted overflow-hidden">
          <img
            src={metadata.image}
            alt={metadata.title}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.parentElement!.style.display = 'none';
            }}
          />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start gap-2 mb-2">
          {metadata.favicon && (
            <img
              src={metadata.favicon}
              alt=""
              className="h-5 w-5 flex-shrink-0 mt-0.5"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
          <h3 className="font-semibold text-sm text-foreground line-clamp-2">
            {metadata.title}
          </h3>
        </div>
        {metadata.description && (
          <p className="text-xs text-muted-foreground line-clamp-3 mb-3">
            {metadata.description}
          </p>
        )}
        <a
          href={metadata.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline flex items-center gap-1 truncate"
        >
          <ExternalLink className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{metadata.url}</span>
        </a>
      </div>
    </div>
  );

  return (
    <>
      <div className="inline-block">
        <div
          ref={cardRef}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className={`inline-flex items-center gap-2 px-3 py-2 bg-accent/50 rounded-md border border-border hover:border-primary/50 transition-colors cursor-pointer group ${className}`}
        >
          {metadata.favicon && !error && (
            <img
              src={metadata.favicon}
              alt=""
              className="h-4 w-4 flex-shrink-0"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
          <span className="text-sm font-medium text-foreground truncate">
            {displayTitle}
          </span>
          <ExternalLink className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
          {onRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="ml-1 p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              aria-label="Remove URL"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Hover Preview - Rendered at document.body level using Portal */}
      {mounted && previewContent && createPortal(previewContent, document.body)}
    </>
  );
}
