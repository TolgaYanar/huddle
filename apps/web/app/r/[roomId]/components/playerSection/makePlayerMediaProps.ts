import type React from "react";

import type { PlayerMediaRenderer } from "./PlayerMediaRenderer";

type PlayerMediaProps = React.ComponentProps<typeof PlayerMediaRenderer>;

export function makePlayerMediaProps({
  base,
  youtube,
  roomCatchup,
}: {
  base: Omit<
    PlayerMediaProps,
    | "isYouTube"
    | "isPageVisible"
    | "ytAudioBlockedInBackground"
    | "useYouTubeIFrameApi"
    | "reactPlayerSrc"
    | "youTubeDesiredId"
    | "youTubeStartTime"
    | "youTubeIsOnDesired"
    | "ytForceRemountNonce"
    | "setYtForceRemountNonce"
    | "ytRequestedIdRef"
    | "ytConfirmedIdRef"
    | "setYtConfirmedId"
    | "setYoutubeMountUrl"
    | "ytLastUserRecoverAtRef"
    | "cancelPendingRoomCatchup"
    | "syncToRoomTimeIfNeeded"
  >;
  youtube: Pick<
    PlayerMediaProps,
    | "isYouTube"
    | "isPageVisible"
    | "ytAudioBlockedInBackground"
    | "useYouTubeIFrameApi"
    | "reactPlayerSrc"
    | "youTubeDesiredId"
    | "youTubeStartTime"
    | "youTubeIsOnDesired"
    | "ytForceRemountNonce"
    | "setYtForceRemountNonce"
    | "ytRequestedIdRef"
    | "ytConfirmedIdRef"
    | "setYtConfirmedId"
    | "setYoutubeMountUrl"
    | "ytLastUserRecoverAtRef"
  >;
  roomCatchup: Pick<
    PlayerMediaProps,
    "cancelPendingRoomCatchup" | "syncToRoomTimeIfNeeded"
  >;
}): PlayerMediaProps {
  return {
    ...base,

    ...youtube,
    ...roomCatchup,
  };
}
