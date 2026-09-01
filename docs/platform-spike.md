# Platform spike protocol

Phase 1 of the platform-breadth roadmap. Two throwaway investigations —
Disney+ and Prime Video — whose only output is a decision and a set of notes.
**Write no production code during a spike.** Its purpose is to learn the shape
of each player before the adapter interface is designed, because an interface
derived from Netflix alone will generalise Netflix and fit nothing else.

Budget one focused session per platform. If a question cannot be answered in
that time, record it as unanswered and move on — that is itself a finding.

## Before you start

You need a paid account on the platform and a title that plays. Open the watch
page, then DevTools → Console. Everything below is answered from the page
itself; nothing needs to be built.

## The seven questions

Answer each for both platforms. The wording matters: these are exactly the
capabilities the sync engine needs, and they are the surface the adapter will
expose.

**1. Is there a real `<video>` element?**

```js
document.querySelectorAll("video").length;
```

Then check it is the content, not an ad or a trailer: does `currentTime`
advance while the title plays, and does `duration` match the runtime?

**2. Can position be read?**

```js
document.querySelector("video").currentTime;
```

Does it track the on-screen position, or is the visible scrubber driven by a
separate player state?

**3. Can position be written?**

```js
document.querySelector("video").currentTime = 60;
```

Does the picture move? Netflix ignores this and needs its internal player API
via the MAIN world, which is why `netflixBackground.ts` exists. If a platform
accepts a plain assignment, its adapter is dramatically simpler — record that.

**4. Can play/pause be driven?**

```js
document.querySelector("video").pause();
document.querySelector("video").play();
```

Note whether `play()` rejects without a user gesture, and whether the platform
re-asserts its own state a moment later.

**5. What identifies the content?**
Look at the URL while playing. Is there a stable id? Does it survive a reload?
Does it change between episodes of a series, and is the series id separate from
the episode id? Two viewers must be able to confirm they are on the same thing.

**6. What happens on navigation?**
Go from one episode to the next without a full page load. Does the URL change?
Is the `<video>` element replaced or reused? A single-page transition that
silently swaps the element is the most common way a sync extension breaks.

**7. Does the ad-supported tier differ?**
If the platform sells a cheaper tier with ads, does the timeline include ad
breaks? If it does, two viewers on different tiers cannot share a position and
that must be handled explicitly rather than discovered in production.

## Scoring

Score each answer 0–2: **2** works plainly, **1** works through a workaround,
**0** does not work or could not be determined.

| #   | Question                    | Disney+ | Prime Video |
| --- | --------------------------- | ------- | ----------- |
| 1   | Real `<video>` element      | —       | 2           |
| 2   | Position readable           | —       | 2           |
| 3   | Position writable           | —       | 2           |
| 4   | Play/pause drivable         | —       | 2           |
| 5   | Stable content id           | —       | 1           |
| 6   | Survives in-page navigation | —       | 1           |
| 7   | Tier timelines match        | —       | 0           |

Prime Video scores **10 / 14**. The position gate passes outright. The identity
gate passes only conditionally — the URL is wrong after an in-player episode
change, and identity survives on a single non-contractual DOM hook; see finding 5. Disney+ is unmeasured — there is no subscription to run it against, so its
column stays empty rather than guessed.

Two questions are gates rather than points. A **0 on 3** (position not
writable by any means found) means the platform cannot be synchronised at all
and should be dropped regardless of total. A **0 on 5** means viewers cannot
confirm they are watching the same thing, which makes the feature unsafe rather
than merely unreliable.

## Permission surface

Record the exact hostnames a content script would need to match. Prime Video
is expected to score worse here: alongside `primevideo.com` it serves playback
from Amazon country domains, which widens the permission request considerably.

Whatever wins, it ships behind `optional_host_permissions` and is requested
when the user enables that platform. A **mandatory** host permission disables
the extension for every existing install until the user re-accepts it in
`chrome://extensions`, and most people never look there.

## What to write down

For each platform: the seven answers, the score, the hostnames, and — most
valuable — anything that surprised you. The adapter interface is designed from
these notes, not from Netflix.

## Prime Video results

Measured 2026-09-01 against a live Turkish Prime account, real Google Chrome
(Widevine is required, so a bundled Chromium cannot play the content), one
episode of a 45-minute series. Raw numbers are quoted so a later run can be
compared against them rather than re-argued.

**1 — Real `<video>` element (2).** Exactly one element, `duration` 2698s,
`readyState` 4, `currentTime` advanced 3.00s in 3s. `currentSrc` is a
`blob:` URL, so the content is fed through Media Source Extensions.

**2 — Position readable (2).** `currentTime` tracks the visible position and
`seekable` covers the whole title, `[0, 2698]`.

**3 — Position writable (2).** This is the headline result: a plain
`video.currentTime = 128` landed at 128.87 and kept running (131.87 three
seconds later), with no snap-back. Netflix ignores exactly this assignment and
needs its internal player API reached from the MAIN world, which is the entire
reason `netflixBackground.ts` exists. Prime needs none of that.

