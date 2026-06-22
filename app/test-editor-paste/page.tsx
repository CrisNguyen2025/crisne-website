'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';

const Editor = dynamic(() => import('@/components/ui/editor/Editor'), {
  ssr: false,
});

const TAB_DELIMITED_TABLE_FIXTURE = [
  'Time\tDescription\tUse Case',
  'Planning Time\tGiai đoạn định nghĩa bài toán trước khi code\tVẽ User Flow, ERD, API Contract, Permission Matrix',
  'Development Time\tGiai đoạn viết code và kiểm tra logic\tReact Component, API Route, Database Schema',
  'Build Time\tGiai đoạn compile source thành artifact deploy được\tNext Build, TypeScript Compile, Bundle Optimize',
  'Deploy Time\tGiai đoạn đưa artifact lên môi trường chạy\tVercel Deploy, Railway Deploy, Docker Push',
  'Startup Time\tGiai đoạn ứng dụng khởi động\tConnect DB, Connect Redis, Load Config',
  'Request Time\tGiai đoạn xử lý request của user\tLogin, Checkout, Create Order',
  'Runtime\tToàn bộ thời gian app đang sống\tWeb Server Running, Websocket Server',
  'Background Time\tCông việc chạy ngoài request user\tEmail Queue, AI Processing, Export PDF',
  'Cache Time\tGiai đoạn dữ liệu được lưu để tái sử dụng\tRedis Cache, CDN Cache',
  'Observability Time\tGiai đoạn theo dõi hệ thống\tLogging, Monitoring, Tracing',
].join('\n');

export default function TestEditorPaste() {
  const [content, setContent] = useState<string>('');

  return (
    <div className="min-h-screen p-8 bg-background">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">Test Editor Paste</h1>

        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <p className="text-sm text-blue-600 dark:text-blue-400">
            <strong>Instructions:</strong>
          </p>
          <ol className="text-sm text-blue-600 dark:text-blue-400 list-decimal list-inside mt-2 space-y-1">
            <li>Copy the tab-delimited sample below.</li>
            <li>Click in the editor and paste with Ctrl+V or Cmd+V.</li>
            <li>Verify that the result is a three-column table with a header row.</li>
          </ol>
        </div>

        <pre className="overflow-x-auto rounded-lg border border-border bg-muted p-4 text-xs whitespace-pre-wrap">
          {TAB_DELIMITED_TABLE_FIXTURE}
        </pre>

        <div className="border border-border rounded-lg p-4">
          <Editor
            value={content}
            onChange={setContent}
            autoFocus
            minContentHeight={400}
          />
        </div>

        <div className="p-4 bg-muted rounded-lg">
          <p className="font-semibold mb-2">Content HTML:</p>
          <pre className="text-xs overflow-auto max-h-60 whitespace-pre-wrap break-all">
            {content || '(empty)'}
          </pre>
        </div>

        <div className="p-4 bg-muted rounded-lg">
          <p className="font-semibold mb-2">Expected result:</p>
          <ul className="text-sm space-y-1">
            <li>✅ The generated HTML contains a table, header cells, and all copied text.</li>
            <li>❌ Plain text with no tabs or only one row remains regular editor content.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
