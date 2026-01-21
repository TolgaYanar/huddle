"use client";

import React from "react";

import { RoomClientView } from "./roomClient/RoomClientView";
import { useRoomClientViewModel } from "./roomClient/useRoomClientViewModel";

export default function RoomClient({ roomId }: { roomId: string }) {
  const viewModel = useRoomClientViewModel(roomId);
  return <RoomClientView {...viewModel} />;
}
