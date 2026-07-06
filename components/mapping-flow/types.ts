export interface MappingFlowTab {
  id: string;
  name: string;
  color: string;
  featureTitle: string;
  columnCount: 2 | 3;
  columns: string[]; // Content of each column (length matches columnCount)
}
