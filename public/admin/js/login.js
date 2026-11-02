document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  const btn = document.getElementById("btn");
  if (btn.disabled) return;
  btn.disabled = true; btn.textContent = "登录中…";
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "登录失败");
    tokenStore.set(data.token);
    location.replace("/admin/dashboard");
  } catch (err) {
    toast(err.message, "err");
    btn.disabled = false; btn.textContent = "登 录";
  }
});
// 有效会话才进入后台；失效会话由 api() 清理，停留登录页。
if (tokenStore.get()) {
  ensureUser().then(() => location.replace("/admin/dashboard")).catch((error) => {
    if (tokenStore.get()) toast(error.message, "err");
  });
}
