import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initDb } from "./db.js";
import { authRouter } from "./auth.js";
import { batchRouter } from "./routes/batches.js";
import { claimRouter } from "./routes/claims.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { usersRouter } from "./routes/users.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const PORT = process.env.PORT || 8598;

/**
 * 反向代理信任配置。默认关闭：此时只使用 TCP 连接来源地址，客户端伪造
 * x-forwarded-for 不会生效。部署在 Nginx / Cloudflare 等代理后面时按需开启：
 *   TRUST_PROXY=1            只信任一层代理
 *   TRUST_PROXY=loopback     信任本机代理
 *   TRUST_PROXY=10.0.0.0/8   信任指定网段
 */
function trustProxySetting(raw) {
  const v = String(raw ?? "").trim();
  if (!v || v === "0" || v.toLowerCase() === "false") return null;
  if (v.toLowerCase() === "true") return true;
  if (/^\d+$/.test(v)) return Number(v);
  return v; // 交给 Express 解析 IP / CIDR / 预置名称
}

async function main() {
  await initDb();

  const app = express();
  const trust = trustProxySetting(process.env.TRUST_PROXY);
  if (trust !== null) app.set("trust proxy", trust);
  app.use(express.json({ limit: "2mb" }));

  app.use("/api/auth", authRouter());
  app.use("/api/batches", batchRouter());
  app.use("/api/claims", claimRouter());
  app.use("/api/dashboard", dashboardRouter());
  app.use("/api/users", usersRouter());

  app.use(express.static(PUBLIC_DIR));

  // 前台领取页
  app.get("/", (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "index.html"));
  });

  app.listen(PORT, () => {
    console.log(`卡密发放系统已启动: http://localhost:${PORT}`);
    console.log(`后台管理: http://localhost:${PORT}/admin/`);
    // 仅在未自定义密码时提示默认口令，避免把环境变量里的真实密码写进日志
    if (!process.env.ADMIN_PASSWORD) {
      console.log("默认管理员: admin / admin123（建议设置 ADMIN_PASSWORD 后重新初始化）");
    }
  });
}

main().catch((e) => {
  console.error("启动失败:", e);
  process.exit(1);
});
