/*
 * Gemini を呼ぶときの共通部品（SNS の下書き・ページの読み取り）。
 *
 * 🔴 2026-11-01: 10/28〜11/1 の5日のうち4日、SNS の下書きが「全モデル失敗」になった。
 *   - 最初のモデルが 503（混雑）→ すぐ次を呼ぶと 429（毎分の上限）… 待たずに次々呼んでいた
 *   - gemini-2.0-flash・gemini-2.5-flash-lite が 404（引退）… 名前を手で書いていた
 *   - 新しいモデルに「思考0（thinkingBudget: 0）」を付けると 400 … 2.5系だけの指定だった
 * → ① 使えるモデルを毎回 API に聞く ② 503・429 は待って同じモデルで試し直す ③ 思考0は 2.5系だけ
 */

const API = 'https://generativelanguage.googleapis.com/v1beta';

// 版の付いた正式名（gemini-3.8-flash / gemini-3.5-flash-lite など）を新しい順に。preview・exp・image などは除く
const ver = (n) => (n.match(/^gemini-([\d.]+)-/) || [, '0'])[1].split('.').map(Number);
const newer = (a, b) => {
  const x = ver(a), y = ver(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((y[i] || 0) !== (x[i] || 0)) return (y[i] || 0) - (x[i] || 0);
  return 0;
};

/** 試すモデルの順番。GEMINI_MODEL があればそれだけ。API に聞けなければ別名（-latest）だけ */
export async function geminiModels(key, { lite = true } = {}) {
  if (process.env.GEMINI_MODEL) return [process.env.GEMINI_MODEL];
  const fallback = ['gemini-flash-latest', ...(lite ? ['gemini-flash-lite-latest'] : [])];
  try {
    const res = await fetch(`${API}/models?pageSize=1000&key=${key}`);
    if (!res.ok) throw new Error(String(res.status));
    const names = ((await res.json()).models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((n) => /^gemini-[\d.]+-flash(-lite)?$/.test(n));
    const flash = names.filter((n) => !n.endsWith('-lite')).sort(newer).slice(0, 2);
    const flashLite = names.filter((n) => n.endsWith('-lite')).sort(newer).slice(0, 1);
    return [...new Set(['gemini-flash-latest', ...flash, ...(lite ? ['gemini-flash-lite-latest', ...flashLite] : [])])];
  } catch {
    return fallback;
  }
}

/** 思考0（thinkingBudget: 0）を付けてよいモデルか。2.5系だけ（新しいモデルは 400 を返す） */
export const takesThinkingBudget = (model) => /^gemini-2\.5-/.test(model);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WAITS = [30, 90, 180]; // 秒

/** エラーの本文から、上限の種類と待つ秒数を拾う（メッセージにも載せる） */
export function describeError(status, raw) {
  const quota = (raw.match(/"quotaId":\s*"([^"]+)"/) || [])[1] || '';
  const delay = Number((raw.match(/"retryDelay":\s*"(\d+)(?:\.\d+)?s"/) || [])[1] || 0);
  const msg = (raw.match(/"message":\s*"([^"]{0,160})/) || [])[1] || raw.slice(0, 160);
  return { quota, delay, text: `${status} ${msg}${quota ? `（${quota}）` : ''}` };
}

/**
 * 503（混雑）と 429（毎分の上限）のときだけ、待って同じ呼び出しを試し直す。
 * 1日の上限（PerDay）は待っても戻らないので、すぐ諦める。404・400 も試し直さない。
 * fn は失敗時に { status, raw } を持つ Error を投げること。
 */
export async function withRetry(fn, onWait = () => {}) {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const daily = /PerDay/i.test(e.raw || '');
      const transient = e.status === 503 || (e.status === 429 && !daily);
      if (!transient || i >= WAITS.length) throw e;
      const { delay } = describeError(e.status, e.raw || '');
      const wait = Math.min(Math.max(delay, WAITS[i]), 300);
      onWait(e, wait);
      await sleep(wait * 1000);
    }
  }
}
