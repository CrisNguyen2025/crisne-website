const TAB_CHARACTER = '\t';
const LINE_BREAK_PATTERN = /\r\n?/g;

export function parseTabDelimitedTable(value: string): string[][] | null {
  const rows = value.replace(LINE_BREAK_PATTERN, '\n').split('\n');

  while (rows.at(-1) === '') {
    rows.pop();
  }

  const tableRows = rows.map(row => row.split(TAB_CHARACTER));
  const columnCount = Math.max(...tableRows.map(row => row.length));

  if (tableRows.length < 2 || columnCount < 2) {
    return null;
  }

  return tableRows.map(row => [...row, ...Array.from({ length: columnCount - row.length }, () => '')]);
}
