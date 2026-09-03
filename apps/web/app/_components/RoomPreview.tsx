import React from "react";

/*
 * A miniature of the actual room, drawn with the same tokens the room itself
 * uses. Deliberately not a screenshot: a screenshot goes stale the moment the
 * palette moves, needs one file per theme, and cannot follow the reader's
 * light/dark choice. This follows all three for free and costs no image bytes.
 *
 * It is an illustration, so it is exposed as one image with a description
 * rather than as a pile of empty divs a screen reader has to wade through.
 */
export function RoomPreview() {
  return (
    <div
      role="img"
      aria-label="A Huddle room: friends on a voice call down the left, the video in the middle, and chat down the right."
      className="panel overflow-hidden select-none"
    >
      {/* Room chrome */}
      <div className="flex items-center gap-2 border-b border-hairline px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-[3px] bg-accent" />
        <span className="font-mono text-[10px] text-ink-muted">
          moonlight-42
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          {[16, 22, 14].map((w) => (
            <span
              key={w}
              style={{ width: w }}
              className="h-2 rounded-full bg-raised"
            />
          ))}
          <span className="flex items-center gap-1 rounded-full border border-positive px-1.5 py-[3px]">
            <span className="h-1 w-1 rounded-full bg-positive" />
            <span className="text-[8px] font-medium text-positive">Live</span>
          </span>
        </span>
      </div>

      {/*
        The real room is 280px / 1fr / 340px at desktop. Fixed pixel rails made
        the centre column swallow the mock and the proportions stopped reading
        as the product; percentages keep the same shape at any width.
      */}
      <div className="grid grid-cols-[1fr] sm:grid-cols-[21%_1fr_26%] gap-2 p-2">
        {/* Call rail */}
        <div className="hidden sm:flex flex-col gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 rounded-[6px] border border-hairline bg-sunken px-1.5 py-1"
            >
              <span className="h-3 w-3 shrink-0 rounded-full bg-accent/70" />
              <span className="h-1.5 flex-1 rounded-full bg-raised" />
            </div>
          ))}
        </div>

        {/* The picture, with the sprocket edge the room uses */}
        <div className="relative pl-3">
          <span
            aria-hidden="true"
            className="absolute left-0 top-0 bottom-0 w-[3px] rounded-full opacity-60 [background-image:repeating-linear-gradient(to_bottom,var(--c-hairline-strong)_0px,var(--c-hairline-strong)_5px,transparent_5px,transparent_12px)]"
          />
          <div className="flex aspect-video max-h-[168px] items-center justify-center rounded-[6px] bg-sunken">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-ink">
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </div>
          <div className="mt-1.5 h-1 w-full rounded-full bg-raised">
            <div className="h-1 w-2/5 rounded-full bg-accent" />
          </div>
        </div>

        {/* Chat */}
        <div className="hidden sm:flex flex-col gap-1.5">
          {[
            "w-full",
            "w-4/5",
            "w-full",
            "w-3/5",
            "w-11/12",
            "w-2/3",
            "w-4/5",
          ].map((w, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full ${w} ${
                i % 3 === 1 ? "bg-accent/45" : "bg-raised"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
