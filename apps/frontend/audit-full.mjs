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
});

// ── SCREENSHOT 1: Default load (DEMO VIEW) ──
await page.goto('http://localhost:5173');
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/audit-1-demo-default.png`, fullPage: false });
console.log('✅ Screenshot 1: Demo default');

// Check available buttons first
const allBtnTexts = await page.locator('button').allTextContents();
console.log('All buttons:', JSON.stringify(allBtnTexts));

// ── SCREENSHOT 2: Switch to OPS VIEW ──
const opsBtn = page.locator('button').filter({ hasText: /ops/i }).first();
const opsBtnVisible = await opsBtn.isVisible();
if (opsBtnVisible) {
  await opsBtn.click();
  await page.waitForTimeout(2000);
  console.log('Clicked OPS VIEW button');
}
await page.screenshot({ path: `${OUT}/audit-2-ops-view.png`, fullPage: false });
console.log('✅ Screenshot 2: OPS View');

// ── SCREENSHOT 3: Switch to LIVE mode ──
const allBtnTexts2 = await page.locator('button').allTextContents();
console.log('Buttons after ops click:', JSON.stringify(allBtnTexts2));
const liveBtn = page.locator('button').filter({ hasText: /live/i }).first();
if (await liveBtn.isVisible()) {
  await liveBtn.click();
  await page.waitForTimeout(3000);
  console.log('Clicked LIVE button');
}
await page.screenshot({ path: `${OUT}/audit-3-live-mode.png`, fullPage: false });
console.log('✅ Screenshot 3: Live mode active');

// ── SCREENSHOT 4: Back to DEMO VIEW ──
const demoViewBtn = page.locator('button').filter({ hasText: /demo/i }).first();
if (await demoViewBtn.isVisible()) {
  await demoViewBtn.click();
  await page.waitForTimeout(2000);
  console.log('Clicked DEMO VIEW button');
}
await page.screenshot({ path: `${OUT}/audit-4-demo-live.png`, fullPage: false });
console.log('✅ Screenshot 4: Demo with live data');

// ── SCREENSHOT 5: OPS view + click a node ──
if (opsBtnVisible) {
  await opsBtn.click();
  await page.waitForTimeout(1500);
}
const firstNode = page.locator('.react-flow__node').first();
if (await firstNode.isVisible()) {
  await firstNode.click();
  await page.waitForTimeout(1000);
  console.log('Clicked first react-flow node');
}
await page.screenshot({ path: `${OUT}/audit-5-room-drilldown.png`, fullPage: false });
console.log('✅ Screenshot 5: Room drilldown');

await page.waitForTimeout(2000);

// ── CHECK FONT LOADING ──
const fontLoaded = await page.evaluate(() =>
  document.fonts.check("700 10px 'JetBrains Mono'")
);
console.log('JetBrains Mono loaded:', fontLoaded);

// ── CHECK WEBSOCKET ──
const wsStatus = await page.evaluate(() => {
  const entries = performance.getEntriesByType('resource');
  return entries.filter(e => e.name.includes('ws') || e.name.includes('8012')).length > 0;
});
console.log('WS connection attempted:', wsStatus);

// ── CHECK CANVAS RENDERING ──
const canvasCheck = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  if (!canvas) return { found: false };
  const ctx = canvas.getContext('2d');
  if (!ctx) return { found: true, noCtx: true };
  try {
    const pixel = ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data;
    return {
      found: true,
      width: canvas.width,
      height: canvas.height,
      centerPixel: Array.from(pixel),
      isBlack: pixel[0] < 20 && pixel[1] < 20 && pixel[2] < 20,
    };
  } catch(e) {
    return { found: true, error: String(e) };
  }
});
console.log('Canvas check:', JSON.stringify(canvasCheck));

// ── CHECK REACT FLOW NODES ──
const nodeCheck = await page.evaluate(() => {
  const nodes = document.querySelectorAll('.react-flow__node');
  return {
    count: nodes.length,
    visible: Array.from(nodes).filter(n => n.offsetParent !== null).length,
  };
});
console.log('React Flow nodes:', JSON.stringify(nodeCheck));

// ── CHECK CSS VARIABLES ──
const cssVars = await page.evaluate(() => {
  const root = getComputedStyle(document.documentElement);
  return {
    svBg:     root.getPropertyValue('--sv-bg').trim(),
    svTeal:   root.getPropertyValue('--sv-teal').trim(),
    svFont:   root.getPropertyValue('--sv-font').trim(),
    svBorder: root.getPropertyValue('--sv-border').trim(),
  };
});
console.log('CSS variables:', JSON.stringify(cssVars));

// ── EXTRA DOM INSPECTION ──
const domInspect = await page.evaluate(() => {
  const rooms  = document.querySelectorAll('[class*="zone"],[class*="room"],[class*="Zone"],[class*="Room"]');
  const agents = document.querySelectorAll('[class*="agent"],[class*="Agent"],[class*="sprite"]');
  const tokens = document.querySelectorAll('[class*="token"],[class*="packet"],[class*="Token"]');
  const sidebar = document.querySelector('[class*="sidebar"],[class*="Sidebar"],[class*="overlay"],[class*="panel"]');
  const canvases = document.querySelectorAll('canvas');
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  const allClasses = Array.from(document.querySelectorAll('*')).map(el => el.className).filter(c => typeof c === 'string' && c.length > 0).slice(0,30);
  return {
    roomCount: rooms.length,
    agentCount: agents.length,
    tokenCount: tokens.length,
    hasSidebar: !!sidebar,
    canvasCount: canvases.length,
    bodyBg,
    sampleClasses: allClasses,
  };
});
console.log('DOM inspect:', JSON.stringify(domInspect, null, 2));

writeFileSync(`${OUT}/audit-console-errors.json`, JSON.stringify(errors, null, 2));
writeFileSync(`${OUT}/audit-checks.json`, JSON.stringify({
  fontLoaded, wsStatus, canvasCheck, nodeCheck, cssVars, domInspect, errors
}, null, 2));

console.log('\nConsole errors:', errors.length);
errors.forEach(e => console.log('  ❌', e));

await browser.close();
console.log('\nAudit complete. Screenshots at', OUT);
