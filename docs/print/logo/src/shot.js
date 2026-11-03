const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1800,height:1080}});
for(const n of process.argv.slice(2)){await p.goto('file://'+process.cwd()+'/'+n+'.html');await p.waitForTimeout(1500);await p.evaluate(()=>document.fonts.ready);
await p.locator('body > svg').screenshot({path:n+'.png',omitBackground:true});console.log('ok',n)}await b.close()})();
