import { useCallback, useMemo } from "react";

import { useClipboard } from "../../../lib/useClipboard";

export function useInviteLink(roomId: string, isClient: boolean) {
  return useMemo(() => {
    if (!isClient) return "";
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/r/${encodeURIComponent(roomId)}`;
  }, [isClient, roomId]);
}

export function useCopyInvite(inviteLink: string) {
  const { copy, copied } = useClipboard();

  const copyInvite = useCallback(async () => {
    if (!inviteLink) return;
    await copy(inviteLink);
  }, [copy, inviteLink]);

  return { copied, copyInvite };
}
