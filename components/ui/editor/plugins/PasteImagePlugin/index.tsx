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
              
              // Upload image immediately instead of using base64
              const uploadImage = async () => {
                try {
                  // Create FormData
                  const formData = new FormData();
                  formData.append('file', file);
                  
                  // Upload to server
                  const response = await fetch('/api/upload-image', {
                    method: 'POST',
                    body: formData,
                  });
                  
                  if (!response.ok) {
                    throw new Error('Upload failed');
                  }
                  
                  const data = await response.json();
                  
                  // Insert image with URL
                  editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
                    src: data.url,
                    altText: file.name || 'Uploaded image',
                    maxWidth: 800,
                  });
                  
                  console.log(`Image uploaded: ${data.url} (${(data.size / 1024).toFixed(2)}KB)`);
                } catch (error) {
                  console.error('Image upload failed, falling back to base64:', error);
                  
                  // Fallback to base64 if upload fails
                  const reader = new FileReader();
                  reader.onload = (e) => {
                    const src = e.target?.result as string;
                    if (src) {
                      editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
                        src,
                        altText: file.name || 'Pasted image',
                        maxWidth: 800,
                      });
                    }
                  };
                  reader.readAsDataURL(file);
                }
              };
              
              uploadImage();
              
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
