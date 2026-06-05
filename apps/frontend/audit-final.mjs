import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const BASE = 'http://localhost:5173';
const errors = [];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('console', msg => {
  if (msg.type() === 'error') errors.push(msg.text());
});
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(BASE);
await page.waitForTimeout(5000); // longer wait for PixiJS rAF init

// Switch to DEMO VIEW
const demoBtn = page.locator('.viz-toggle button', { hasText: /demo view/i }).first();
if (await demoBtn.isVisible()) { await demoBtn.click(); await page.waitForTimeout(2500); }

// Scroll to canvas and screenshot
await page.evaluate(() => {
  const canvas = document.querySelector('.pixel-sim-canvas');
  if (canvas) canvas.scrollIntoView({ behavior: 'instant', block: 'start' });
});
await page.waitForTimeout(500);
await page.screenshot({ path: 'audit-final-demo.png', fullPage: false });
console.log('✅ Final DEMO screenshot');

// Canvas size check
const canvasInfo = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  if (!c) return { found: false };
  const rect = c.getBoundingClientRect();
  const ctx = c.getContext('2d');
  const center = ctx ? ctx.getImageData(Math.floor(c.width/2), Math.floor(c.height/2), 1, 1).data : null;
  return {
    found: true,
    pixelW: c.width, pixelH: c.height,
    cssW: Math.round(rect.width), cssH: Math.round(rect.height),
    center: center ? [center[0], center[1], center[2]] : null,
    topBarPixel: ctx ? Array.from(ctx.getImageData(Math.floor(c.width * 0.5), 18, 1, 1).data) : null,
    bottomBarPixel: ctx ? Array.from(ctx.getImageData(Math.floor(c.width * 0.3), c.height - 20, 1, 1).data) : null,
  };
});
console.log('Canvas info:', JSON.stringify(canvasInfo));

// Switch to OPS VIEW
const opsBtn = page.locator('.viz-toggle button', { hasText: /ops view/i }).first();
if (await opsBtn.isVisible()) { await opsBtn.click(); await page.waitForTimeout(2000); }
await page.evaluate(() => {
  const dag = document.querySelector('.swarm-dag-wrapper');
  if (dag) dag.scrollIntoView({ behavior: 'instant', block: 'start' });
});
await page.waitForTimeout(500);
await page.screenshot({ path: 'audit-final-ops.png', fullPage: false });
console.log('✅ Final OPS screenshot');

// OPS checks
const opsInfo = await page.evaluate(() => {
  const nodes = document.querySelectorAll('.agent-node');
  const badges = Array.from(document.querySelectorAll('.agent-node__badge')).map(b => b.textContent?.trim());
  const counts = Array.from(document.querySelectorAll('.agent-node__count-num')).map(n => n.textContent?.trim());
  const labels = Array.from(document.querySelectorAll('.agent-node__label')).map(l => l.textContent?.trim());
  const sparklines = Array.from(document.querySelectorAll('.agent-node__sparkline')).length;
  const corners = Array.from(document.querySelectorAll('.agent-node__corner')).length;
  const sidebar = !!document.querySelector('.swarm-dag-sidebar');
  const agentRows = document.querySelectorAll('.swarm-dag-agent-row').length;
  const logEntries = document.querySelectorAll('.swarm-dag-log-msg').length;
  const dagWrapper = document.querySelector('.swarm-dag-wrapper');
  const wrapperH = dagWrapper ? dagWrapper.getBoundingClientRect().height : 0;
  return { nodeCount: nodes.length, badges, counts, labels, sparklines, corners, sidebar, agentRows, logEntries, wrapperH };
});
console.log('OPS info:', JSON.stringify(opsInfo));

writeFileSync('audit-final-checks.json', JSON.stringify({ canvasInfo, opsInfo, errors: errors.slice(0,5) }, null, 2));
console.log('\nConsole errors:', errors.length);
errors.slice(0,3).forEach(e => console.log(' ❌', e.slice(0,100)));
await browser.close();
console.log('\nFinal audit complete.');
