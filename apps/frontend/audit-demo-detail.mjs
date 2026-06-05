import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const OUT = 'C:/Users/admin/AppData/Local/Temp/audit';
import { mkdirSync } from 'fs';
try { mkdirSync(OUT, { recursive: true }); } catch(_){}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

const errors = [];
page.on('console', msg => {
  if (msg.type() === 'error') errors.push(msg.text());
  if (msg.type() === 'warn') console.log('WARN:', msg.text());
});

await page.goto('http://localhost:5173');
await page.waitForTimeout(3000);

// Go to DEMO VIEW + LIVE mode
const demoBtn = page.locator('button').filter({ hasText: /demo\s*view/i }).first();
if (await demoBtn.isVisible()) {
  await demoBtn.click();
  await page.waitForTimeout(1000);
}
const liveBtn = page.locator('button').filter({ hasText: /live/i }).first();
if (await liveBtn.isVisible()) {
  await liveBtn.click();
  await page.waitForTimeout(3000);
}

// Full page screenshot of DEMO VIEW
await page.screenshot({ path: `${OUT}/audit-demo-fullpage.png`, fullPage: true });
console.log('✅ Demo fullpage screenshot');

// Top portion only
await page.screenshot({ path: `${OUT}/audit-demo-top.png`, fullPage: false, clip: { x: 0, y: 0, width: 1440, height: 450 } });
console.log('✅ Demo top screenshot');

// Bottom/canvas portion
await page.screenshot({ path: `${OUT}/audit-demo-scrolled.png`, fullPage: false, clip: { x: 0, y: 450, width: 1440, height: 450 } });
console.log('✅ Demo scrolled screenshot');

// Canvas check NOW (while demo is active)
const canvasCheck = await page.evaluate(() => {
  const canvases = document.querySelectorAll('canvas');
  return Array.from(canvases).map(canvas => {
    const ctx = canvas.getContext('2d');
    let pixelInfo = null;
    try {
      if (ctx) {
        const px = ctx.getImageData(canvas.width/2, canvas.height/2, 1, 1).data;
        pixelInfo = { r: px[0], g: px[1], b: px[2], a: px[3] };
      }
    } catch(e) {}
    return {
      width: canvas.width, height: canvas.height,
      className: canvas.className, id: canvas.id,
      pixelInfo,
      parentClass: canvas.parentElement?.className
    };
  });
});
console.log('Canvas check (demo mode):', JSON.stringify(canvasCheck, null, 2));

// Detailed DOM analysis of the demo view
const demoDOM = await page.evaluate(() => {
  const wrapper = document.querySelector('.pixel-sim-wrapper, [class*="pixel-sim"], [class*="PixelSim"]');
  const canvas = document.querySelector('canvas');
  const rooms = document.querySelectorAll('[class*="zone-room"], [class*="room"], [class*="Zone"]');
  const agents = document.querySelectorAll('[class*="agent-sprite"], [class*="sprite"]');

  // Check what's rendering in the demo area
  const demoArea = document.querySelector('[class*="tier3"], [class*="pixelsim"], [class*="PixelSim"]');

  // Get all visible text content for header/HUD
  const hudEls = document.querySelectorAll('[class*="hud"], [class*="overlay-top"], [class*="sim-title"]');
  const hudTexts = Array.from(hudEls).map(el => el.textContent?.trim().slice(0, 100));

  // Stats area
  const statsEls = document.querySelectorAll('[class*="stat"], [class*="bottom-bar"], [class*="overlay-bot"]');
  const statsTexts = Array.from(statsEls).map(el => el.textContent?.trim().slice(0, 100));

  return {
    hasWrapper: !!wrapper,
    hasCanvas: !!canvas,
    hasDemoArea: !!demoArea,
    demoAreaClass: demoArea?.className,
    wrapperClass: wrapper?.className,
    canvasW: canvas?.width,
    canvasH: canvas?.height,
    hudTexts,
    statsTexts,
    roomCount: rooms.length,
    agentSpriteCount: agents.length,
  };
});
console.log('Demo DOM:', JSON.stringify(demoDOM, null, 2));

// Check if PixiJS loaded
const pixiCheck = await page.evaluate(() => {
  // @ts-ignore
  const hasPixi = typeof window.PIXI !== 'undefined' ||
    document.querySelector('canvas') !== null;
  return { hasPixi };
});
console.log('PixiJS check:', JSON.stringify(pixiCheck));

// Now go to OPS VIEW for detailed inspection
const opsBtn = page.locator('button').filter({ hasText: /ops/i }).first();
if (await opsBtn.isVisible()) {
  await opsBtn.click();
  await page.waitForTimeout(2000);
}
await page.screenshot({ path: `${OUT}/audit-ops-scrolled.png`, fullPage: true });
console.log('✅ OPS view full screenshot');

// Check OPS node details
const opsNodeDetails = await page.evaluate(() => {
  const nodes = document.querySelectorAll('.react-flow__node');
  return Array.from(nodes).slice(0, 8).map(n => ({
    classes: n.className,
    text: n.textContent?.trim().slice(0, 80),
    visible: n.offsetParent !== null,
    style: n.getAttribute('style'),
  }));
});
console.log('OPS nodes:', JSON.stringify(opsNodeDetails, null, 2));

// Check sidebar content
const sidebarContent = await page.evaluate(() => {
  const sidebar = document.querySelector('[class*="sidebar"], [class*="Sidebar"], [class*="live-stats"], [class*="LiveStats"]');
  return {
    exists: !!sidebar,
    class: sidebar?.className,
    text: sidebar?.textContent?.trim().slice(0, 500),
  };
});
console.log('Sidebar:', JSON.stringify(sidebarContent));

writeFileSync(`${OUT}/audit-detail-checks.json`, JSON.stringify({
  canvasCheck, demoDOM, pixiCheck, opsNodeDetails, sidebarContent, errors
}, null, 2));

console.log('\nConsole errors:', errors.length);
errors.forEach(e => console.log('  ❌', e));

await browser.close();
console.log('\nDetail audit complete.');
