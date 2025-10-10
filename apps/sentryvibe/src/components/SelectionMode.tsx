'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MousePointer2, X, Send } from 'lucide-react';
import { Button } from './ui/button';

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

  console.log('🎨 SelectionMode rendered, isEnabled:', isEnabled);

  // Listen for element selection from iframe
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      console.log('📨 PostMessage received:', e.data.type);

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

    console.log('👂 Adding message listener...');
    window.addEventListener('message', handleMessage);
    return () => {
      console.log('👂 Removing message listener...');
      window.removeEventListener('message', handleMessage);
    };
  }, [onToggle, onElementSelected]);

  return (
    /* Selection Mode Toggle Button */
    <Button
      onClick={() => onToggle(!isEnabled)}
      variant="outline"
      size="sm"
      className={`gap-2 transition-all ${
        isEnabled
          ? 'bg-[#FF45A8]/30 text-white border-[#FF45A8]/50 hover:bg-[#FF45A8]/40 shadow-lg shadow-[#FF45A8]/20'
          : 'bg-[#FF45A8]/20 text-[#FF45A8] border-[#FF45A8]/40 hover:bg-[#FF45A8]/30'
      }`}
    >
      <MousePointer2 className="w-4 h-4" />
      {isEnabled ? 'Click an element...' : 'Edit Element'}
    </Button>
  );
}
