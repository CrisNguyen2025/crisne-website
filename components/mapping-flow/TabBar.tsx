import React, { useState, useRef, useEffect } from 'react';
import { MappingFlowTab } from './types';
import { cn } from '@/lib/utils';
import { Plus, X } from 'lucide-react';

interface TabBarProps {
  tabs: MappingFlowTab[];
  activeTabId: string;
  onTabSelect: (id: string) => void;
  onTabAdd: () => void;
  onTabRemove: (id: string) => void;
  onTabRename: (id: string, newName: string) => void;
}

export function TabBar({
  tabs,
  activeTabId,
  onTabSelect,
  onTabAdd,
  onTabRemove,
  onTabRename,
}: TabBarProps) {
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTabId && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingTabId]);

  const handleDoubleClick = (tab: MappingFlowTab) => {
    setEditingTabId(tab.id);
    setEditName(tab.name);
  };

  const handleRenameSubmit = () => {
    if (editingTabId && editName.trim()) {
      onTabRename(editingTabId, editName.trim());
    }
    setEditingTabId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      setEditingTabId(null);
    }
  };

  return (
    <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-2 bg-gray-100 dark:bg-gray-900 px-4 pt-2">
      <div className="flex flex-wrap items-center gap-2 flex-1">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              'group flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-md cursor-pointer transition-colors',
              activeTabId === tab.id
                ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-t border-x border-gray-200 dark:border-gray-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:hover:bg-gray-800'
            )}
            onClick={() => onTabSelect(tab.id)}
            onDoubleClick={() => handleDoubleClick(tab)}
          >
            {/* Color Dot */}
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: tab.color || '#3b82f6' }}
            />

            {editingTabId === tab.id ? (
              <input
                ref={inputRef}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleRenameSubmit}
                onKeyDown={handleKeyDown}
                className="bg-transparent border-none outline-none focus:ring-0 text-sm font-medium w-24 px-0 py-0 text-gray-900 dark:text-gray-100"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="truncate max-w-[120px]">{tab.name}</span>
            )}

            {tabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTabRemove(tab.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-opacity ml-1"
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={onTabAdd}
          className="p-1.5 ml-1 text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-md transition-colors"
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}

