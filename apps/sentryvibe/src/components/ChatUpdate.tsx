'use client';

import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import ImageAttachment from './ImageAttachment';

interface MessagePart {
  type: string;
  text?: string;
  image?: string;
  mimeType?: string;
  fileName?: string;
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  state?: string;
}

interface ChatUpdateProps {
  content?: string;
  parts?: MessagePart[];
  align?: 'left' | 'right';
  tone?: 'user' | 'agent';
  variant?: 'live' | 'history';
  timestamp?: string | null;
  className?: string;
}

export default function ChatUpdate({
  content,
  parts,
  align = 'left',
  tone = 'user',
  variant = 'live',
  timestamp,
  className,
}: ChatUpdateProps) {
  const baseBubble =
    'max-w-[80%] w-full rounded-2xl border px-5 py-4 shadow-lg shadow-black/20 transition-all';

  const toneClasses =
    tone === 'user'
      ? 'chat-user-theme text-white'
      : 'chat-agent-theme text-zinc-100';

  const variantClasses =
    variant === 'history'
      ? 'opacity-90 shadow-md shadow-black/10 backdrop-blur-sm'
      : 'backdrop-blur';

  const containerClasses = cn(
    baseBubble,
    toneClasses,
    variantClasses,
    align === 'right' ? 'ml-auto text-left' : 'mr-auto text-left',
    className
  );

  // Extract images and text from parts
  const imageParts = parts?.filter(p => p.type === 'image') || [];
  const textParts = parts?.filter(p => p.type === 'text') || [];
  const toolParts = parts?.filter(p => p.toolName) || [];
  const textContent = content || textParts.map(p => p.text).join('\n') || '';
  const renderData = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  };

  return (
    <div className={containerClasses}>
      {/* Display image parts */}
      {imageParts.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {imageParts.map((part, idx) => (
            <ImageAttachment
              key={idx}
              fileName={part.fileName || 'image.png'}
              imageSrc={part.image || ''}
              showRemove={false}
            />
          ))}
        </div>
      )}

      {/* Display text content */}
      {textContent && (
        <div className={cn('prose prose-sm prose-invert max-w-none')}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={{
              p: ({ children }) => (
                <p className="text-gray-200 leading-relaxed mb-2 last:mb-0">{children}</p>
              ),
              strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
              em: ({ children }) => <em className="text-theme-primary">{children}</em>,
              ul: ({ children }) => (
                <ul className={cn('list-disc space-y-1', align === 'right' ? 'pl-0 pr-4' : 'pl-4')}>
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className={cn('list-decimal space-y-1', align === 'right' ? 'pl-0 pr-4' : 'pl-4')}>
                  {children}
                </ol>
              ),
              li: ({ children }) => <li className="text-sm text-gray-200">{children}</li>,
              code: ({ children }) => (
                <code className="px-1.5 py-0.5 rounded bg-theme-primary-muted text-theme-primary font-mono text-xs">
                  {children}
                </code>
              ),
              h1: ({ children }) => <h1 className="text-lg font-bold text-white mt-3 mb-2">{children}</h1>,
              h2: ({ children }) => <h2 className="text-base font-bold text-white mt-2 mb-1.5">{children}</h2>,
              h3: ({ children }) => <h3 className="text-sm font-semibold text-gray-200 mt-2 mb-1">{children}</h3>,
            }}
          >
            {textContent}
          </ReactMarkdown>
        </div>
      )}

      {toolParts.length > 0 && (
        <div className="mt-3 space-y-3">
          {toolParts.map((part, idx) => (
            <div
              key={`${part.toolCallId || part.toolName || idx}-${idx}`}
              className="rounded-xl border border-white/15 bg-black/30 p-3 text-sm text-gray-200"
            >
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-gray-400">
                <span>{part.toolName || 'Tool call'}</span>
                <span>
                  {part.state === 'output-available' ? 'Result' : 'Input'}
                </span>
              </div>
              {part.state !== 'output-available' && part.input && (
                <pre className="mt-2 max-h-60 overflow-auto rounded-md bg-black/40 p-2 text-[11px] text-gray-100 whitespace-pre-wrap">
                  {renderData(part.input)}
                </pre>
              )}
              {part.state === 'output-available' && part.output && (
                <pre className="mt-2 max-h-60 overflow-auto rounded-md bg-black/40 p-2 text-[11px] text-gray-100 whitespace-pre-wrap">
                  {renderData(part.output)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

      {timestamp && (
        <div
          className={cn(
            'mt-3 flex text-[11px] font-medium text-zinc-400',
            tone === 'user' ? 'justify-end' : 'justify-start'
          )}
        >
          <span>{timestamp}</span>
        </div>
      )}
    </div>
  );
}
