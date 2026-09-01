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
| 1   | Real `<video>` element      |         |             |
| 2   | Position readable           |         |             |
| 3   | Position writable           |         |             |
| 4   | Play/pause drivable         |         |             |
| 5   | Stable content id           |         |             |
| 6   | Survives in-page navigation |         |             |
| 7   | Tier timelines match        |         |             |

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

## After both spikes

1. Pick the winner on score, with the two gates applied first.
2. Design the adapter interface against three platforms: Netflix plus both
   spikes, including the loser. Designing against the loser too is what stops
   the interface from being shaped by one implementation.
3. Migrate Netflix onto it with no behaviour change, guarded by the sync
   telemetry already collecting in production.
4. Only then build the winner.
