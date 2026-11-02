import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const interactions = readFileSync(new URL("../public/js/interactions.js", import.meta.url), "utf8");
const common = readFileSync(new URL("../public/admin/js/common.js", import.meta.url), "utf8");
function imeHarness() {
  const handlers = new Map();
  let now = 0;
  const context = vm.createContext({
    window: {}, performance: { now: () => now },
    document: { addEventListener: (name, handler, capture) => {
      assert.equal(capture, true);
      handlers.set(name, handler);
    } },
  });
  vm.runInContext(interactions, context);
  const target = {};
  return {
    setTime: (value) => { now = value; },
    emit: (type, props = {}) => {
      const event = { target, key: "Enter", keyCode: 13, isComposing: false, prevented: false, stopped: false,
        preventDefault() { this.prevented = true; },
        stopImmediatePropagation() { this.stopped = true; }, ...props };
      handlers.get(type)(event);
      return event;
    },
  };
}

test("中文输入的选字回车、229 和结束后 500ms 内回车不会提交", () => {
  const h = imeHarness();
  assert.equal(h.emit("keydown").prevented, false);
  assert.equal(h.emit("keydown", { isComposing: true }).stopped, true);
  assert.equal(h.emit("keydown", { keyCode: 229 }).prevented, true);
  assert.equal(h.emit("keydown", { key: "Process", keyCode: 229 }).prevented, false);
  h.emit("compositionstart");
  assert.equal(h.emit("keydown").prevented, true);
  assert.equal(h.emit("keydown", { key: "a", keyCode: 65 }).prevented, false);
  h.setTime(1000);
  h.emit("compositionend");
  h.setTime(1499);
  assert.equal(h.emit("keydown").prevented, true);
  h.setTime(1500);
  assert.equal(h.emit("keydown").prevented, false);
});

test("复制对勾在最后一次复制 2.5 秒后恢复，保留原按钮内容", () => {
  let clock = 0, id = 0;
  const timers = new Map();
  const context = vm.createContext({ window: {}, document: {
    addEventListener() {}, createElement: () => ({ setAttribute() {}, remove() { this.removed = true; } }),
  }, setTimeout: (callback, delay) => { timers.set(++id, { callback, at: clock + delay }); return id; },
  clearTimeout: (key) => timers.delete(key) });
  vm.runInContext(common, context);
  const classes = new Set();
  let indicator;
  const button = { innerHTML: "原复制图标与文案", classList: {
    contains: (key) => classes.has(key), add: (key) => classes.add(key), remove: (key) => classes.delete(key),
  }, appendChild: (child) => { indicator = child; }, querySelector: () => indicator };
  context.showCopyFeedback(button);
  assert.equal(classes.has("is-copied"), true);
  clock = 2000;
  context.showCopyFeedback(button);
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].at, 4500);
  [...timers.values()][0].callback();
  assert.equal(classes.has("is-copied"), false);
  assert.equal(button.innerHTML, "原复制图标与文案");
  assert.equal(indicator.removed, true);
});

test("登录页失效 Token 会清除且不会重定向回自身", async () => {
  let cleared = false;
  const location = { pathname: "/admin/login", href: "unchanged" };
  const context = vm.createContext({ window: {}, document: { addEventListener() {} }, location,
    localStorage: { getItem: () => "expired", removeItem: () => { cleared = true; } },
    fetch: async () => ({ status: 401 }) });
  vm.runInContext(common, context);
  await assert.rejects(context.api("/api/auth/me"), /未登录/);
  assert.equal(cleared, true);
  assert.equal(location.href, "unchanged");
  location.pathname = "/admin/project";
  await assert.rejects(context.api("/api/auth/me"), /未登录/);
  assert.equal(location.href, "/admin/login");
});
