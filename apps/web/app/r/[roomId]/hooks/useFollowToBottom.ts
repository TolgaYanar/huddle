import { useCallback, useEffect, useRef } from "react";

const DEFAULT_FOLLOW_THRESHOLD = 80;

export function useFollowToBottom<T extends HTMLElement>(
  content: unknown,
  {
    enabled = true,
    threshold = DEFAULT_FOLLOW_THRESHOLD,
  }: { enabled?: boolean; threshold?: number } = {},
) {
  const scrollContainerRef = useRef<T>(null);
  const isPinnedToBottomRef = useRef(true);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    isPinnedToBottomRef.current = distanceFromBottom <= threshold;
  }, [threshold]);

  // A hidden list gets a new DOM node when it opens again. Its scrollTop starts
  // at zero, so carrying over a previous "reader is above the bottom" state
  // would reopen it at the oldest visible message.
  useEffect(() => {
    if (!enabled) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    isPinnedToBottomRef.current = true;
    container.scrollTop = container.scrollHeight;
  }, [enabled]);

  // Follow new content only while the reader is already near the bottom.
  useEffect(() => {
    if (!enabled || !isPinnedToBottomRef.current) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    // Move only this container. scrollIntoView() also moves scrollable
    // ancestors and can drag the whole page on the stacked mobile layout.
    container.scrollTop = container.scrollHeight;
  }, [content, enabled]);

  return { scrollContainerRef, handleScroll };
}
