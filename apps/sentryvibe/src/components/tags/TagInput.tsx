'use client';

import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TagBadge } from './TagBadge';
import { TagDropdown } from './TagDropdown';
import { AppliedTag } from '@sentryvibe/agent-core/types/tags';
import { TagOption, findTagDefinition } from '@sentryvibe/agent-core/config/tags';

interface TagInputProps {
  tags: AppliedTag[];
  onTagsChange: (tags: AppliedTag[]) => void;
  runnerOptions?: TagOption[];
  className?: string;
}

export function TagInput({
  tags,
  onTagsChange,
  runnerOptions,
  className = ''
}: TagInputProps) {
  const [dropdownOpen, setDropdownOpen] = React.useState(false);

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

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
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
    </div>
  );
}
