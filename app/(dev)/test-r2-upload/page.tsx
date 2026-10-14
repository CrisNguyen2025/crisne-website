'use client';

import { useState } from 'react';

export default function TestR2Upload() {
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      console.log('Uploading file:', file.name, file.size, file.type);

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload-image', {
        method: 'POST',
        body: formData,
      });

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('Upload success:', data);
      setResult(data);
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-8 bg-background">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">Test R2 Upload</h1>

        <div className="border-2 border-dashed border-border rounded-lg p-8">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            disabled={loading}
            className="w-full"
          />
        </div>

        {loading && (
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-blue-600 dark:text-blue-400">Uploading...</p>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <p className="text-red-600 dark:text-red-400 font-semibold">Error:</p>
            <pre className="mt-2 text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap">
              {error}
            </pre>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <p className="text-green-600 dark:text-green-400 font-semibold">Success!</p>
              <pre className="mt-2 text-sm text-green-600 dark:text-green-400 whitespace-pre-wrap">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>

            <div className="border border-border rounded-lg p-4">
              <p className="font-semibold mb-2">Preview:</p>
              <img
                src={result.url}
                alt="Uploaded"
                className="max-w-full h-auto rounded"
                onError={(e) => {
                  console.error('Image load error');
                  setError('Failed to load image from: ' + result.url);
                }}
                onLoad={() => console.log('Image loaded successfully')}
              />
            </div>
          </div>
        )}

        <div className="p-4 bg-muted rounded-lg">
          <p className="font-semibold mb-2">Environment Check:</p>
          <ul className="text-sm space-y-1">
            <li>• Check browser console for logs</li>
            <li>• Check Network tab for API requests</li>
            <li>• Verify R2 credentials in Vercel</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
