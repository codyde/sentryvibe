'use client';

import { useState } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { TAG_DEFINITIONS, TagDefinition, TagOption } from '@sentryvibe/agent-core/config/tags';
import { ColorPickerTag } from './ColorPickerTag';

interface TagDropdownProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTag: (key: string, value: string, expandedValues?: Record<string, string>) => void;
  // Runner options populated dynamically
  runnerOptions?: TagOption[];
  children: React.ReactNode;
}

type ViewState =
  | { type: 'main' }
  | { type: 'select'; definition: TagDefinition }
  | { type: 'nested'; definition: TagDefinition }
  | { type: 'color'; definition: TagDefinition };

export function TagDropdown({
  open,
  onOpenChange,
  onSelectTag,
  runnerOptions = [],
  children
}: TagDropdownProps) {
  const [viewStack, setViewStack] = useState<ViewState[]>([{ type: 'main' }]);

  const currentView = viewStack[viewStack.length - 1];

  const pushView = (view: ViewState) => {
    setViewStack([...viewStack, view]);
  };

  const popView = () => {
    if (viewStack.length > 1) {
      setViewStack(viewStack.slice(0, -1));
    }
  };

  const resetViews = () => {
    setViewStack([{ type: 'main' }]);
  };

  const handleSelectOption = (def: TagDefinition, option: TagOption) => {
    // If option has expanded values (brand theme), include them
    const expandedValues = option.values;
    onSelectTag(def.key, option.value, expandedValues);
    onOpenChange(false);
    resetViews();
  };

  const handleColorApply = (def: TagDefinition, color: string) => {
    onSelectTag(def.key, color);
    onOpenChange(false);
    resetViews();
  };

  // Get tag definitions with runner options injected
  const getTagDefinitions = () => {
    return TAG_DEFINITIONS.map(def => {
      if (def.key === 'runner') {
        return { ...def, options: runnerOptions };
      }
      return def;
    });
  };

  const renderMain = () => {
    const tagDefs = getTagDefinitions();

    return (
      <div className="w-full min-w-64">
        <div className="p-1 space-y-1">
          {tagDefs.map(def => (
            <button
              key={def.key}
              onClick={() => {
                if (def.inputType === 'nested' && def.children) {
                  pushView({ type: 'nested', definition: def });
                } else if (def.inputType === 'select') {
                  pushView({ type: 'select', definition: def });
                }
              }}
              className="w-full flex items-center justify-between px-2 py-2 text-sm text-left rounded hover:bg-gray-800 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-200">{def.label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{def.description}</div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-gray-300 flex-shrink-0 ml-2" />
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderSelect = (def: TagDefinition) => {
    return (
      <div className="w-full min-w-64">
        {/* Back button */}
        <div className="p-1 border-b border-gray-800">
          <button
            onClick={popView}
            className="flex items-center gap-2 px-2 py-1 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
        </div>

        {/* Header */}
        <div className="px-2 py-3 border-b border-gray-800">
          <h3 className="font-semibold text-sm text-gray-200">{def.label}</h3>
          <p className="text-xs text-gray-400 mt-1">{def.description}</p>
        </div>

        {/* Options */}
        <div className="p-1 space-y-1 max-h-80 overflow-y-auto">
          {def.options?.map(option => (
            <button
              key={option.value}
              onClick={() => handleSelectOption(def, option)}
              className="w-full px-2 py-2 text-sm text-left rounded hover:bg-gray-800 transition-colors"
            >
              <div className="font-medium text-gray-200">{option.label}</div>
              {option.description && (
                <div className="text-xs text-gray-400 mt-0.5">{option.description}</div>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderNested = (def: TagDefinition) => {
    return (
      <div className="w-full min-w-64">
        {/* Back button */}
        <div className="p-1 border-b border-gray-800">
          <button
            onClick={popView}
            className="flex items-center gap-2 px-2 py-1 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
        </div>

        {/* Header */}
        <div className="px-2 py-3 border-b border-gray-800">
          <h3 className="font-semibold text-sm text-gray-200">{def.label}</h3>
          <p className="text-xs text-gray-400 mt-1">{def.description}</p>
        </div>

        {/* Child options */}
        <div className="p-1 space-y-1">
          {def.children?.map(child => (
            <button
              key={child.key}
              onClick={() => {
                if (child.inputType === 'select') {
                  pushView({ type: 'select', definition: child });
                } else if (child.inputType === 'color') {
                  pushView({ type: 'color', definition: child });
                }
              }}
              className="w-full flex items-center justify-between px-2 py-2 text-sm text-left rounded hover:bg-gray-800 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-200">{child.label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{child.description}</div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-gray-300 flex-shrink-0 ml-2" />
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderColor = (def: TagDefinition) => {
    return (
      <div className="w-full min-w-72 max-w-80">
        {/* Back button */}
        <div className="p-1 border-b border-gray-800">
          <button
            onClick={popView}
            className="flex items-center gap-2 px-2 py-1 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
        </div>

        {/* Color picker */}
        <ColorPickerTag
          label={def.label}
          description={def.description}
          onApply={(color) => handleColorApply(def, color)}
          onCancel={() => {
            popView();
          }}
        />
      </div>
    );
  };

  const renderContent = () => {
    switch (currentView.type) {
      case 'main':
        return renderMain();
      case 'select':
        return renderSelect(currentView.definition);
      case 'nested':
        return renderNested(currentView.definition);
      case 'color':
        return renderColor(currentView.definition);
      default:
        return null;
    }
  };

  return (
    <Popover open={open} onOpenChange={(open) => {
      onOpenChange(open);
      if (!open) resetViews();
    }}>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent
        className="p-0 bg-gray-900 border-gray-800"
        align="start"
        side="top"
        sideOffset={8}
      >
        {renderContent()}
      </PopoverContent>
    </Popover>
  );
}
