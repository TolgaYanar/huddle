const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  EVENT_BUDGETS,
  createEventBudget,
  attachEventBudget,
} = require("../eventBudget");

describe("createEventBudget", () => {
  it("drops events past the budget and shares it across the group", () => {
    const allow = createEventBudget([
      { name: "g", windowMs: 60_000, max: 3, events: ["a", "b"] },
    ]);
    assert.equal(allow("a"), true);
    assert.equal(allow("b"), true);
    assert.equal(allow("a"), true);
    assert.equal(allow("b"), false);
    assert.equal(allow("a"), false);
  });

  it("lets events outside every budget through", () => {
    const allow = createEventBudget([
      { name: "g", windowMs: 60_000, max: 1, events: ["a"] },
    ]);
    allow("a");
    for (let i = 0; i < 100; i += 1) assert.equal(allow("send_chat"), true);
  });

  it("admits a full 500-item playlist import paced at 10/s", () => {
    const playlist = EVENT_BUDGETS.find((b) => b.name === "playlist-write");
    // 10 per second over any 10 s window is 100, under the budget.
    assert.ok(playlist.max > (10 * playlist.windowMs) / 1000);
  });
});

describe("attachEventBudget", () => {
  it("only calls next() for packets within budget", () => {
    let middleware;
    const socket = {
      use(fn) {
        middleware = fn;
      },
    };
    attachEventBudget(socket, [
      { name: "g", windowMs: 60_000, max: 2, events: ["wheel_spin"] },
    ]);

    let passed = 0;
    for (let i = 0; i < 5; i += 1) {
      middleware(["wheel_spin", {}], () => {
        passed += 1;
      });
    }
    assert.equal(passed, 2);
  });
});

describe("EVENT_BUDGETS", () => {
  it("names only events a handler actually registers", () => {
    const dir = path.join(__dirname, "../../handlers");
    const source = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".js"))
      .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
      .join("\n");
    for (const budget of EVENT_BUDGETS) {
      for (const event of budget.events) {
        assert.ok(
          source.includes(`socket.on("${event}"`),
          `${event} in budget ${budget.name} is not a registered event`,
        );
      }
    }
  });

  it("puts each event in at most one budget", () => {
    const seen = new Set();
    for (const budget of EVENT_BUDGETS) {
      for (const event of budget.events) {
        assert.equal(seen.has(event), false, `${event} is listed twice`);
        seen.add(event);
      }
    }
  });
});
