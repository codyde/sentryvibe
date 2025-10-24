'use client';

import React from 'react';
import { Plus, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TagBadge } from './TagBadge';
import { TagDropdown } from './TagDropdown';
import { AppliedTag } from '@sentryvibe/agent-core/types/tags';
import { TagOption, findTagDefinition } from '@sentryvibe/agent-core/config/tags';
import { validateTagSet } from '@sentryvibe/agent-core/lib/tags/resolver';

interface TagInputProps {
  tags: AppliedTag[];
  onTagsChange: (tags: AppliedTag[]) => void;
  runnerOptions?: TagOption[];
  className?: string;
  prompt?: string; // User's project prompt for AI suggestions
}

export function TagInput({
  tags,
  onTagsChange,
  runnerOptions,
  className = '',
  prompt
}: TagInputProps) {
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = React.useState(false);
  const [validationErrors, setValidationErrors] = React.useState<string[]>([]);

  const handleAddTag = (key: string, value: string, expandedValues?: Record<string, string>) => {
    const def = findTagDefinition(key);

    // For multi-select tags, check if this value already exists
    if (def?.allowMultiple) {
      const existingTag = tags.find(t => t.key === key && t.value === value);
      if (existingTag) {
        // Don't add duplicate
        return;
      }
      // Add to existing tags without removing others with same key
    } else {
      // For single-value tags, remove existing tag with same key
      const filteredTags = tags.filter(t => t.key !== key);
      const newTag: AppliedTag = {
        key,
        value,
        expandedValues,
        appliedAt: new Date()
      };
      onTagsChange([...filteredTags, newTag]);
      return;
    }

    // Create new tag for multi-select
    const newTag: AppliedTag = {
      key,
      value,
      expandedValues,
      appliedAt: new Date()
    };

    onTagsChange([...tags, newTag]);
  };

  const handleRemoveTag = (key: string, value?: string) => {
    if (value) {
      // Remove specific tag by key AND value (for multi-select)
      onTagsChange(tags.filter(t => !(t.key === key && t.value === value)));
    } else {
      // Remove by key only
      onTagsChange(tags.filter(t => t.key !== key));
    }
  };

  // Validate tags whenever they change
  React.useEffect(() => {
    if (tags.length === 0) {
      setValidationErrors([]);
      return;
    }

    const validation = validateTagSet(tags);
    setValidationErrors(validation.errors);
  }, [tags]);

  // AI-powered tag suggestions
  const handleSuggestTags = async () => {
    if (!prompt || prompt.trim().length === 0) {
      return;
    }

    setIsLoadingSuggestions(true);

    try {
      const response = await fetch('/api/tags/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });

      if (!response.ok) {
        throw new Error('Failed to get tag suggestions');
      }

      const { tags: suggestedTags } = await response.json();

      // Apply suggested tags
      if (Array.isArray(suggestedTags) && suggestedTags.length > 0) {
        const newTags = suggestedTags.map((tag: any) => ({
          key: tag.key,
          value: tag.value,
          expandedValues: tag.expandedValues,
          appliedAt: new Date()
        }));
        onTagsChange(newTags);
      }
    } catch (error) {
      console.error('[TagInput] Failed to get tag suggestions:', error);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-gray-400 font-mono">tags:</span>

        {/* Applied tags */}
        {tags.map((tag, index) => (
          <TagBadge
            key={`${tag.key}-${tag.value}-${index}`}
            tag={tag}
            onRemove={() => handleRemoveTag(tag.key, tag.value)}
          />
        ))}

        {/* Add tag button */}
        <TagDropdown
          open={dropdownOpen}
          onOpenChange={setDropdownOpen}
          onSelectTag={handleAddTag}
          runnerOptions={runnerOptions}
        >
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 bg-gray-800 border-gray-700 hover:bg-gray-700 hover:border-gray-600 font-mono text-xs"
          >
            <Plus className="w-3 h-3 mr-1" />
            Add Tag
          </Button>
        </TagDropdown>

        {/* AI suggestion button */}
        {prompt && prompt.trim().length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleSuggestTags}
            disabled={isLoadingSuggestions}
            className="h-7 px-2 bg-purple-900/20 border-purple-700/50 hover:bg-purple-800/30 hover:border-purple-600 font-mono text-xs text-purple-300"
          >
            {isLoadingSuggestions ? (
              <>
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                Suggesting...
              </>
            ) : (
              <>
                <Sparkles className="w-3 h-3 mr-1" />
                Suggest Tags
              </>
            )}
          </Button>
        )}
      </div>

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="mt-2 text-xs text-red-400 space-y-1">
          {validationErrors.map((error, i) => (
            <div key={i} className="flex items-start gap-1">
              <span className="text-red-500">⚠</span>
              <span>{error}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
