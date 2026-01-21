import { useCallback, useMemo, useState } from "react";

export function useInviteLink(roomId: string, isClient: boolean) {
  return useMemo(() => {
    if (!isClient) return "";
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/r/${encodeURIComponent(roomId)}`;
  }, [isClient, roomId]);
}

export function useCopyInvite(inviteLink: string) {
  const [copied, setCopied] = useState(false);

  const copyInvite = useCallback(async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // no-op
    }
  }, [inviteLink]);

  return { copied, copyInvite };
}