**4 — Play/pause drivable (2).** `pause()` held for at least three seconds with
no re-assertion by the platform, and `play()` resolved rather than rejecting.

**5 — Stable content id (1, not 2).** The episode id sits in the path
(`/detail/0J7QWO0J4F3V3KB4XSIJRBERI1`) and survives a reload — the reloaded page
resumed the same title at 175.8s. The season carries a different id
(`0PYX2Q4NVYSYMVUZJHDR5QEO70`), so series and episode are cleanly separable.

It is a 1 rather than a 2 because the URL stops being true mid-session, and a 1
rather than a 0 because something else stays true. Both halves were measured
across one real episode transition:

| signal                          | before                                          | after                            |
| ------------------------------- | ----------------------------------------------- | -------------------------------- |
| URL path id                     | `0J7QWO0J4F3V3KB4XSIJRBERI1`                    | `0J7QWO0J4F3V3KB4XSIJRBERI1`     |
| `video.duration`                | 2698                                            | 2601                             |
| `.atvwebplayersdk-episode-info` | `S1 E1 The Mentalist: Season 1 Episode 1 Pilot` | `S1 E2 Red Hair and Silver Tape` |
| `<video>` element               | tagged `g1`                                     | still `g1` — the same element    |

The content changed, the URL did not, and the player's own overlay did. Two
other candidate sources were ruled out by measurement rather than assumption:
`navigator.mediaSession.metadata` is `null` before and after, and the player
container holds no `amzn1.dv.gti` of its own — the 69 GTIs in the document are
the season's full episode list, which names every episode and so identifies
none.

That leaves exactly one workable source, and it is a CSS class rather than an
API. Amazon owes us nothing for `.atvwebplayersdk-episode-info` and can rename
it in any release. The adapter must therefore **fail closed**: when the episode
string cannot be read, report identity as unknown and refuse to synchronise
rather than falling back to the URL — in that exact situation the URL is not
merely stale, it is confidently wrong.

**6 — In-page navigation (1) — the dangerous one.** Clicking the player's
"Sonraki Bölüm" (Next Episode) changed the content — `duration` went from 2698
to 2601 — while **the URL did not change at all** and the _same_ `<video>`
element was reused. A `data-spikeTag` written before the click was still on the
element afterwards.

The consequence is specific: two viewers can sit on an identical URL and watch
different episodes, and an adapter that identifies content by URL would report
them as synchronised. Reloading afterwards makes it worse, because the reload
returns to the episode named in the URL, not the one that was playing.

The mitigation is cheap but it is two steps, not one. The element is reused, so
the swap necessarily fires `durationchange` / `loadedmetadata` on it — that is
the _invalidation_ signal. It says only that the content may have changed; it
does not say what the content now is, and two episodes can share a duration.
Re-deriving identity is the second step, and per finding 5 it has exactly one
source. Note this for the interface: what Netflix needs is a way to _write_
position, what Prime needs is a way to _invalidate and re-derive_ identity. An
interface designed for either one alone would miss the other.

**7 — Ad tier (0, undetermined).** No ad break occurred during the session and
the account reads as "Prime'a Dahil" (included with Prime), so nothing could be
concluded. Recorded as unanswered, which the protocol treats as a finding, not
a gap to fill by guessing.

### Permission surface — better than expected

The protocol predicted Prime would score worse here. It does not. Playback ran
entirely under a single origin the content script would need to match:

```
https://www.primevideo.com/*
```

Media arrives from CDN hosts — `a264vod-dash-pv-ta-amazon.akamaized.net`,
`*.main.amazon.pv-cdn.net`, `cf-trickplay.aux.pv-cdn.net` — and telemetry from
`*.a2z.com`, but those are fetches made _by_ the page. A content script never
runs there, so they do not belong in the permission request. Amazon country
domains such as `amazon.com.tr` appeared only during sign-in.

One caveat to confirm before shipping: this session was EU-routed
(`/region/eu/...`) under `www.primevideo.com`. Whether other regions serve the
watch page from a different host has not been tested.

### Designing with only one spike measured

The rule below says to design the interface against three platforms, including
the losing spike, so that it is not shaped by a single implementation. Disney+
is unmeasured, so the rule cannot be followed as written. It is not discarded
either: the reason behind it still holds, and Netflix plus Prime already supply
the two opposing pressures it exists to create — Netflix will not have its
position written directly, and Prime will not have its identity trusted.

Two consequences follow, and both belong in the interface review rather than in
someone's memory:

1. The interface is **provisional** until a third platform is measured against
   it. Review it against Disney+ before treating it as settled, and expect that
   review to change it.
2. Any capability that exists solely to serve Netflix, or solely to serve
   Prime, must say so where it is defined — so a later reader can tell a
   general capability from a workaround that happened to arrive first.

## After both spikes

1. Pick the winner on score, with the two gates applied first.
2. Design the adapter interface against three platforms: Netflix plus both
   spikes, including the loser. Designing against the loser too is what stops
   the interface from being shaped by one implementation.
3. Migrate Netflix onto it with no behaviour change, guarded by the sync
   telemetry already collecting in production.
4. Only then build the winner.
