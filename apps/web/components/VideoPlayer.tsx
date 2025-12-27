"use client";

import React, { forwardRef, useRef, useImperativeHandle } from "react";
import ReactPlayer from "react-player";

interface VideoPlayerProps {
  url: string;
  playing: boolean;
  muted: boolean;
  onProgress: (state: { playedSeconds: number }) => void;
  onReady?: () => void;
  onStart?: () => void;
  onError?: (e: any) => void;
}

export interface VideoPlayerHandle {
  getCurrentTime: () => number;
  seekTo: (amount: number, type?: "seconds" | "fraction") => void;
}

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  (props, ref) => {
    const playerRef = useRef<ReactPlayer | null>(null);

    useImperativeHandle(ref, () => ({
      getCurrentTime: () => {
        const player = playerRef.current;
        if (player && typeof player.getCurrentTime === "function") {
          return player.getCurrentTime();
        }
        return 0;
      },
      seekTo: (amount: number, type?: "seconds" | "fraction") => {
        const player = playerRef.current;
        if (player && typeof player.seekTo === "function") {
          player.seekTo(amount, type);
        }
      },
    }));

    return (
      <div className="absolute inset-0 bg-black">
        <ReactPlayer
          ref={playerRef}
          url={props.url}
          playing={props.playing}
          muted={props.muted}
          width="100%"
          height="100%"
          controls={false}
          onProgress={props.onProgress}
          onReady={props.onReady}
          onStart={props.onStart}
          onError={props.onError}
          config={{
            youtube: {
              playerVars: {
                showinfo: 0,
                modestbranding: 1,
                rel: 0,
              },
            },
            file: {
              attributes: {
                controlsList: "nodownload",
                disablePictureInPicture: true,
              },
            },
          }}
        />
      </div>
    );
  }
);

VideoPlayer.displayName = "VideoPlayer";
export default VideoPlayer;
