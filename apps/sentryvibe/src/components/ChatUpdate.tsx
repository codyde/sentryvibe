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
      ? 'bg-gradient-to-br from-purple-600/35 via-purple-600/25 to-purple-400/15 border-purple-400/40 text-white'
      : 'bg-zinc-900/70 border-zinc-700 text-zinc-100';

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
  const textContent = content || textParts.map(p => p.text).join('\n') || '';

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
              em: ({ children }) => <em className="text-purple-200">{children}</em>,
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
                <code className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-200 font-mono text-xs">
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
