import { chromium } from 'playwright';
const BASE = 'http://localhost:5173';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(BASE);
await page.waitForTimeout(5000);

const demoBtn = page.locator('.viz-toggle button', { hasText: /demo view/i }).first();
if (await demoBtn.isVisible()) { await demoBtn.click(); await page.waitForTimeout(3000); }

// Scroll the top of PixelSim canvas into view
await page.evaluate(() => {
  const wrapper = document.querySelector('.pixel-sim-wrapper');
  if (wrapper) wrapper.scrollIntoView({ behavior: 'instant', block: 'start' });
});
await page.waitForTimeout(300);
await page.screenshot({ path: 'audit-demo-top.png', fullPage: false });
console.log('Demo top screenshot done');

// Check pixel-sim-overlay-top
const overlayCheck = await page.evaluate(() => {
  const top = document.querySelector('.pixel-sim-overlay-top');
  const title = document.querySelector('.pixel-sim-title-text');
  const dot = document.querySelector('.pixel-sim-live-dot');
  const toggle = document.querySelector('.pixel-sim-toggle');
  const bottom = document.querySelector('.pixel-sim-overlay-bottom');
  const right = document.querySelector('.pixel-sim-overlay-right');
  const getStyle = el => el ? {
    display: getComputedStyle(el).display,
    visibility: getComputedStyle(el).visibility,
    opacity: getComputedStyle(el).opacity,
    h: el.getBoundingClientRect().height,
    w: el.getBoundingClientRect().width,
    text: el.textContent?.trim().slice(0,30),
  } : null;
  return {
    overlayTop: getStyle(top),
    titleText: getStyle(title),
    liveDot: getStyle(dot),
    toggle: getStyle(toggle),
    overlayBottom: getStyle(bottom),
    overlayRight: getStyle(right),
  };
});
console.log('Overlay check:', JSON.stringify(overlayCheck, null, 2));

await browser.close();
