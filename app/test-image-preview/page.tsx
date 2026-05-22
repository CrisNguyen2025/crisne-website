'use client';

import { PreviewImage } from '@/components/ui/image-preview';

const sampleImages = [
  {
    src: 'https://picsum.photos/800/600?random=1',
    alt: 'Random Image 1',
  },
  {
    src: 'https://picsum.photos/800/600?random=2',
    alt: 'Random Image 2',
  },
  {
    src: 'https://picsum.photos/800/600?random=3',
    alt: 'Random Image 3',
  },
  {
    src: 'https://picsum.photos/800/600?random=4',
    alt: 'Random Image 4',
  },
];

export default function TestImagePreviewPage() {
  return (
    <div className="container mx-auto p-8">
      <h1 className="mb-8 text-4xl font-bold">Image Preview Component Demo</h1>

      <div className="space-y-12">
        {/* Single Image */}
        <section>
          <h2 className="mb-4 text-2xl font-semibold">Single Image Preview</h2>
          <p className="mb-4 text-muted-foreground">
            Click on the image to open preview with zoom, rotate, and download features.
          </p>
          <PreviewImage
            src="https://picsum.photos/600/400?random=5"
            alt="Single Image"
            className="rounded-lg shadow-lg"
            width={600}
            height={400}
          />
        </section>

        {/* Image Gallery */}
        <section>
          <h2 className="mb-4 text-2xl font-semibold">Image Gallery with Navigation</h2>
          <p className="mb-4 text-muted-foreground">
            Click any image to open preview. Use arrow keys or navigation buttons to browse.
          </p>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {sampleImages.map((image, index) => (
              <PreviewImage
                key={index}
                src={image.src}
                alt={image.alt}
                images={sampleImages}
                className="h-48 w-full rounded-lg object-cover shadow-md"
              />
            ))}
          </div>
        </section>

        {/* Features */}
        <section>
          <h2 className="mb-4 text-2xl font-semibold">Features</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border p-4">
              <h3 className="mb-2 font-semibold">🔍 Zoom</h3>
              <p className="text-sm text-muted-foreground">
                Use mouse wheel or +/- keys to zoom in/out (50% - 500%)
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <h3 className="mb-2 font-semibold">🔄 Rotate</h3>
              <p className="text-sm text-muted-foreground">
                Press R key or click rotate button to rotate 90°
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <h3 className="mb-2 font-semibold">👆 Pan/Drag</h3>
              <p className="text-sm text-muted-foreground">
                Drag image when zoomed in to pan around
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <h3 className="mb-2 font-semibold">⬇️ Download</h3>
              <p className="text-sm text-muted-foreground">
                Click download button to save image locally
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <h3 className="mb-2 font-semibold">⌨️ Keyboard Shortcuts</h3>
              <p className="text-sm text-muted-foreground">
                ESC: Close | +/-: Zoom | R: Rotate | ←/→: Navigate
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <h3 className="mb-2 font-semibold">📱 Touch Support</h3>
              <p className="text-sm text-muted-foreground">
                Fully responsive and mobile-friendly
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
