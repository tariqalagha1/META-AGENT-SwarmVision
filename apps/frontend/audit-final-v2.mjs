import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';

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

// == FINAL DEMO VIEW screenshot ==
// Click OPS VIEW first
await page.locator('button').filter({ hasText: /^OPS VIEW$/ }).first().click();
await page.waitForTimeout(1500);

// Enable LIVE from within OPS (the VizToggle is hidden behind overlay)
// Use the viz-toggle inside the page via evaluate instead
await page.evaluate(() => {
  // Find the connectLive function via the store
  // Instead trigger via the "⚡ LIVE" button in the viz-toggle
  const btns = Array.from(document.querySelectorAll('button'));
  const liveBtn = btns.find(b => b.textContent?.includes('LIVE') && b.className?.includes('viz-toggle'));
  if (liveBtn) liveBtn.click();
});
await page.waitForTimeout(2000);

// Now take OPS VIEW + LIVE screenshot  
await page.screenshot({ path: OUT + '/audit-final-ops.png' });
console.log('✅ Final OPS VIEW screenshot');

// Switch to DEMO VIEW from within OPS overlay
const demoInOps = page.locator('.swarm-dag-toggle').filter({ hasText: /DEMO/ }).first();
if (await demoInOps.isVisible()) {
  await demoInOps.click();
  await page.waitForTimeout(2000);
}
await page.screenshot({ path: OUT + '/audit-final-demo.png' });
console.log('✅ Final DEMO VIEW screenshot');

// === Full checklist DOM audit ===
const checklistAudit = await page.evaluate(() => {
  const canvas = document.querySelector('canvas.pixel-sim-canvas');
  const wrapper = document.querySelector('.pixel-sim-wrapper');
  const overlayTop = document.querySelector('.pixel-sim-overlay-top');
  const overlayBottom = document.querySelector('.pixel-sim-overlay-bottom');
  const overlayRight = document.querySelector('.pixel-sim-overlay-right');
  const liveDot = document.querySelector('.pixel-sim-live-dot');
  const titleText = document.querySelector('.pixel-sim-title-text');
  const statVals = document.querySelectorAll('.pixel-sim-stat-val');
  const statLabels = document.querySelectorAll('.pixel-sim-stat-label');
  const agentRows = document.querySelectorAll('.pixel-sim-agent-row');
  const logEntries = document.querySelectorAll('.pixel-sim-log-entry');
  const closeBtn = document.querySelector('.pixel-sim-toggle');

  // CSS variables
  const root = getComputedStyle(document.documentElement);

  return {
    // Canvas
    canvas: { found: !!canvas, w: canvas?.width, h: canvas?.height },
    // Overlays
    overlayTop: { found: !!overlayTop, text: overlayTop?.textContent?.trim().slice(0, 60) },
    overlayBottom: { found: !!overlayBottom, text: overlayBottom?.textContent?.trim().slice(0, 100) },
    overlayRight: { found: !!overlayRight, text: overlayRight?.textContent?.trim().slice(0, 150) },
    // HUD elements
    liveDot: !!liveDot,
    titleText: titleText?.textContent?.trim(),
    // Stats
    statCount: statVals.length,
    statValues: Array.from(statVals).map(s => s.textContent?.trim()),
    statLabels: Array.from(statLabels).map(s => s.textContent?.trim()),
    // Agent list
    agentCount: agentRows.length,
    agentSamples: Array.from(agentRows).slice(0, 3).map(r => r.textContent?.trim()),
    // Event log
    logCount: logEntries.length,
    logSamples: Array.from(logEntries).slice(0, 3).map(e => e.textContent?.trim()),
    // Close button
    closeBtn: closeBtn?.textContent?.trim(),
    // CSS vars
    svBg: root.getPropertyValue('--sv-bg').trim(),
    svTeal: root.getPropertyValue('--sv-teal').trim(),
    svFont: root.getPropertyValue('--sv-font').trim(),
    svBorder: root.getPropertyValue('--sv-border').trim(),
    // Font check
    fontLoaded: document.fonts.check("700 10px 'JetBrains Mono'"),
  };
});

console.log('DEMO checklist:', JSON.stringify(checklistAudit, null, 2));

// === OPS VIEW audit ===
const closeBtn = page.locator('.pixel-sim-toggle').filter({ hasText: /OPS/ }).first();
if (await closeBtn.isVisible()) { await closeBtn.click(); await page.waitForTimeout(1500); }

const opsAudit = await page.evaluate(() => {
  const topbar = document.querySelector('.swarm-dag-topbar');
  const title = document.querySelector('.swarm-dag-title-main');
  const nodes = document.querySelectorAll('.react-flow__node-agentNode');
  const edges = document.querySelectorAll('.react-flow__edge');
  const sidebar = document.querySelector('.swarm-dag-sidebar');
  const statRows = document.querySelectorAll('.swarm-dag-stat');
  const agentRows = document.querySelectorAll('.swarm-dag-agent-row');
  const logEntries = document.querySelectorAll('.swarm-dag-log-entry');
  const background = document.querySelector('.react-flow__background');

  return {
    topbar: { found: !!topbar, text: topbar?.textContent?.trim().slice(0, 60) },
    title: title?.textContent?.trim(),
    zoneNodeCount: nodes.length,
    edgeCount: edges.length,
    hasSidebar: !!sidebar,
    statCount: statRows.length,
    statValues: Array.from(statRows).map(r => r.textContent?.trim().slice(0, 30)),
    agentCount: agentRows.length,
    logCount: logEntries.length,
    logSamples: Array.from(logEntries).slice(0, 3).map(e => e.textContent?.trim()),
    hasBackground: !!background,
  };
});
console.log('OPS checklist:', JSON.stringify(opsAudit, null, 2));

writeFileSync(OUT + '/audit-final-checks.json', JSON.stringify({ checklistAudit, opsAudit, errors }, null, 2));

console.log('\nErrors:', errors.length);
errors.forEach(e => console.log(' ', e));

await browser.close();
