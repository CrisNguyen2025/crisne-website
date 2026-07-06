'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { MappingFlowTab } from './types';
import { TabBar } from './TabBar';
import { Splitter, Modal, Input, Button, message } from 'antd';
import { Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';
import { LexicalEditor } from 'lexical';
import { ToolbarPlugin } from '@/components/ui/editor/plugins';

const Editor = dynamic(() => import('@/components/ui/editor/Editor'), {
  ssr: false,
  loading: () => (
    <div className="min-h-[300px] flex items-center justify-center text-gray-400 font-mono text-sm">
      Loading editor...
    </div>
  ),
});

const LOCAL_STORAGE_KEY = 'mapping_flow_data_v7';

const COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', 
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#f43f5e'
];

const BADGES = [
  'Endpoint',
  'UI Props',
  'Models Interface',
  'Models Enums',
  'Request',
  'Response',
  'Mapping',
  'Notes'
];

const getRandomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];

// Seed some initial formatted HTML for the default tab
const initialColumn1 = `
<h2>Public Competition List - Feat title</h2>
<h2>Endpoint</h2>
<p><code>GET /public/v1/competitions</code></p>
<h2>UI Props</h2>
<pre><code>interface CompetitionGridProps {
  competitions: PublicCompetitionListItem[];
  emptyTitle: string;
  emptyDescription: string;
  hrefBasePath?: string;
}

interface CompetitionCardProps {
  competition: PublicCompetitionListItem;
  href?: string;
  onClick?: () => void;
  className?: string;
}</code></pre>
<h2>Models Interface</h2>
<pre><code>interface PublicCompetitionListItem {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  triggerType: CompetitionTriggerType;
  startAt: string;
  endAt: string;
  totalWinFreeSpinsCount: number;
  totalWinAmount: number;
  title: string;
  subTitle: string;
  description: string;
  imageUrl: string;
  mobileImageUrl: string;
  components: CompetitionComponent[] | null;
}

type PublicCompetitionListResponse = IResponse&lt;PublicCompetitionListItem[]&gt;;</code></pre>
<h2>Models Enums</h2>
<pre><code>enum CompetitionFilterType {
  OnGoing = 'ONGOING',
  Upcoming = 'UPCOMING',
  Finished = 'FINISHED',
}

enum CompetitionTriggerType {
  LoginBased = 'LOGIN_BASED',
  RegistrationBased = 'REGISTRATION_BASED',
  DepositAmountBased = 'DEPOSIT_AMOUNT_BASED',
  DepositCountBased = 'DEPOSIT_COUNT_BASED',
  SpinsTurnoverBased = 'SPINS_TURNOVER_BASED',
  SpinsTurnoverBasedRealMoney = 'SPINS_TURNOVER_BASED_REAL_MONEY',
  SpinsTurnoverBasedBonusMoney = 'SPINS_TURNOVER_BASED_BONUS_MONEY',
  SpinsCountBased = 'SPINS_COUNT_BASED',
  SpinsCountRealMoneyBased = 'SPINS_COUNT_BASED_REAL_MONEY',
  CashbackBased = 'CASHBACK_BASED',
}</code></pre>
`;

const initialColumn2 = `
<h2>Request</h2>
<pre><code>type ListCompetitionRequest = {
  type: 'ONGOING' | 'UPCOMING' | 'FINISHED';
  page?: number;
  limit?: number;
  search?: string;
  filter?: unknown;
  orderBy?: string;
  orderType?: 'asc' | 'desc';
};</code></pre>
<p>Example: <code>GET /public/v1/competitions?type=ONGOING&amp;page=1&amp;limit=12</code></p>
<h2>Response</h2>
<pre><code>type PublicCompetitionListResponse = {
  data?: PublicCompetitionListItem[];
  paging?: {
    page: number;
    limit: number;
    total: number;
  };
  success?: boolean;
  errors?: ApiError[];
};</code></pre>
<p>Example:</p>
<pre><code>{
  "data": [
    {
      "id": "019f17be-4c4e-76d6-b7a8-2d99b43313f8",
      "tenantId": "573fa5ab-c584-4483-95b3-cd60fccf1267",
      "name": "compe 30 6",
      "slug": "compe-30-6",
      "triggerType": "LOGIN_BASED",
      "startAt": "2026-06-30T08:54:25Z",
      "endAt": "2026-07-09T23:00:00Z",
      "totalWinFreeSpinsCount": 0,
      "totalWinAmount": 0,
      "title": "",
      "subTitle": "",
      "description": "",
      "imageUrl": "CDN_NAME/public/.../Card-Square.png",
      "mobileImageUrl": "CDN_NAME/public/.../Card-Square-mobile.png",
      "components": null
    }
  ],
  "paging": {
    "page": 1,
    "limit": 12,
    "total": 4
  }
}</code></pre>
`;

