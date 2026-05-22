# Image Preview Component

Image preview component inspired by Ant Design with advanced features.

## Features

- ✅ **Zoom In/Out** - Mouse wheel or +/- keys
- ✅ **Rotate** - R key or toolbar button
- ✅ **Pan/Drag** - Drag image when zoomed in
- ✅ **Download** - Download image to local
- ✅ **Navigation** - Navigate between multiple images
- ✅ **Keyboard Shortcuts** - Full keyboard support
- ✅ **Touch Support** - Mobile-friendly
- ✅ **Smooth Animations** - Polished transitions

## Usage

### Single Image Preview

```tsx
import { PreviewImage } from '@/components/ui/image-preview';

<PreviewImage 
  src="/image.jpg" 
  alt="My Image"
  className="rounded-lg"
/>
```

### Image Gallery with Navigation

```tsx
import { PreviewImage } from '@/components/ui/image-preview';

const images = [
  { src: '/image1.jpg', alt: 'Image 1' },
  { src: '/image2.jpg', alt: 'Image 2' },
  { src: '/image3.jpg', alt: 'Image 3' },
];

<PreviewImage 
  src={images[0].src}
  alt={images[0].alt}
  images={images}
/>
```

### Custom Preview Control

```tsx
import { ImagePreview } from '@/components/ui/image-preview';
import { useState } from 'react';

function MyComponent() {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <button onClick={() => setVisible(true)}>
        Show Preview
      </button>
      
      <ImagePreview
        src="/image.jpg"
        alt="My Image"
        visible={visible}
        onClose={() => setVisible(false)}
      />
    </>
  );
}
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `ESC` | Close preview |
| `+` or `=` | Zoom in |
| `-` | Zoom out |
| `R` | Rotate 90° |
| `←` | Previous image |
| `→` | Next image |

## Props

### PreviewImage

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `src` | `string` | required | Image source URL |
| `alt` | `string` | required | Image alt text |
| `className` | `string` | - | Additional CSS classes |
| `width` | `number` | - | Image width |
| `height` | `number` | - | Image height |
| `preview` | `boolean` | `true` | Enable preview on click |
| `images` | `Array<{src, alt}>` | `[]` | Multiple images for gallery |

### ImagePreview

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `src` | `string` | required | Image source URL |
| `alt` | `string` | required | Image alt text |
| `visible` | `boolean` | required | Preview visibility |
| `onClose` | `() => void` | required | Close callback |
| `images` | `Array<{src, alt}>` | `[]` | Multiple images for gallery |
| `currentIndex` | `number` | `0` | Current image index |
| `onIndexChange` | `(index) => void` | - | Index change callback |

## Features Detail

### Zoom
- Zoom range: 50% - 500%
- Mouse wheel to zoom
- Keyboard shortcuts: `+` / `-`
- Toolbar buttons

### Rotate
- Rotate in 90° increments
- Keyboard shortcut: `R`
- Toolbar button

### Pan/Drag
- Drag image when zoomed > 100%
- Cursor changes to grab/grabbing
- Smooth dragging experience

### Download
- Download original image
- Preserves image quality
- Uses original filename

### Navigation
- Navigate between multiple images
- Keyboard shortcuts: `←` / `→`
- Navigation buttons on sides
- Image counter display

## Styling

The component uses Tailwind CSS and is fully customizable. All colors and styles can be adjusted through the component props or by overriding the default classes.

## Accessibility

- Keyboard navigation support
- ARIA labels for buttons
- Focus management
- Screen reader friendly

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)
