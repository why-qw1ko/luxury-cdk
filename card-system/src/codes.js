/** 领取 CDK 生成与内容类型识别（纯函数，无副作用） */
import crypto from "node:crypto";

// 去掉易混淆字符 I / O / 0 / 1
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const CODE_LENGTH = 16;
export const MAX_CODE_LENGTH = 32;
export const MIN_CODE_LENGTH = 4;

export const CONTENT_TYPES = ["code", "link", "text"];
export const CONTENT_TYPE_LABEL = { code: "兑换码", link: "链接", text: "文本" };

/** 归一化：去除非字母数字并转大写，用于存储与比对（用户输入的横线/空格自动忽略） */
export function normalizeClaimCode(v) {
  return String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * 展示格式：每 4 位一组。
 * 之前只对「恰好 16 位」分组，于是带前缀的 CDK（19 位起）会退化成一条无分隔的长串，
 * 既不好读也很难手抄。这里改为任意长度都按 4 位分组。
 * 注意：横杠只是显示效果，claim 入口会 normalize 掉，不影响比对。
 */
export function formatClaimCode(code) {
  const c = normalizeClaimCode(code);
  return c.length <= 4 ? c : c.match(/.{1,4}/g).join("-");
}

/** 生成随机 CDK（crypto 强随机 + randomInt 避免模偏差） */
export function generateClaimCode({ length = CODE_LENGTH, prefix = "" } = {}) {
  const n = Math.min(MAX_CODE_LENGTH, Math.max(MIN_CODE_LENGTH, Number(length) || CODE_LENGTH));
  let out = "";
  for (let i = 0; i < n; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return normalizeClaimCode(prefix) + out;
}

/** 内容类型识别：http(s) / www 开头视为链接，其余按兑换码处理 */
export function detectContentType(payload, prefer = "auto") {
  const s = String(payload ?? "").trim();
  if (CONTENT_TYPES.includes(prefer)) return prefer;
  return /^(https?:\/\/|www\.)\S+$/i.test(s) ? "link" : "code";
}