const initialColumn3 = `
<h2>Mapping</h2>
<pre><code>function mapPublicCompetitionToCardViewModel(item: PublicCompetitionListItem): CompetitionCardViewModel {
  return {
    id: item.id,
    slug: item.slug,
    title: item.title || item.name,
    description: item.subTitle || item.description,
    imageSrc: item.imageUrl || item.mobileImageUrl,
    startAt: item.startAt,
    endAt: item.endAt,
    prizeAmount: item.totalWinAmount,
    freeSpinsCount: item.totalWinFreeSpinsCount,
    triggerType: item.triggerType,
    components: item.components,
  };
}</code></pre>
<h2>Notes (Tiếng Việt)</h2>
<ul>
  <li><span style="color: #eab308"><strong>WARNING1:</strong> Response từ BE đang dùng field <code>startAt</code>, <code>endAt</code>, <code>imageUrl</code>, <code>mobileImageUrl</code>, <code>totalWinAmount</code>; UI mock cũ từng dùng <code>startDate</code>, <code>endDate</code>, <code>imgSrc</code>, <code>prizes</code>. UI phải dùng field theo BE response mới.</span></li>
  <li><span style="color: #eab308"><strong>WARNING2:</strong> Các field <code>title</code>, <code>subTitle</code>, <code>description</code>, <code>imageUrl</code>, <code>mobileImageUrl</code> có thể là empty string. Cần fallback khi render.</span></li>
  <li><span style="color: #eab308"><strong>WARNING3:</strong> <code>components</code> có thể là <code>null</code>, không phải lúc nào cũng là array. Type phải là <code>CompetitionComponent[] | null</code>.</span></li>
  <li><span style="color: #eab308"><strong>CONFUSED1:</strong> Prefix endpoint chưa rõ. Screenshot hiển thị <code>/public/v1/competitions</code>, nhưng docs/code có thể dùng <code>/crm/public/v1/competitions</code>. Cần confirm BE/gateway.</span></li>
  <li><span style="color: #eab308"><strong>CONFUSED2:</strong> Rule chọn image theo device chưa rõ. Cần confirm desktop dùng <code>imageUrl</code>, mobile dùng <code>mobileImageUrl</code>, và fallback hai chiều như thế nào.</span></li>
  <li><span style="color: #eab308"><strong>CONFUSED3:</strong> Khi <code>totalWinAmount = 0</code> nhưng <code>totalWinFreeSpinsCount &gt; 0</code>, chưa rõ UI prize pool nên hiển thị tiền, free spins, hay cả hai. Cần BA confirm.</span></li>
  <li><span style="color: #ef4444"><strong>MISS1:</strong> List card hiện chưa render <code>components</code> metadata.</span></li>
  <li><span style="color: #ef4444"><strong>MISS2:</strong> List card hiện chưa render <code>triggerType</code>.</span></li>
  <li><span style="color: #ef4444"><strong>MISS3:</strong> List card hiện chưa render <code>totalWinFreeSpinsCount</code>.</span></li>
  <li><span style="color: #3b82f6"><strong>SUGGEST1:</strong> Nên thống nhất <code>CompetitionCard</code> nhận <code>CompetitionCardViewModel</code> thay vì nhận trực tiếp API response để tránh UI phụ thuộc BE shape.</span></li>
  <li><span style="color: #3b82f6"><strong>SUGGEST2:</strong> Nên có placeholder image khi cả <code>imageUrl</code> and <code>mobileImageUrl</code> đều empty.</span></li>
  <li><span style="color: #3b82f6"><strong>SUGGEST3:</strong> Nên có empty state copy riêng khi public list trả <code>data: []</code>.</span></li>
</ul>
`;

