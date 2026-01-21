'use client';

import { useState } from 'react';
import { ChevronRight, ChevronLeft, Cpu, Layout, Zap, Palette, Sparkles, Paintbrush, Sliders } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card';
import { Button } from '@/components/ui/button';
import { TAG_DEFINITIONS, TagDefinition, TagOption } from '@sentryvibe/agent-core/config/tags';
import { ColorPickerTag } from './ColorPickerTag';
import { BrandThemePreview } from './BrandThemePreview';
import { FrameworkPreview } from './FrameworkPreview';
import { useAuth } from '@/contexts/AuthContext';

interface TagDropdownProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTag: (key: string, value: string, expandedValues?: Record<string, string>) => void;
  // Runner options populated dynamically
  runnerOptions?: TagOption[];
  children: React.ReactNode;
  // If provided, opens directly to the options for this tag key (for replacement)
  existingTagKey?: string;
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
  children,
  existingTagKey
}: TagDropdownProps) {
  const { isLocalMode } = useAuth();
  
  // Get tag definitions with runner options injected
  // In local mode, hide the runner tag since it's fixed to 'local'
  // MUST be defined before getInitialView() to avoid TDZ error
  const getTagDefinitions = () => {
    return TAG_DEFINITIONS
      .filter(def => !(isLocalMode && def.key === 'runner')) // Hide runner tag in local mode
      .map(def => {
        if (def.key === 'runner') {
          return { ...def, options: runnerOptions };
        }
        return def;
      });
  };

  const getInitialView = (): ViewState[] => {
    if (existingTagKey) {
      const def = getTagDefinitions().find(d => d.key === existingTagKey);
      if (def) {
        // If it's a top-level tag with options, go directly to select view
        if (def.inputType === 'select' || def.inputType === 'multi-select') {
          return [{ type: 'select', definition: def }];
        }
        // If it's a nested tag (like design/brand), navigate through the hierarchy
        if (def.inputType === 'nested') {
          return [{ type: 'nested', definition: def }];
        }
      } else {
        // Check if it's a nested tag (child of another tag)
        for (const parentDef of getTagDefinitions()) {
          if (parentDef.children) {
            const childDef = parentDef.children.find(c => c.key === existingTagKey);
            if (childDef) {
              // Navigate to parent, then to child
              if (childDef.inputType === 'select') {
                return [{ type: 'nested', definition: parentDef }, { type: 'select', definition: childDef }];
              } else if (childDef.inputType === 'color') {
                return [{ type: 'nested', definition: parentDef }, { type: 'color', definition: childDef }];
              } else if (childDef.inputType === 'nested' && childDef.children) {
                // Double-nested case (e.g., design -> customize -> primaryColor)
                return [{ type: 'nested', definition: parentDef }, { type: 'nested', definition: childDef }];
              }
            }
            // Check for double-nested tags (e.g., design -> customize -> primaryColor)
            if (parentDef.children) {
              for (const midDef of parentDef.children) {
                if (midDef.children) {
                  const grandchildDef = midDef.children.find(c => c.key === existingTagKey);
                  if (grandchildDef) {
                    if (grandchildDef.inputType === 'select') {
                      return [
                        { type: 'nested', definition: parentDef },
                        { type: 'nested', definition: midDef },
                        { type: 'select', definition: grandchildDef }
                      ];
                    } else if (grandchildDef.inputType === 'color') {
                      return [
                        { type: 'nested', definition: parentDef },
                        { type: 'nested', definition: midDef },
                        { type: 'color', definition: grandchildDef }
                      ];
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    return [{ type: 'main' }];
  };

  const [viewStack, setViewStack] = useState<ViewState[]>(getInitialView());

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
    setViewStack(getInitialView());
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

  // Get icon for tag category or specific tag key
  const getCategoryIcon = (category: string, key?: string) => {
    // Handle specific tag keys first (for nested design options)
    if (key === 'brand') {
      return <Sparkles className="w-5 h-5 text-gray-400" />;
    }
    if (key === 'style') {
      return <Paintbrush className="w-5 h-5 text-gray-400" />;
    }
    if (key === 'customize') {
      return <Sliders className="w-5 h-5 text-gray-400" />;
    }

    // Fall back to category icons
    switch (category) {
      case 'model':
        return <Cpu className="w-5 h-5 text-gray-400" />;
      case 'framework':
        return <Layout className="w-5 h-5 text-gray-400" />;
      case 'runner':
        return <Zap className="w-5 h-5 text-gray-400" />;
      case 'design':
        return <Palette className="w-5 h-5 text-gray-400" />;
      default:
        return null;
    }
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
                } else if (def.inputType === 'select' || def.inputType === 'multi-select') {
                  pushView({ type: 'select', definition: def });
                }
              }}
              className="w-full flex items-center justify-between px-2 py-2 text-sm text-left rounded hover:bg-gray-800 transition-colors group"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {getCategoryIcon(def.category, def.key)}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-200">{def.label}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{def.description}</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-gray-300 shrink-0 ml-2" />
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

        {/* Options */}
        <div className="p-1 space-y-1 max-h-80 overflow-y-auto">
          {def.options?.map(option => {
            // Check if this is a brand option with theme values
            const isBrandOption = def.key === 'brand' && option.values;
            // Check if this is a framework option
            const isFrameworkOption = def.key === 'framework' && option.repository;

            const optionButton = (
              <button
                key={option.value}
                onClick={() => handleSelectOption(def, option)}
                className="w-full px-2 py-2 text-sm text-left rounded hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {option.logo && (
                    <img
                      src={option.logo}
                      alt={`${option.label} logo`}
                      className="w-5 h-5 object-contain shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-200">{option.label}</div>
                    {option.description && (
                      <div className="text-xs text-gray-400 mt-0.5">{option.description}</div>
                    )}
                  </div>
                </div>
              </button>
            );

            // Wrap brand options with HoverCard
            if (isBrandOption) {
              return (
                <HoverCard key={option.value} openDelay={1000} closeDelay={100}>
                  <HoverCardTrigger asChild>
                    {optionButton}
                  </HoverCardTrigger>
                  <HoverCardContent
                    side="right"
                    align="start"
                    className="bg-gray-900 border-gray-800 w-auto min-w-96 max-w-[480px]"
                  >
                    <BrandThemePreview 
                      brand={{
                        label: option.label,
                        values: option.values as {
                          primaryColor: string;
                          secondaryColor: string;
                          accentColor: string;
                          neutralLight: string;
                          neutralDark: string;
                        } | undefined
                      }} 
                    />
                  </HoverCardContent>
                </HoverCard>
              );
            }

            // Wrap framework options with HoverCard
            if (isFrameworkOption) {
              return (
                <HoverCard key={option.value} openDelay={1000} closeDelay={100}>
                  <HoverCardTrigger asChild>
                    {optionButton}
                  </HoverCardTrigger>
                  <HoverCardContent
                    side="right"
                    align="start"
                    className="bg-gray-900 border-gray-800 w-auto min-w-96 max-w-[480px]"
                  >
                    <FrameworkPreview framework={option} />
                  </HoverCardContent>
                </HoverCard>
              );
            }

            // Return regular button for non-brand/non-framework options
            return optionButton;
          })}
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
                } else if (child.inputType === 'nested' && child.children) {
                  // Handle double-nested tags (e.g., design -> customize -> colors/fonts)
                  pushView({ type: 'nested', definition: child });
                }
              }}
              className="w-full flex items-center justify-between px-2 py-2 text-sm text-left rounded hover:bg-gray-800 transition-colors group"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {getCategoryIcon(child.category, child.key)}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-200">{child.label}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{child.description}</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-gray-300 shrink-0 ml-2" />
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
    <Popover open={open} onOpenChange={(openState) => {
      onOpenChange(openState);
      if (!openState) {
        resetViews();
      } else if (openState && existingTagKey) {
        // When opening for replacement, reset to the initial view for that tag
        setViewStack(getInitialView());
      }
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
