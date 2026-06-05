import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const BASE = 'http://localhost:5173';
const errors = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('console', msg => {
  if (msg.type() === 'error' || msg.type() === 'warning') errors.push(`[${msg.type()}] ${msg.text()}`);
});
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(BASE);
await page.waitForTimeout(4000);

// Switch to DEMO VIEW via the VizToggle
const demoBtn = page.locator('.viz-toggle button', { hasText: /demo view/i }).first();
if (await demoBtn.isVisible()) {
  await demoBtn.click();
  await page.waitForTimeout(2000);
}

// Scroll to the viz layer section
await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  if (canvas) canvas.scrollIntoView({ behavior: 'instant', block: 'center' });
});
await page.waitForTimeout(1000);
await page.screenshot({ path: 'audit-demo-scrolled.png', fullPage: false });
console.log('Screenshot: DEMO scrolled to canvas');

// Full-page screenshot to capture entire canvas
await page.screenshot({ path: 'audit-demo-fullpage.png', fullPage: true });
console.log('Screenshot: DEMO full page');

// Canvas pixel sampling across key areas
const canvasData = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  if (!canvas) return { found: false };
  const ctx = canvas.getContext('2d');
  if (!ctx) return { found: true, noCtx: true };
  // Sample multiple points
  const W = canvas.width, H = canvas.height;
  const sample = (x, y) => {
    const d = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  };
  return {
    found: true, width: W, height: H,
    center: sample(W/2, H/2),
    topLeft: sample(50, 80),
    room1Center: sample(W * 0.12, H * 0.35),   // INTAKE room
    room2Center: sample(W * 0.38, H * 0.35),   // FORGE room
    pipeline1: sample(W * 0.22, H * 0.35),     // between INTAKE and FORGE
    bottomBar: sample(W * 0.3, H - 20),        // bottom HUD
    topBar: sample(W * 0.5, 18),               // top HUD
  };
});
console.log('Canvas data:', JSON.stringify(canvasData));

// OPS view checks
const opsBtn = page.locator('.viz-toggle button', { hasText: /ops view/i }).first();
if (await opsBtn.isVisible()) {
  await opsBtn.click();
  await page.waitForTimeout(2000);
}
await page.evaluate(() => {
  const dag = document.querySelector('.swarm-dag-wrapper');
  if (dag) dag.scrollIntoView({ behavior: 'instant', block: 'center' });
});
await page.waitForTimeout(500);
await page.screenshot({ path: 'audit-ops-scrolled.png', fullPage: false });
console.log('Screenshot: OPS scrolled');

// Check all 8 node zone labels
const zoneLabels = await page.evaluate(() => {
  const nodes = document.querySelectorAll('.agent-node__label');
  return Array.from(nodes).map(n => n.textContent?.trim());
});
console.log('Zone labels found:', JSON.stringify(zoneLabels));

// Check badge texts
const badges = await page.evaluate(() => {
  const b = document.querySelectorAll('.agent-node__badge');
  return Array.from(b).map(n => n.textContent?.trim());
});
console.log('Badges:', JSON.stringify(badges));

// Check stat values
const stats = await page.evaluate(() => {
  const vals = document.querySelectorAll('.swarm-dag-stat-val');
  const labels = document.querySelectorAll('.swarm-dag-stat-label');
  return Array.from(vals).map((v, i) => ({
    label: labels[i]?.textContent?.trim(),
    val: v.textContent?.trim(),
    color: getComputedStyle(v).color,
  }));
});
console.log('Sidebar stats:', JSON.stringify(stats));

// Check edge animation
const edgeAnim = await page.evaluate(() => {
  const sheet = Array.from(document.styleSheets).find(s => {
    try { return Array.from(s.cssRules).some(r => r.cssText?.includes('flowDash')); } catch { return false; }
  });
  const hasFlowDash = !!sheet;
  const edges = document.querySelectorAll('.react-flow__edge-path');
  const firstEdge = edges[0];
  const dashArray = firstEdge ? getComputedStyle(firstEdge).strokeDasharray : 'none';
  return { hasFlowDash, edgeCount: edges.length, dashArray };
});
console.log('Edge animation:', JSON.stringify(edgeAnim));

// Check VizToggle styles
const toggleCheck = await page.evaluate(() => {
  const toggle = document.querySelector('.viz-toggle');
  if (!toggle) return { found: false };
  const style = getComputedStyle(toggle);
  return {
    found: true,
    fontFamily: style.fontFamily,
    background: style.background,
    border: style.border,
  };
});
console.log('VizToggle style:', JSON.stringify(toggleCheck));

writeFileSync('audit2-checks.json', JSON.stringify({
  canvasData, zoneLabels, badges, stats, edgeAnim, toggleCheck, errors: errors.slice(0, 15)
}, null, 2));

console.log('\nErrors/warnings:', errors.length);
errors.slice(0, 8).forEach(e => console.log(' ', e.slice(0, 120)));

await browser.close();
console.log('\nAudit 2 complete.');
