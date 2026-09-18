import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initDb } from "./db.js";
import { authRouter } from "./auth.js";
import { batchRouter } from "./routes/batches.js";
import { claimRouter } from "./routes/claims.js";
import { dashboardRouter } from "./routes/dashboard.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const PORT = process.env.PORT || 8598;

async function main() {
  await initDb();

  const app = express();
  app.set("trust proxy", true);
  app.use(express.json({ limit: "2mb" }));

  app.use("/api/auth", authRouter());
  app.use("/api/batches", batchRouter());
  app.use("/api/claims", claimRouter());
  app.use("/api/dashboard", dashboardRouter());

  app.use(express.static(PUBLIC_DIR));

  // 前台领取页
  app.get("/", (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "index.html"));
  });

  app.listen(PORT, () => {
    console.log(`卡密发放系统已启动: http://localhost:${PORT}`);
    console.log(`后台管理: http://localhost:${PORT}/admin/`);
    console.log(`默认密码: ${process.env.ADMIN_PASSWORD || "admin123"} (可用环境变量 ADMIN_PASSWORD 修改)`);
  });
}

main().catch((e) => {
  console.error("启动失败:", e);
  process.exit(1);
});