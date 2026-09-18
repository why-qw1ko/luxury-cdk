/* 主题初始化：必须在 <head> 中同步加载，避免暗色用户看到白屏闪烁。
   优先级：localStorage 手动选择 > 系统偏好。 */
(function () {
  var KEY = "card_theme";
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  var dark =
    saved === "dark" ||
    (saved !== "light" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (dark) document.documentElement.classList.add("dark");
  // 把「跟随系统」的实时变化同步过来（用户没手动选过时）
  if (!saved && window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function (e) {
      document.documentElement.classList.toggle("dark", e.matches);
    });
  }
})();

/** 切换亮 / 暗，返回切换后的主题名 */
window.toggleTheme = function () {
  var root = document.documentElement;
  var dark = !root.classList.contains("dark");
  root.classList.toggle("dark", dark);
  try { localStorage.setItem("card_theme", dark ? "dark" : "light"); } catch (e) {}
  return dark ? "dark" : "light";
};
