import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { registerPages } from "../src/pages.js";

test("页面路由无后缀，旧链接跳转，静态资源仍可访问", async (t) => {
  const publicDir = fileURLToPath(new URL("../public", import.meta.url));
  const app = express();
  registerPages(app, publicDir);
  app.use(express.static(publicDir, { index: false, redirect: false }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const route of ["/admin", "/admin/"]) {
    const res = await fetch(base + route, { redirect: "manual" });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/admin/login");
  }
  for (const page of ["login", "dashboard", "project", "received", "users", "settings"]) {
    for (const suffix of [".html", "/"]) {
      const res = await fetch(`${base}/admin/${page}${suffix}`, { redirect: "manual" });
      assert.equal(res.status, 301);
      assert.equal(res.headers.get("location"), `/admin/${page}`);
    }
    const res = await fetch(`${base}/admin/${page}`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /\/js\/interactions\.js/);
    assert.doesNotMatch(html, /(?:href|src)="\/admin\/[^" ]+\.html/);
    for (const [, asset] of html.matchAll(/(?:src|href)="(\/[^" ]+\.(?:js|css))"/g)) {
      assert.equal((await fetch(base + asset)).status, 200, path.basename(asset));
    }
  }
  assert.equal((await fetch(base + "/")).status, 200);
  assert.equal((await fetch(base + "/admin/not-a-page")).status, 404);
});
