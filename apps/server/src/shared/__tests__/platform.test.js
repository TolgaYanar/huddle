const test = require("node:test");
const assert = require("node:assert/strict");

const { detectPlatform } = require("../platform");

test("recognises every service the product supports", () => {
  const cases = {
    "https://www.netflix.com/watch/81234": "netflix",
    "https://netflix.com/watch/81234": "netflix",
    "https://www.primevideo.com/region/eu/detail/ABC123": "prime",
    "https://www.disneyplus.com/video/abc": "disney_plus",
    "https://www.youtube.com/watch?v=abc": "youtube",
    "https://youtu.be/abc": "youtube",
    "https://www.youtube-nocookie.com/embed/abc": "youtube",
    "https://www.twitch.tv/somechannel": "twitch",
    "https://kick.com/somechannel": "kick",
    "https://vimeo.com/123456": "vimeo",
    "https://player.vimeo.com/video/123456": "vimeo",
    "https://www.dailymotion.com/video/x123": "dailymotion",
    "https://dai.ly/x123": "dailymotion",
    "https://soundcloud.com/artist/track": "soundcloud",
    "https://www.loom.com/share/abc": "loom",
  };
  for (const [url, expected] of Object.entries(cases)) {
    assert.equal(detectPlatform(url), expected, url);
  }
});

test("distinguishes nothing playing from an unrecognised service", () => {
  // null means the room has no video; "other" means a real URL we do not know.
  assert.equal(detectPlatform(null), null);
  assert.equal(detectPlatform(""), null);
  assert.equal(detectPlatform("   "), null);
  assert.equal(detectPlatform("https://example.com/watch"), "other");
});

test("classifies a direct media file rather than calling it a service", () => {
  for (const url of [
    "https://cdn.example.com/movie.mp4",
    "https://cdn.example.com/a/b/stream.m3u8",
    "https://cdn.example.com/audio.mp3",
  ]) {
    assert.equal(detectPlatform(url), "file", url);
  }
});

test("rejects anything that is not an http(s) URL", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,<h1>x</h1>",
    "file:///etc/passwd",
    "notaurl",
    42,
    {},
    undefined,
  ]) {
    assert.equal(detectPlatform(url), null, String(url));
  }
});

test("is not fooled by a platform name appearing elsewhere in the URL", () => {
  // Matching on hostname, not substring: a link that merely mentions another
  // service must not be misattributed.
  assert.equal(
    detectPlatform("https://example.com/redirect?to=netflix.com/watch/1"),
    "other",
  );
  assert.equal(detectPlatform("https://notnetflix.com/watch/1"), "other");
  assert.equal(
    detectPlatform("https://netflix.com.evil.test/watch/1"),
    "other",
  );
  assert.equal(
    detectPlatform("https://primevideo.com.evil.test/detail/ABC"),
    "other",
  );
  assert.equal(
    detectPlatform("https://disneyplus.com.evil.test/video/ABC"),
    "other",
  );
});

test("ignores case and a www prefix", () => {
  assert.equal(detectPlatform("HTTPS://WWW.NETFLIX.COM/watch/1"), "netflix");
  assert.equal(detectPlatform("https://WWW.YouTube.com/watch?v=a"), "youtube");
});
