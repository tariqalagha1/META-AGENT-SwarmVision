import { chromium } from 'playwright';
const BASE = 'http://localhost:5173';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(BASE);
await page.waitForTimeout(5000);

// Switch to DEMO VIEW
const demoBtn = page.locator('.viz-toggle button', { hasText: /demo view/i }).first();
if (await demoBtn.isVisible()) { await demoBtn.click(); await page.waitForTimeout(3000); }

const canvases = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('canvas'));
  return all.map((c, i) => {
    const rect = c.getBoundingClientRect();
    const parent = c.parentElement;
    return {
      index: i,
      pixelW: c.width, pixelH: c.height,
      cssW: Math.round(rect.width), cssH: Math.round(rect.height),
      style: c.getAttribute('style')?.slice(0, 60),
      parentClass: parent?.className?.slice(0, 60),
      visible: rect.width > 0 && rect.height > 0,
    };
  });
});
console.log('All canvases:', JSON.stringify(canvases, null, 2));

await browser.close();
