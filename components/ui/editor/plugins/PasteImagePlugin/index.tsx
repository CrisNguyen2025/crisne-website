import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { COMMAND_PRIORITY_LOW, PASTE_COMMAND } from 'lexical';
import { useEffect } from 'react';
import { INSERT_IMAGE_COMMAND } from '../ImagesPlugin';

const ACCEPTABLE_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
];

export function PasteImagePlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event: ClipboardEvent) => {
        const clipboardData = event.clipboardData;
        if (!clipboardData) {
          return false;
        }

        const items = Array.from(clipboardData.items);
        
        for (const item of items) {
          if (ACCEPTABLE_IMAGE_TYPES.includes(item.type)) {
            const file = item.getAsFile();
            if (file) {
              event.preventDefault();
              
              // Check file size (warn if > 1MB)
              const maxSize = 1024 * 1024; // 1MB
              if (file.size > maxSize) {
                console.warn(`Image size (${(file.size / 1024 / 1024).toFixed(2)}MB) is large. Consider compressing it.`);
              }
              
              // Convert file to base64 data URL
              const reader = new FileReader();
              reader.onload = (e) => {
                const src = e.target?.result as string;
                if (src) {
                  // Check base64 size
                  const base64Size = src.length;
                  if (base64Size > 100000) { // ~100KB base64
                    console.warn(`Base64 image is large (${(base64Size / 1024).toFixed(2)}KB). This may affect save performance.`);
                  }
                  
                  editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
                    src,
                    altText: file.name || 'Pasted image',
                    maxWidth: 800,
                  });
                }
              };
              reader.readAsDataURL(file);
              
              return true;
            }
          }
        }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  return null;
}
