import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const OUT = 'C:/Users/admin/AppData/Local/Temp/audit';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

const errors = [];
page.on('console', msg => {
  if (msg.type() === 'error') errors.push(msg.text());
});

await page.goto('http://localhost:5173');
await page.waitForTimeout(3000);

// Navigate to OPS VIEW
const opsBtns = await page.locator('button').filter({ hasText: /ops\s*view/i }).all();
if (opsBtns.length > 0) {
  await opsBtns[0].click();
  await page.waitForTimeout(2000);
}

// Set LIVE mode
const liveBtns = await page.locator('button').filter({ hasText: /live/i }).all();
for (const btn of liveBtns) {
  if (await btn.isVisible()) {
    await btn.click();
    break;
  }
}
await page.waitForTimeout(3000);

// Take OPS VIEW + LIVE screenshot
await page.screenshot({ path: OUT + '/audit-final-ops.png', fullPage: false });
console.log('OPS VIEW + LIVE done');

// Go to DEMO VIEW
const demoBtns = await page.locator('button').filter({ hasText: /demo\s*view/i }).all();
for (const btn of demoBtns) {
  if (await btn.isVisible()) {
    await btn.click();
    break;
  }
}
await page.waitForTimeout(3000);
await page.screenshot({ path: OUT + '/audit-final-demo.png', fullPage: false });
console.log('DEMO VIEW + LIVE done');

// Full DOM check
const audit = await page.evaluate(() => {
  const canvas = document.querySelector('canvas.pixel-sim-canvas');
  const wr = document.querySelector('.pixel-sim-wrapper');
  const top = document.querySelector('.pixel-sim-overlay-top');
  const bot = document.querySelector('.pixel-sim-overlay-bot');
  const right = document.querySelector('.pixel-sim-overlay-right');
  return {
    canvas: { found: !!canvas, w: canvas?.width, h: canvas?.height },
    wrapper: !!wr,
    overlayTop: { found: !!top, text: top?.textContent?.trim().slice(0,100) },
    overlayBot: { found: !!bot, text: bot?.textContent?.trim().slice(0,120) },
    overlayRight: { found: !!right, text: right?.textContent?.trim().slice(0,200) },
  };
});
console.log('DOM audit:', JSON.stringify(audit, null, 2));

writeFileSync(OUT + '/audit-final-checks.json', JSON.stringify({ audit, errors }, null, 2));
console.log('Errors:', errors.length);
errors.forEach(e => console.log(' ', e));
await browser.close();
