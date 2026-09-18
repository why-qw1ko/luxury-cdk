document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = document.getElementById("password").value;
  const btn = document.getElementById("btn");
  btn.disabled = true; btn.textContent = "登录中…";
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "登录失败");
    tokenStore.set(data.token);
    location.href = "/admin/dashboard.html";
  } catch (err) {
    toast(err.message, "err");
    btn.disabled = false; btn.textContent = "登 录";
  }
});
// 已登录直接进入
if (tokenStore.get()) location.href = "/admin/dashboard.html";