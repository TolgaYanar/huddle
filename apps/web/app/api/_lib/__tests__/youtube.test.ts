import { describe, expect, it } from "vitest";

import { extractYouTubeVideoId } from "../youtube";

describe("extractYouTubeVideoId", () => {
  it("parses youtu.be short links", () => {
    expect(extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
    expect(extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=2391")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("parses /watch?v=", () => {
    expect(
      extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    ).toBe("dQw4w9WgXcQ");
    expect(
      extractYouTubeVideoId(
        "https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123",
      ),
    ).toBe("dQw4w9WgXcQ");
  });

  it("parses /embed, /v, /shorts, /live", () => {
    expect(
      extractYouTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ"),
    ).toBe("dQw4w9WgXcQ");
    expect(
      extractYouTubeVideoId("https://www.youtube.com/v/dQw4w9WgXcQ"),
    ).toBe("dQw4w9WgXcQ");
    expect(
      extractYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
    ).toBe("dQw4w9WgXcQ");
    expect(
      extractYouTubeVideoId("https://www.youtube.com/live/dQw4w9WgXcQ"),
    ).toBe("dQw4w9WgXcQ");
  });

  it("accepts the no-cookie domain", () => {
    expect(
      extractYouTubeVideoId(
        "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      ),
    ).toBe("dQw4w9WgXcQ");
  });

  it("rejects ids that are not 11 chars or have invalid characters", () => {
    expect(extractYouTubeVideoId("https://youtu.be/short")).toBeNull();
    expect(
      extractYouTubeVideoId("https://www.youtube.com/watch?v=tooLongVideoId"),
    ).toBeNull();
    expect(
      extractYouTubeVideoId("https://www.youtube.com/watch?v=has space!!"),
    ).toBeNull();
  });

  it("rejects non-YouTube hosts and bad inputs", () => {
    expect(extractYouTubeVideoId("https://example.com/dQw4w9WgXcQ")).toBeNull();
    expect(extractYouTubeVideoId("not a url")).toBeNull();
    expect(extractYouTubeVideoId("")).toBeNull();
    expect(extractYouTubeVideoId("https://youtube.com")).toBeNull();
    expect(extractYouTubeVideoId("https://youtube.com/")).toBeNull();
  });

  it("does not match other YouTube paths", () => {
    expect(
      extractYouTubeVideoId("https://www.youtube.com/playlist?list=PL123"),
    ).toBeNull();
    expect(
      extractYouTubeVideoId("https://www.youtube.com/channel/UC123"),
    ).toBeNull();
  });
});
