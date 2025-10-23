'use client';

import { X } from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { AppliedTag } from '@sentryvibe/agent-core/types/tags';
import { findTagDefinition } from '@sentryvibe/agent-core/config/tags';

interface TagBadgeProps {
  tag: AppliedTag;
  onRemove: () => void;
}

export function TagBadge({ tag, onRemove }: TagBadgeProps) {
  const def = findTagDefinition(tag.key);

  if (!def) return null;

  // Render color value with swatch
  const renderColorValue = (color: string) => (
    <span className="inline-flex items-center gap-1">
      <span className="text-gray-400">{color}</span>
      <span
        className="inline-block w-3 h-3 rounded border border-gray-600"
        style={{ backgroundColor: color }}
      />
    </span>
  );

  // Render badge content based on tag type
  const renderValue = () => {
    if (def.inputType === 'color') {
      return renderColorValue(tag.value);
    }
    return <span className="text-gray-400">{tag.value}</span>;
  };

  // For brand tags, show expanded colors in hover card
  const shouldShowHoverCard = tag.key === 'brand' && tag.expandedValues;

  const badge = (
    <div className="inline-flex items-center gap-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm font-mono hover:border-gray-600 transition-colors">
      <span className="text-gray-300">{tag.key}:</span>
      {renderValue()}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="ml-1 text-gray-500 hover:text-gray-300 transition-colors"
        aria-label="Remove tag"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );

  if (!shouldShowHoverCard) {
    return badge;
  }

  // Show hover card for brand tags with expanded values
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        {badge}
      </HoverCardTrigger>
      <HoverCardContent className="w-80 bg-gray-900 border-gray-700">
        <div className="space-y-2">
          <h4 className="font-semibold text-sm text-gray-200">Brand Colors</h4>
          <div className="space-y-1 text-sm font-mono">
            {tag.expandedValues && Object.entries(tag.expandedValues).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-gray-400">{key}:</span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-300">{value}</span>
                  <span
                    className="inline-block w-4 h-4 rounded border border-gray-600"
                    style={{ backgroundColor: value }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Add individual color tags to override specific colors
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
