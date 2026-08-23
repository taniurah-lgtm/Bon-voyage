// 合言葉ゲートの共通部分。
// 合言葉そのものはリポジトリに保存しない。ビルド時に環境変数で受け取り、
// 出力するのは PBKDF2 + AES-GCM の暗号文だけ。ブラウザの Web Crypto で復号する。
//
//   会員ページ  … ページの中身ぜんぶを暗号化する（中身を隠す）
//   投稿フォーム … 「ok」という短い文字列だけを暗号化する（合言葉が正しいかの判定だけに使う）
import { webcrypto as crypto } from 'node:crypto';

export const ITER = 150000;
const enc = new TextEncoder();
const b64 = (u8) => Buffer.from(u8).toString('base64');

async function deriveKey(pass, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptFor(pass, plaintext) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass.normalize('NFC'), salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext)));
  return { salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}

// 環境変数から合言葉を集める。1つも無ければ 'CHANGEME'（ビルドは通るが実運用では使えない）。
export function passphrases() {
  const list = [process.env.MEMBER_PASS, process.env.INSIDER_PASS].filter(Boolean);
  return list.length ? list : ['CHANGEME'];
}

// 検証用の合言葉で組まれたビルドを、あとから機械で見つけられるようにする。
// 出来上がったHTMLにこのコメントが入っていたら**公開してはいけない**。
// scripts/build-site.sh が最後にこれを探して警告する。
const TEST_PASSES = ['CHANGEME', 'testpass', 'test', 'password'];
export function buildStamp() {
  const p = passphrases();
  return TEST_PASSES.includes(p[0])
    ? '\n<!-- BV_BUILD: TEST_PASSPHRASE — 検証用の合言葉で組まれています。公開前に本物の MEMBER_PASS で組み直すこと -->'
    : '';
}

// ブラウザ側の復号コード。<script> にそのまま入れて使う。
export const CLIENT_DECRYPT = `
const b2u = (b) => Uint8Array.from(atob(b), c => c.charCodeAt(0));
async function bvDeriveKey(pass, salt, iter){
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations:iter, hash:'SHA-256'}, base, {name:'AES-GCM', length:256}, false, ['decrypt']);
}
async function bvTryUnlock(pass, blobs, iter){
  pass = (pass || '').normalize('NFC');
  for (const blob of blobs){
    try {
      const key = await bvDeriveKey(pass, b2u(blob.salt), iter);
      const pt = await crypto.subtle.decrypt({name:'AES-GCM', iv:b2u(blob.iv)}, key, b2u(blob.ct));
      return new TextDecoder().decode(pt);
    } catch(e) {}
  }
  return null;
}`;

// JSON を <script type="application/json"> に安全に入れる（</script> で閉じられないように）
export const jsonInTag = (obj) =>
  JSON.stringify(obj)
    .replace(/</g, '\\u003c')          // </script> で閉じられるのを防ぐ
    .replace(/\u2028/g, '\\u2028')   // JS のソース上で改行と見なされてしまう文字
    .replace(/\u2029/g, '\\u2029');

export const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
