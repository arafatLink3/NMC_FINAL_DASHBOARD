// Quick smoke probe — load /login and dump any JS errors.
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + (e.stack || e.message)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text());
  });
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  const text = await page.evaluate(() => document.body.innerText || '(empty body)');
  console.log('--- BODY ---');
  console.log(text.slice(0, 800));
  console.log('--- ERRORS ---');
  console.log(errors.join('\n'));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });