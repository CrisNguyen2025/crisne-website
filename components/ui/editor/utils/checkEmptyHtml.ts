export function checkEmptyHtml(value: string | undefined) {
  if (!value) return true;

  const textContent = value
    .replaceAll(/<[^>]+>/g, '')
    .replaceAll(/\s+/g, '')
    .trim();

  return textContent.length === 0;
}