const defaultData: MappingFlowTab[] = [
  {
    id: 'tab-1',
    name: 'publicList',
    color: '#3b82f6',
    featureTitle: '## Public Competition List - Feat title',
    columnCount: 2,
    columns: [initialColumn1, initialColumn2, initialColumn3],
  },
];

export function MappingFlowContainer() {
  const [tabs, setTabs] = useState<MappingFlowTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [isClient, setIsClient] = useState(false);
  const [activeEditor, setActiveEditor] = useState<LexicalEditor | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [importText, setImportText] = useState('');

  useEffect(() => {
    setActiveEditor(null);
  }, [activeTabId]);

  useEffect(() => {
    setIsClient(true);
    const hash = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as MappingFlowTab[];
        if (parsed && parsed.length > 0) {
          setTabs(parsed);
          const matchedTab = parsed.find(t => t.id === hash || t.name === hash);
          setActiveTabId(matchedTab ? matchedTab.id : parsed[0].id);
        } else {
          setTabs(defaultData);
          const matchedTab = defaultData.find(t => t.id === hash || t.name === hash);
          setActiveTabId(matchedTab ? matchedTab.id : defaultData[0].id);
        }
      } catch (err) {
        console.error('Error parsing mapping flow data:', err);
        setTabs(defaultData);
        setActiveTabId(defaultData[0].id);
      }
    } else {
      setTabs(defaultData);
      const matchedTab = defaultData.find(t => t.id === hash || t.name === hash);
      setActiveTabId(matchedTab ? matchedTab.id : defaultData[0].id);
    }
  }, []);

  useEffect(() => {
    if (isClient && activeTabId) {
      window.location.hash = activeTabId;
    }
  }, [activeTabId, isClient]);

  useEffect(() => {
    if (isClient && tabs.length > 0) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(tabs));
    }
  }, [tabs, isClient]);



  const activeTab = tabs.find((t) => t.id === activeTabId);

  const updateActiveTab = useCallback(
    (updater: (tab: MappingFlowTab) => MappingFlowTab) => {
      setTabs((prev) =>
        prev.map((tab) => {
          if (tab.id === activeTabId) {
            return updater(tab);
          }
          return tab;
        })
      );
    },
    [activeTabId]
  );

  const handleAddTab = () => {
    const newId = `tab-${Date.now()}`;
    const defaultCol1 = `
<h2>Endpoint</h2>
<p><br></p>
<h2>UI Props</h2>
<p><br></p>
<h2>Models Interface</h2>
<p><br></p>
<h2>Models Enums</h2>
<p><br></p>
    `.trim();

    const defaultCol2 = `
<h2>Request</h2>
<p><br></p>
<h2>Response</h2>
<p><br></p>
<h2>Mapping</h2>
<p><br></p>
<h2>Notes</h2>
<p><br></p>
    `.trim();

    const newTab: MappingFlowTab = {
      id: newId,
      name: `New Flow ${tabs.length + 1}`,
      color: getRandomColor(),
      featureTitle: '## New Feature',
      columnCount: 2,
      columns: [defaultCol1, defaultCol2, '<p></p>'],
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
  };

  const handleRemoveTab = (id: string) => {
    setTabs((prev) => {
      const newTabs = prev.filter((t) => t.id !== id);
      if (newTabs.length > 0 && activeTabId === id) {
        setActiveTabId(newTabs[newTabs.length - 1].id);
      }
      return newTabs;
    });
  };

  const handleRenameTab = (id: string, newName: string) => {
    setTabs((prev) =>
      prev.map((tab) => (tab.id === id ? { ...tab, name: newName } : tab))
    );
  };

  const handleColumnContentChange = (index: number, content: string) => {
    updateActiveTab((t) => {
      const updated = [...t.columns];
      updated[index] = content;
      return { ...t, columns: updated };
    });
  };

  const handleBadgeClick = (badgeName: string) => {
    const editorContents = document.querySelectorAll('.editor-canvas [contenteditable="true"]');
    
    editorContents.forEach((editor) => {
      // First try to find matching headings (h2 is the main standard heading for sections)
      const headings = editor.querySelectorAll('h2, h1, h3, h4, h5, h6');
      let foundHeading = false;

      headings.forEach((element) => {
        const text = element.textContent || '';
        const normText = text.toLowerCase().replace(/[^a-z0-9]/g, '');
        const normBadge = badgeName.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normText.includes(normBadge)) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.classList.remove('highlight-active');
          void (element as HTMLElement).offsetWidth; // force layout reflow
          element.classList.add('highlight-active');
          foundHeading = true;
        }
      });

      // If no heading matches, fall back to searching other content elements (p, pre, li)
      if (!foundHeading) {
        const fallbackElements = editor.querySelectorAll('p, pre, li');
        fallbackElements.forEach((element) => {
          const text = element.textContent || '';
          if (text.toLowerCase().includes(badgeName.toLowerCase())) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.remove('highlight-active');
            void (element as HTMLElement).offsetWidth; // force layout reflow
            element.classList.add('highlight-active');
          }
        });
      }
    });
  };

  const handleCopyData = () => {
    navigator.clipboard.writeText(JSON.stringify(tabs));
    message.success('Copied all editor tabs data to clipboard!');
  };

  const handleImportData = () => {
    try {
      const parsed = JSON.parse(importText) as MappingFlowTab[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        setTabs(parsed);
        setActiveTabId(parsed[0].id);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(parsed));
        setIsShareModalOpen(false);
        setImportText('');
        message.success('Data imported successfully!');
      } else {
        message.error('Invalid format! Must be an array of tabs.');
      }
    } catch (err) {
      message.error('Failed to parse JSON! Please check the copied text.');
    }
  };

  const handleClearData = () => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    localStorage.removeItem('mapping_flow_data');
    localStorage.removeItem('mapping_flow_data_v2');
    localStorage.removeItem('mapping_flow_data_v3');
    localStorage.removeItem('mapping_flow_data_v4');
    localStorage.removeItem('mapping_flow_data_v5');
    localStorage.removeItem('mapping_flow_data_v6');
    
    setTabs(defaultData);
    setActiveTabId(defaultData[0].id);
    setIsShareModalOpen(false);
    message.success('Cleared all mapping flow data and reset to defaults!');
  };

  if (!isClient || !activeTab) {
    return <div className="p-8 text-center text-gray-500">Loading flow data...</div>;
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-[#121212] text-gray-900 dark:text-gray-100 pb-12">
      {/* Dynamic Keyframe style for highlights and code blocks */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes highlight-fade {
          0% {
            background-color: rgba(59, 130, 246, 0.4);
            box-shadow: 0 0 0 6px rgba(59, 130, 246, 0.2);
          }
          100% {
            background-color: transparent;
            box-shadow: none;
          }
        }
        .highlight-active {
          animation: highlight-fade 2s ease-out forwards;
          border-radius: 6px;
          padding: 2px 6px;
        }
      `}} />

      {/* Sticky Header (keeps Tabs, Title, Toolbar, and Badges sticky) */}
      <div className="sticky top-0 z-50 bg-gray-50/95 dark:bg-[#121212]/95 backdrop-blur-sm border-b border-gray-200/80 dark:border-gray-800/80 shadow-sm mb-6">
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onTabSelect={setActiveTabId}
          onTabAdd={handleAddTab}
          onTabRemove={handleRemoveTab}
          onTabRename={handleRenameTab}
        />

        {/* Feature Title Row: Title (Left, Fixed Width), Toolbar (Center), Badges (Right) */}
        <div className="flex items-center justify-between gap-4 px-6 py-2 border-t border-gray-200/40 dark:border-gray-800/40 bg-white dark:bg-[#161616]">
          {/* Left Side: Fixed Width Title input (keeps UI stable from layout shift) */}
          <div className="flex items-center w-[300px] min-w-[300px] max-w-[300px] shrink-0">
            <input
              value={activeTab.featureTitle}
              onChange={(e) => updateActiveTab((t) => ({ ...t, featureTitle: e.target.value }))}
              className="text-lg font-bold bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-500 focus:outline-none px-2 py-1 text-blue-500 bg-blue-50/50 dark:bg-blue-900/20 w-full rounded-md"
              placeholder="## Feature Title"
            />
          </div>

          {/* Center: Shared Toolbar */}
          <div className="flex-1 flex justify-center min-w-0 editor-header-toolbar">
            <ToolbarPlugin editor={activeEditor} />
          </div>

          {/* Right Side: Badges & Share */}
          <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
            {BADGES.map((badge) => (
              <button
                key={badge}
                onClick={() => handleBadgeClick(badge)}
                className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 dark:text-blue-400 border border-blue-200/50 dark:border-blue-800/30 transition-all cursor-pointer shadow-sm active:scale-95"
              >
                {badge}
              </button>
            ))}
            <button
              onClick={() => {
                setImportText('');
                setIsShareModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/30 transition-all cursor-pointer shadow-sm active:scale-95 shrink-0"
            >
              <Share2 size={13} />
              Share / Sync
            </button>
          </div>
        </div>
      </div>

      {/* Main Body (Splitter + Editors) */}
      <div className="flex-1 flex flex-col px-6">
        <div className="flex-1 bg-gray-100/50 dark:bg-[#1e1e1e]/30 rounded-2xl p-2 border border-gray-200/50 dark:border-gray-800/50 [&_.ant-splitter]:!h-auto [&_.ant-splitter-panel]:!h-auto">
          <Splitter key={`${activeTab.id}-${activeTab.columnCount}`} className="h-full">
            {Array.from({ length: activeTab.columnCount }).map((_, index) => (
              <Splitter.Panel key={index} defaultSize={`${100 / activeTab.columnCount}%`} min="20%">
                <div className="p-3">
                  <div className="border border-gray-200/80 dark:border-gray-800/80 rounded-2xl overflow-hidden bg-white dark:bg-[#161616] shadow-sm hover:shadow-md transition-shadow duration-200 h-fit">
                    <div className="[&_.editor-container]:!h-auto [&_.editor-container]:!flex-col [&_.editor-shell]:!h-auto [&_.editor-shell]:!rounded-none [&_.editor-shell]:!border-0 [&_.editor-container]:!border-0 [&_.editor-canvas]:!max-h-none [&_.editor-canvas]:!overflow-visible [&_.editor-canvas]:!min-h-[300px]">
                      <Editor
                        value={activeTab.columns[index] || '<p></p>'}
                        onChange={(val: string) => handleColumnContentChange(index, val)}
                        onFocus={(editor) => setActiveEditor(editor)}
                        onEditorInit={(editor) => {
                          if (index === 0 && !activeEditor) {
                            setActiveEditor(editor);
                          }
                        }}
                        minContentHeight={300}
                      />
                    </div>
                  </div>
                </div>
              </Splitter.Panel>
            ))}
          </Splitter>
        </div>
      </div>

      <Modal
        title="Share or Sync Editor Data"
        open={isShareModalOpen}
        onCancel={() => setIsShareModalOpen(false)}
        footer={null}
        width={550}
      >
        <div className="flex flex-col gap-4 py-2">
          <div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              1. Share your current data
            </p>
            <p className="text-xs text-gray-500 mb-2">
              Copy your entire editor setup (all tabs and columns) to send to another user.
            </p>
            <Button type="primary" onClick={handleCopyData} className="w-full">
              Copy Current Data to Clipboard
            </Button>
          </div>

          <div className="border-t border-gray-200/60 dark:border-gray-800/60 my-2" />

          <div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              2. Import data from another user
            </p>
            <p className="text-xs text-gray-500 mb-2">
              Paste the copied JSON data below to load their tabs and columns instantly.
            </p>
            <Input.TextArea
              rows={5}
              placeholder="Paste data JSON here..."
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              className="font-mono text-xs mb-3 bg-gray-50 dark:bg-gray-900"
            />
            <div className="flex justify-end gap-2">
              <Button onClick={() => setIsShareModalOpen(false)}>Cancel</Button>
              <Button type="primary" danger onClick={handleImportData} disabled={!importText.trim()}>
                Import & Overwrite
              </Button>
            </div>
          </div>

          <div className="border-t border-gray-200/60 dark:border-gray-800/60 my-2" />

          <div>
            <p className="text-sm font-semibold text-red-600 dark:text-red-400 mb-1.5">
              3. Reset / Clear Editor Data
            </p>
            <p className="text-xs text-gray-500 mb-2">
              This will permanently delete all your custom tabs and column edits, resetting local storage to default templates.
            </p>
            <Button type="primary" danger onClick={handleClearData} className="w-full">
              Reset & Clear All Data
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
