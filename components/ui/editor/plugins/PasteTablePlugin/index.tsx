import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createTableNodeWithDimensions,
  $getTableCellNodeFromLexicalNode,
  $isTableCellNode,
  $isTableRowNode,
} from '@lexical/table';
import { $insertNodeToNearestRoot } from '@lexical/utils';
import { $createTextNode, $getSelection, $isParagraphNode, $isRangeSelection, $isTextNode, COMMAND_PRIORITY_HIGH, PASTE_COMMAND } from 'lexical';
import { useEffect } from 'react';
import { parseTabDelimitedTable } from '../../utils/parseTabDelimitedTable';

export function PasteTablePlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event: ClipboardEvent) => {
        const tableData = parseTabDelimitedTable(event.clipboardData?.getData('text/plain') ?? '');
        const selection = $getSelection();

        if (!tableData || !$isRangeSelection(selection) || $getTableCellNodeFromLexicalNode(selection.anchor.getNode())) {
          return false;
        }

        event.preventDefault();

        const tableNode = $createTableNodeWithDimensions(tableData.length, tableData[0].length, {
          rows: true,
          columns: false,
        });

        tableNode.getChildren().forEach((rowNode, rowIndex) => {
          if (!$isTableRowNode(rowNode)) {
            return;
          }

          rowNode.getChildren().forEach((cellNode, columnIndex) => {
            if (!$isTableCellNode(cellNode)) {
              return;
            }

            const paragraphNode = cellNode.getFirstChild();
            if ($isParagraphNode(paragraphNode)) {
              paragraphNode.clear().append($createTextNode(tableData[rowIndex][columnIndex]));
            }
          });
        });

        $insertNodeToNearestRoot(tableNode);

        const firstTextNode = tableNode.getFirstDescendant();
        if ($isTextNode(firstTextNode)) {
          firstTextNode.select();
        }

        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor]);

  return null;
}
