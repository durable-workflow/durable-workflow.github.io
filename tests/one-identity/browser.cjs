// Built-site checks. Use an existing Playwright client and an owned browser.
// Usage: NODE_PATH=<tool modules> DW_BROWSER_EXECUTABLE=<browser> node browser.cjs <build> <output>
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const {createHash} = require('node:crypto');
const root = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const types = {'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.ico':'image/x-icon','.txt':'text/plain'};
const report = {checks: [], screenshots: [], browser: null, syntheticStatus: true, sourceRevision: process.env.DW_SOURCE_REVISION || null, clientVersion: require('playwright/package.json').version};
let page;
function fixture(state = 'operational') {
  const now = Date.now();
  const result = {
    schema:'durable_workflow.status_page_snapshot.v1', product:'cloud', environment:'prod',
    checked_at: new Date(now - 10000).toISOString(), generated_at: new Date(now - 5000).toISOString(),
    status:'ok', alert_level:'ok', customer_visible:false, components:[],
    freshness:{status:'fresh',age_seconds:10,stale_after_seconds:900},
    customer_impact:{status:'ok',alert_level:'ok',affected_families:[]},
  };
  if (state === 'degraded') result.status = result.alert_level = 'warning';
  if (state === 'incident') {result.status = 'failed'; result.alert_level = 'critical';}
  if (state === 'stale') {result.checked_at = new Date(now - 901000).toISOString();}
  if (state === 'unknown') result.status = result.alert_level = 'unknown';
  return result;
}
async function check(name, fn) {
  await fn(); report.checks.push(name); console.log('PASS', name);
}
async function screenshot(name, fullPage = false) {
  await page.screenshot({path:path.join(output,name+'.png'),fullPage});
  report.screenshots.push(name+'.png');
}
async function noOverflow() {
  const sizes = await page.evaluate(() => ({width: innerWidth, content: document.documentElement.scrollWidth}));
  assert.ok(sizes.content <= sizes.width + 1, JSON.stringify(sizes));
}
async function run() {
  await fs.mkdir(output,{recursive:true});
  report.buildIndexSha256 = createHash('sha256').update(await fs.readFile(path.join(root,'index.html'))).digest('hex');
  const server = http.createServer(async (req,res) => {
    try {
      let file = path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
      if (file !== root && !file.startsWith(root+path.sep)) throw new Error('path');
      if ((await fs.stat(file)).isDirectory()) file = path.join(file,'index.html');
      const body = await fs.readFile(file);
      res.writeHead(200,{'Content-Type':types[path.extname(file)] || 'application/octet-stream'}); res.end(body);
    } catch {res.writeHead(404);res.end('Not found');}
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base = 'http://127.0.0.1:'+server.address().port;
  let browser;
  try {
    browser = await chromium.launch({headless:true,executablePath:process.env.DW_BROWSER_EXECUTABLE,args:['--renderer-process-limit=2','--disable-background-networking']});
    report.browser = browser.version();
    for (const theme of ['light','dark']) {
      for (const width of [1440,390]) {
        const context = await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
        await context.grantPermissions(['clipboard-read','clipboard-write']);
        await context.addInitScript(theme => localStorage.setItem('theme',theme),theme);
        let status = 'operational';
        await context.route('https://status.durable-workflow.com/api/current.json', route => status === 'offline' ? route.abort('failed') : route.fulfill({contentType:'application/json',body:JSON.stringify(fixture(status))}));
        page = await context.newPage();
        const errors = []; page.on('pageerror',error=>errors.push(error.message));
        await page.goto(base+'/',{waitUntil:'networkidle'});
        await page.evaluate(() => document.fonts.ready);
        await page.waitForFunction(() => document.querySelector('.dw-status-pill')?.dataset.status === 'operational');
        await check(`${theme}/${width}: home fits viewport and uses selected theme`,async()=>{
          await noOverflow(); assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
          assert.equal(await page.locator('.dw-wordmark').first().innerText(),'Durable Workflow');
          assert.equal(await page.locator('.dw-logo-chip img').first().evaluate(img=>img.naturalWidth),200);
        });
        await check(`${theme}/${width}: action text meets 4.5:1 contrast`,async()=>{
          const ratios = await page.locator('.button').evaluateAll(nodes => {
            const luminance = color => {
              const channels = color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
              return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
            };
            return nodes.map(node=>{
              const style=getComputedStyle(node); const a=luminance(style.color); const b=luminance(style.backgroundColor);
              return {text:node.textContent,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
            });
          });
          assert.ok(ratios.every(item=>item.ratio>=4.5),JSON.stringify(ratios));
        });
        await screenshot(`home-${theme}-${width}`,true);
        await check(`${theme}/${width}: SDK disclosure opens and closes with keyboard`,async()=>{
          if (width < 997) await page.getByRole('button',{name:'Toggle navigation bar'}).click();
          const selector = width < 997 ? '.navbar-sidebar .dw-sdk-switcher' : '.dw-global-navigation .dw-sdk-switcher';
          const trigger = page.locator(selector+' > button');
          await trigger.focus(); await page.keyboard.press('Enter');
          assert.equal(await trigger.getAttribute('aria-expanded'),'true');
          const links = page.locator(selector+' .dw-sdk-links a');
          assert.equal(await links.count(),3);
          assert.deepEqual(await links.evaluateAll(nodes=>nodes.map(n=>n.href)),['https://python.durable-workflow.com/','https://rust.durable-workflow.com/','https://php.durable-workflow.com/']);
          await page.keyboard.press('Tab'); await page.keyboard.press('Escape');
          assert.equal(await trigger.getAttribute('aria-expanded'),'false');
          assert.equal(await trigger.evaluate(node=>node===document.activeElement),true);
          if (width < 997) {
            assert.equal(await page.locator('.dw-docs-toolbar').evaluate(node=>node.inert),true);
            await page.keyboard.press('Escape');
            await page.waitForFunction(()=>!document.querySelector('.navbar-sidebar--show'));
            assert.equal(await page.getByRole('button',{name:'Toggle navigation bar'}).evaluate(node=>node===document.activeElement),true);
            assert.equal(await page.locator('.dw-docs-toolbar').evaluate(node=>node.inert),false);
          }
        });
        await page.goto(base+'/docs/installation/',{waitUntil:'networkidle'});
        await check(`${theme}/${width}: docs and code stay contained`,noOverflow);
        assert.equal(await page.locator('pre').first().evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(15, 21, 19)');
        await screenshot(`docs-${theme}-${width}`);
        await check(`${theme}/${width}: copy control copies actual code`,async()=>{
          const block = page.locator('div[class*="codeBlockContainer"]').first();
          const expected = (await block.locator('pre').innerText()).trim();
          const copy = block.getByRole('button',{name:/Copy code to clipboard/});
          await copy.click();
          const actual = await page.evaluate(()=>navigator.clipboard.readText());
          assert.equal(actual.trim(),expected);
        });
        await check(`${theme}/${width}: historical version navigation works`,async()=>{
          const versions = page.locator('.dw-docs-controls .dropdown').first();
          await versions.locator('a[role="button"]').press('Enter');
          await versions.getByRole('link',{name:'1.x',exact:true}).click();
          await page.waitForURL('**/docs/1.x/**');
          await noOverflow(); assert.ok(await page.locator('main h1').innerText());
        });
        assert.deepEqual(errors,[]);
        await context.close();
      }
    }
    const context = await browser.newContext({viewport:{width:768,height:1024},colorScheme:'dark'});
    let status = 'operational';
    await context.route('https://status.durable-workflow.com/api/current.json',route=>status==='offline'?route.abort('failed'):route.fulfill({contentType:'application/json',body:JSON.stringify(fixture(status))}));
    page = await context.newPage();
    await page.goto(base+'/',{waitUntil:'networkidle'});
    await check('light default ignores system dark until user opts in',async()=>{
      assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
      await page.getByRole('button',{name:/Switch between dark and light mode/}).click();
      assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
      await page.reload({waitUntil:'networkidle'});
      assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    });
    for (status of ['operational','degraded','incident','stale','unknown','offline']) {
      await page.goto(base+'/',{waitUntil:'networkidle'});
      const expected = status === 'offline' ? 'unknown' : status;
      await page.waitForFunction(expected=>document.querySelector('.dw-status-pill')?.dataset.status === expected,expected);
      await check(`built status ${status} => ${expected}`,async()=>{
        await noOverflow(); assert.equal(await page.locator('.dw-status-pill').getAttribute('href'),'https://status.durable-workflow.com/');
      });
    }
    await page.goto(base+'/docs/introduction/',{waitUntil:'networkidle'});
    await check('built search returns navigable documentation results',async()=>{
      const input=page.locator('.navbar__search-input');
      await input.fill('installation');
      const result=page.locator('.navbar__search [class*="suggestion"]').first();
      await result.waitFor({state:'visible'});
      await input.press('Enter');
      await page.waitForURL(url=>url.pathname !== '/docs/introduction/');
      assert.ok(new URL(page.url()).pathname.startsWith('/docs/') || new URL(page.url()).pathname.startsWith('/search'));
    });
    await context.close();
  } catch(error) {
    report.failure = error.stack;
    if(page&&!page.isClosed()) await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});
    throw error;
  } finally {
    await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
const guard = setTimeout(()=>{console.error('Absolute preview deadline');process.exit(124);},230000);
run().then(()=>{clearTimeout(guard);console.log(JSON.stringify(report));}).catch(error=>{clearTimeout(guard);console.error(error);process.exitCode=1;});
