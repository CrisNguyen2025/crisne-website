export interface SplitSectionLabel {
  primary: string;
  sub: string | null;
}

export function splitSectionLabel(section: string | null): SplitSectionLabel {
  const trimmed = section?.trim() ?? '';
  if (!trimmed) {
    return { primary: 'Chung', sub: null };
  }
  const sepIndex = trimmed.lastIndexOf(' · ');
  if (sepIndex > 0) {
    return {
      primary: trimmed.slice(0, sepIndex).trim(),
      sub: trimmed.slice(sepIndex + 3).trim() || null,
    };
  }
  return { primary: trimmed, sub: null };
}
