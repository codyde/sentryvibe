'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CodeBlockProps {
  children: React.ReactNode;
  className?: string;
}

export default function CodeBlock({ children, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const code = typeof children === 'string' ? children : extractTextFromChildren(children);
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const extractTextFromChildren = (node: React.ReactNode): string => {
    if (typeof node === 'string') return node;
    if (typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(extractTextFromChildren).join('');
    if (node && typeof node === 'object' && 'props' in node) {
      return extractTextFromChildren((node as any).props.children);
    }
    return '';
  };

  return (
    <div className="relative group">
      <pre className={`bg-[#181225] text-white p-4 rounded-lg overflow-x-auto border border-[#7553FF]/30 shadow-lg ${className}`}>
        {children}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-2 bg-[#7553FF]/80 hover:bg-[#7553FF] text-white rounded-md opacity-0 group-hover:opacity-100 transition-all duration-200 border border-[#7553FF]/50"
        title={copied ? 'Copied!' : 'Copy code'}
      >
        {copied ? (
          <Check className="w-4 h-4 text-[#92DD00]" />
        ) : (
          <Copy className="w-4 h-4" />
        )}
      </button>
    </div>
  );
}
