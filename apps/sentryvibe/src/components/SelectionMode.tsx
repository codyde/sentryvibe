'use client';

import { useEffect, useRef } from 'react';
import { MousePointer2 } from 'lucide-react';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';

interface SelectedElement {
  selector: string;
  tagName: string;
  className: string;
  id: string;
  textContent: string;
  innerHTML: string;
  attributes: Record<string, string>;
  boundingRect: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  computedStyles: {
    backgroundColor: string;
    color: string;
    fontSize: string;
    fontFamily: string;
  };
}

interface SelectionModeProps {
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  onElementSelected: (element: SelectedElement, prompt: string) => void;
}

export default function SelectionMode({ isEnabled, onToggle, onElementSelected }: SelectionModeProps) {
  const hasProcessedRef = useRef<Set<string>>(new Set());

  // Listen for element selection from iframe
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {

      if (e.data.type === 'sentryvibe:element-selected') {
        const element = e.data.data;
        const elementKey = `${element.selector}-${element.clickPosition?.x}-${element.clickPosition?.y}`;

        // Prevent duplicate processing of same click
        if (hasProcessedRef.current.has(elementKey)) {
          console.warn('⚠️ Duplicate selection detected, ignoring');
          return;
        }

        hasProcessedRef.current.add(elementKey);

        // Clear after 1 second (allow re-selecting same element after delay)
        setTimeout(() => {
          hasProcessedRef.current.delete(elementKey);
        }, 1000);

        console.log('🎯 Processing element selection:', element);
        // Immediately create comment window (no modal)
        onElementSelected(element, '');
        onToggle(false); // Disable selection mode
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [onToggle, onElementSelected]);

  return (
    <HoverCard openDelay={300}>
      <HoverCardTrigger asChild>
        <button
          onClick={() => onToggle(!isEnabled)}
          className={`p-1.5 rounded-md transition-all ${
            isEnabled
              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50 hover:bg-purple-500/30'
              : 'hover:bg-white/10'
          }`}
        >
          <MousePointer2 className={`w-4 h-4 ${isEnabled ? 'text-purple-400' : 'text-gray-400'}`} />
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-auto bg-gray-900 border-white/20 text-xs text-gray-200" side="bottom">
        {isEnabled ? 'Click an element in the preview' : 'Select Element'}
      </HoverCardContent>
    </HoverCard>
  );
}
