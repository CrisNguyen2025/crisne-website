export function checkEmptyHtml(value: string | undefined): boolean {
  if (!value) return true;

  // If HTML contains images, media, tables, or structural tags, it is NOT empty
  if (/<(img|figure|figcaption|iframe|video|audio|table|tbody|thead|tr|td|th|hr|canvas|svg|pre|code)[^>]*>/i.test(value)) {
    return false;
  }

  const textContent = value
    .replaceAll(/<[^>]+>/g, '')
    .replaceAll(/&nbsp;/g, ' ')
    .replaceAll(/\s+/g, '')
    .trim();

  return textContent.length === 0;
}
