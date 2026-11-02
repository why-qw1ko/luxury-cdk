import path from "node:path";

// 页面名固定，URL 参数不能进入文件路径。
export function registerPages(app, publicDir) {
  app.get(["/admin", "/admin/"], (_req, res) => res.redirect(302, "/admin/login"));
  app.get("/index.html", (_req, res) => res.redirect(301, "/"));
  app.get("/", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));
  for (const page of ["login", "dashboard", "project", "received", "users", "settings"]) {
    const url = `/admin/${page}`;
    app.get([`${url}.html`, new RegExp(`^${url}/$`)], (_req, res) => res.redirect(301, url));
    app.get(url, (_req, res) => res.sendFile(path.join(publicDir, "admin", `${page}.html`)));
  }
}
