'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';

const Editor = dynamic(() => import('@/components/ui/editor/Editor'), {
  ssr: false,
});

export default function TestEditorPaste() {
  const [content, setContent] = useState('');

  return (
    <div className="min-h-screen p-8 bg-background">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">Test Editor Paste</h1>

        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <p className="text-sm text-blue-600 dark:text-blue-400">
            <strong>Instructions:</strong>
          </p>
          <ol className="text-sm text-blue-600 dark:text-blue-400 list-decimal list-inside mt-2 space-y-1">
            <li>Open browser Console (F12)</li>
            <li>Copy an image (Ctrl+C or Cmd+C)</li>
            <li>Click in the editor below</li>
            <li>Paste (Ctrl+V or Cmd+V)</li>
            <li>Check console for upload logs</li>
          </ol>
        </div>

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
          <p className="font-semibold mb-2">Expected Console Logs:</p>
          <ul className="text-sm space-y-1">
            <li>✅ "Uploading image..."</li>
            <li>✅ "Image uploaded: https://pub-xxx.r2.dev/uploads/xxx.png"</li>
            <li>❌ If no logs → PasteImagePlugin not working</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
