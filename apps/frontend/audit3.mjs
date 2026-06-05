import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(BASE);
await page.waitForTimeout(3000);

// Switch to DEMO VIEW
const demoBtn = page.locator('.viz-toggle button', { hasText: /demo view/i }).first();
if (await demoBtn.isVisible()) { await demoBtn.click(); await page.waitForTimeout(2000); }

// Measure container and canvas
const dims = await page.evaluate(() => {
  const wrapper = document.querySelector('.pixel-sim-wrapper');
  const canvas = document.querySelector('canvas');
  const vizSection = document.querySelector('.pixel-sim-wrapper')?.closest('div[style]');
  const dagWrapper = document.querySelector('.swarm-dag-wrapper');
  
  const getBox = el => el ? {
    w: el.offsetWidth, h: el.offsetHeight,
    clientW: el.clientWidth, clientH: el.clientHeight,
    scrollH: el.scrollHeight,
  } : null;

  return {
    wrapper: getBox(wrapper),
    canvas: canvas ? { w: canvas.width, h: canvas.height, cW: canvas.clientWidth, cH: canvas.clientHeight, style: canvas.getAttribute('style') } : null,
    vizSectionStyle: vizSection?.getAttribute('style'),
    // Walk up from canvas to find sized ancestor
    ancestors: (() => {
      const result = [];
      let el = canvas?.parentElement;
      for (let i = 0; i < 6 && el; i++) {
        result.push({ tag: el.tagName, class: el.className.slice(0,50), h: el.offsetHeight, w: el.offsetWidth, style: el.getAttribute('style')?.slice(0,100) });
        el = el.parentElement;
      }
      return result;
    })(),
  };
});
console.log('Dimensions:', JSON.stringify(dims, null, 2));

// Check OPS view sizing too
const opsBtn = page.locator('.viz-toggle button', { hasText: /ops view/i }).first();
if (await opsBtn.isVisible()) { await opsBtn.click(); await page.waitForTimeout(1500); }

const opsDims = await page.evaluate(() => {
  const wrapper = document.querySelector('.swarm-dag-wrapper');
  return wrapper ? { w: wrapper.offsetWidth, h: wrapper.offsetHeight } : null;
});
console.log('OPS wrapper dims:', JSON.stringify(opsDims));

await browser.close();
