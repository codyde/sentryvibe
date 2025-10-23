'use client';

import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TagBadge } from './TagBadge';
import { TagDropdown } from './TagDropdown';
import { AppliedTag } from '@sentryvibe/agent-core/types/tags';
import { TagOption } from '@sentryvibe/agent-core/config/tags';

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
    // Remove existing tag with same key (except for multi-value tags)
    const filteredTags = tags.filter(t => t.key !== key);

    // Create new tag
    const newTag: AppliedTag = {
      key,
      value,
      expandedValues,
      appliedAt: new Date()
    };

    onTagsChange([...filteredTags, newTag]);
  };

  const handleRemoveTag = (key: string) => {
    onTagsChange(tags.filter(t => t.key !== key));
  };

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      <span className="text-sm text-gray-400 font-mono">tags:</span>

      {/* Applied tags */}
      {tags.map(tag => (
        <TagBadge
          key={tag.key}
          tag={tag}
          onRemove={() => handleRemoveTag(tag.key)}
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
