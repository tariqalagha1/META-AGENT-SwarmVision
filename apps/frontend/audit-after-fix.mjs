import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = 'C:/Users/admin/AppData/Local/Temp/audit';
try { mkdirSync(OUT, { recursive: true }); } catch(_){}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

const errors = [];
page.on('console', msg => {
  if (msg.type() === 'error') errors.push(msg.text());
});

await page.goto('http://localhost:5173');
await page.waitForTimeout(3000);

// Screenshot 1: default observability view
await page.screenshot({ path: OUT + '/fix-1-default.png' });
console.log('Screenshot 1: default');

// Click OPS VIEW - should now open fullscreen overlay
const opsBtn = page.locator('button').filter({ hasText: /^OPS VIEW$/ }).first();
if (await opsBtn.isVisible()) {
  await opsBtn.click();
  await page.waitForTimeout(2000);
}
await page.screenshot({ path: OUT + '/fix-2-ops-fullscreen.png' });
console.log('Screenshot 2: OPS fullscreen');

// Click DEMO VIEW within OPS overlay
const demoToggleInOps = page.locator('.swarm-dag-toggle').filter({ hasText: /DEMO/ }).first();
if (await demoToggleInOps.isVisible()) {
  await demoToggleInOps.click();
  await page.waitForTimeout(2000);
}
await page.screenshot({ path: OUT + '/fix-3-demo-fullscreen.png' });
console.log('Screenshot 3: DEMO fullscreen');

// Enable LIVE mode
const liveBtnPage = page.locator('.viz-toggle-live').first();
if (await liveBtnPage.isVisible()) {
  await liveBtnPage.click();
  await page.waitForTimeout(3000);
}
await page.screenshot({ path: OUT + '/fix-4-demo-live.png' });
console.log('Screenshot 4: DEMO + LIVE');

// Back to OPS
await page.locator('.pixel-sim-toggle').filter({ hasText: /OPS/ }).click().catch(()=>{});
await page.waitForTimeout(2000);
await page.screenshot({ path: OUT + '/fix-5-ops-live.png' });
console.log('Screenshot 5: OPS + LIVE');

// Check canvas
const canvasInfo = await page.evaluate(() => {
  // Go back to demo to check canvas
  return { canvases: document.querySelectorAll('canvas').length };
});
console.log('Canvas count:', canvasInfo.canvases);

// DOM check
const domCheck = await page.evaluate(() => {
  const overlay = document.querySelector('[style*="position: fixed"]');
  const dag = document.querySelector('.swarm-dag-wrapper');
  return {
    hasFixedOverlay: !!overlay,
    overlayStyle: overlay?.getAttribute('style')?.slice(0,80),
    hasDAG: !!dag,
    dagVisible: dag ? dag.offsetParent !== null : false,
  };
});
console.log('DOM check:', JSON.stringify(domCheck));

console.log('\nErrors:', errors.length);
errors.forEach(e => console.log(' ', e));

await browser.close();
