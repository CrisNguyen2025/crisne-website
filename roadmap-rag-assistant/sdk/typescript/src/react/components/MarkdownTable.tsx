"use client";

import React from "react";

export interface MarkdownTableProps {
  headers: string[];
  alignments: ("left" | "center" | "right")[];
  rows: string[][];
  renderInline: (text: string, fade?: boolean) => React.ReactNode[];
  fade?: boolean;
}

export function MarkdownTable({
  headers,
  alignments,
  rows,
  renderInline,
  fade = false,
}: MarkdownTableProps) {
  const getAlignmentClass = (align?: "left" | "center" | "right") => {
    switch (align) {
      case "center":
        return "text-center";
      case "right":
        return "text-right";
      case "left":
      default:
        return "text-left";
    }
  };

  return (
    <div className="my-3 w-full overflow-x-auto rounded-lg border border-border/80 bg-background/50 shadow-xs touch-pan-x">
      <table className="w-full min-w-full border-collapse text-left text-xs">
        {headers.length > 0 && (
          <thead className="border-b border-border bg-muted/60 text-muted-foreground font-semibold">
            <tr>
              {headers.map((header, idx) => {
                const alignClass = getAlignmentClass(alignments[idx]);
                return (
                  <th
                    key={idx}
                    scope="col"
                    className={`px-3.5 py-2 font-medium tracking-wide first:pl-4 last:pr-4 ${alignClass}`}
                  >
                    {renderInline(header, fade)}
                  </th>
                );
              })}
            </tr>
          </thead>
        )}
        <tbody className="divide-y divide-border/40">
          {rows.map((row, rowIdx) => (
            <tr
              key={rowIdx}
              className="border-b border-border/30 last:border-b-0 transition-colors hover:bg-muted/30 even:bg-muted/15"
            >
              {row.map((cell, colIdx) => {
                const alignClass = getAlignmentClass(alignments[colIdx]);
                return (
                  <td
                    key={colIdx}
                    className={`px-3.5 py-2 text-foreground align-top first:pl-4 last:pr-4 ${alignClass}`}
                  >
                    {renderInline(cell, fade)}
                  </td>
                );
              })}
              {/* If row has fewer cells than headers, pad empty cells */}
              {row.length < headers.length &&
                Array.from({ length: headers.length - row.length }).map(
                  (_, padIdx) => (
                    <td
                      key={`pad-${padIdx}`}
                      className="px-3.5 py-2 text-foreground align-top first:pl-4 last:pr-4"
                    />
                  )
                )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
