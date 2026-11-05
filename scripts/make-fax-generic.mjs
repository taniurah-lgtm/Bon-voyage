/**
 * 宛先の園名・FAX番号・日付を空けない「どの園にも送れる」FAX一式（送信票＋いつものチラシ〔片面・白黒〕＝2枚。2026-11-05 から）。
 * 奥さまが自分でスマホから送る用（docs/fax-howto-wife.md）。
 *   node scripts/make-fax-generic.mjs <作業用.pdf>  <出力.pdf>
 */
import { execFileSync, execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import('playwright').catch(async () => {
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return import(pathToFileURL(root + '/playwright/index.mjs').href);
});
const repo=process.cwd(), tmp=process.argv[2], out=process.argv[3];
const q=new URLSearchParams({to:'　',fax:'　',name:'園長先生',pages:'2'});
const b=await chromium.launch(); const p=await b.newPage();
await p.goto(pathToFileURL(repo+'/docs/print/fax-cover.html').href+'?'+q,{waitUntil:'networkidle'});
await p.evaluate(()=>{document.getElementById('date')?.remove(); document.getElementById('fax')?.closest('.small')?.remove(); const t=document.getElementById('to'); if(t){t.nextElementSibling?.tagName==='BR'&&t.nextElementSibling.remove(); t.remove();}});
await p.evaluate(()=>document.fonts.ready);
await p.pdf({path:tmp,preferCSSPageSize:true,printBackground:true}); await b.close();
execFileSync('pdfunite',[tmp,repo+'/docs/homepage/assets/flyer-a4-bw.pdf',out]);
console.log('ok');
