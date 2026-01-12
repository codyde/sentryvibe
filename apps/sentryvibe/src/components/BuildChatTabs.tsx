'use client';

import { useState } from 'react';
import { MessageSquare, ListTodo } from 'lucide-react';
import { motion } from 'framer-motion';

interface Tab {
  id: 'chat' | 'build';
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const tabs: Tab[] = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'build', label: 'Build', icon: ListTodo },
];

interface BuildChatTabsProps {
  activeTab: 'chat' | 'build';
  onTabChange: (tab: 'chat' | 'build') => void;
  chatContent: React.ReactNode;
  buildContent: React.ReactNode;
}

export function BuildChatTabs({ activeTab, onTabChange, chatContent, buildContent }: BuildChatTabsProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Tab Headers */}
      <div className="flex border-b border-white/10 bg-black/20">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`
                relative flex items-center gap-2 px-6 py-3 text-sm font-medium
                transition-colors duration-200
                ${
                  isActive
                    ? 'text-white'
                    : 'text-gray-400 hover:text-gray-300'
                }
              `}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-theme-primary' : ''}`} />
              <span>{tab.label}</span>

              {/* Active indicator */}
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-theme-gradient"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'chat' && chatContent}
        {activeTab === 'build' && buildContent}
      </div>
    </div>
  );
}
