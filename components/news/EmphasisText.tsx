import React from "react";
import { splitEmphasis } from "@/lib/news/emphasis";

/** Renders text whose keywords are marked with `**...**`, highlighting each keyword. */
export function EmphasisText({ text }: { text: string }) {
  return (
    <>
      {splitEmphasis(text).map((segment, index) =>
        segment.isEmphasis ? (
          <strong
            key={index}
            className="rounded-[3px] bg-[color-mix(in_oklab,var(--editorial-accent)_14%,transparent)] px-0.5 font-semibold text-foreground box-decoration-clone"
          >
            {segment.text}
          </strong>
        ) : (
          <React.Fragment key={index}>{segment.text}</React.Fragment>
        )
      )}
    </>
  );
}
