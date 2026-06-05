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

// ── Screenshot 1: Demo view (default load) ──
await page.goto(BASE);
await page.waitForTimeout(4000);
await page.screenshot({ path: 'audit-1-demo-default.png', fullPage: false });
console.log('✅ Screenshot 1: Demo default');

// ── Screenshot 2: OPS VIEW ──
const opsBtn = page.locator('button', { hasText: /ops view/i }).first();
if (await opsBtn.isVisible()) {
  await opsBtn.click();
  await page.waitForTimeout(2500);
}
await page.screenshot({ path: 'audit-2-ops-view.png', fullPage: false });
console.log('✅ Screenshot 2: OPS View');

// ── Screenshot 3: LIVE mode ──
const liveBtn = page.locator('button', { hasText: /live/i }).first();
if (await liveBtn.isVisible()) {
  await liveBtn.click();
  await page.waitForTimeout(3000);
}
await page.screenshot({ path: 'audit-3-live-mode.png', fullPage: false });
console.log('✅ Screenshot 3: Live mode');

// ── Screenshot 4: Back to DEMO VIEW ──
const demoBtn = page.locator('button', { hasText: /demo view/i }).first();
if (await demoBtn.isVisible()) {
  await demoBtn.click();
  await page.waitForTimeout(2500);
}
await page.screenshot({ path: 'audit-4-demo-live.png', fullPage: false });
console.log('✅ Screenshot 4: Demo with live data');

// ── Screenshot 5: Room drilldown ──
try {
  const opsBtn2 = page.locator('button', { hasText: /ops view/i }).first();
  if (await opsBtn2.isVisible()) await opsBtn2.click();
  await page.waitForTimeout(1500);
  // Click the AgentNode card directly (our SwarmDAG nodes)
  const agentNodeCard = page.locator('.agent-node').first();
  if (await agentNodeCard.isVisible({ timeout: 3000 })) {
    await agentNodeCard.click({ force: true });
    await page.waitForTimeout(1200);
  }
  await page.screenshot({ path: 'audit-5-room-drilldown.png', fullPage: false });
  console.log('✅ Screenshot 5: Room drilldown');
} catch (e) {
  await page.screenshot({ path: 'audit-5-room-drilldown.png', fullPage: false });
  console.log('⚠ Screenshot 5: Drilldown click failed, screenshot taken anyway:', e.message.slice(0,80));
}

// ── Automated checks ──
const fontLoaded = await page.evaluate(() =>
  document.fonts.check("700 10px 'JetBrains Mono'")
);
console.log('JetBrains Mono loaded:', fontLoaded);

const canvasCheck = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  if (!canvas) return { found: false };
  const ctx = canvas.getContext('2d');
  if (!ctx) return { found: true, noCtx: true };
  const pixel = ctx.getImageData(canvas.width/2, canvas.height/2, 1, 1).data;
  return {
    found: true,
    width: canvas.width,
    height: canvas.height,
    centerPixel: Array.from(pixel),
    isBlack: pixel[0] < 30 && pixel[1] < 30 && pixel[2] < 30,
  };
});
console.log('Canvas check:', JSON.stringify(canvasCheck));

const nodeCheck = await page.evaluate(() => {
  const nodes = document.querySelectorAll('.react-flow__node');
  return {
    count: nodes.length,
    visible: Array.from(nodes).filter(n => n.offsetParent !== null).length,
    labels: Array.from(nodes).map(n => n.textContent?.trim().slice(0, 30) ?? ''),
  };
});
console.log('React Flow nodes:', JSON.stringify(nodeCheck));

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

// Switch to OPS for node checks
if (await opsBtn.isVisible()) await opsBtn.click().catch(()=>{});
await page.waitForTimeout(1000);

const agentNodeCheck = await page.evaluate(() => {
  const cards = document.querySelectorAll('.agent-node');
  return {
    count: cards.length,
    hasHeader: Array.from(cards).filter(c => c.querySelector('.agent-node__header')).length,
    hasBody: Array.from(cards).filter(c => c.querySelector('.agent-node__body')).length,
    hasFooter: Array.from(cards).filter(c => c.querySelector('.agent-node__footer')).length,
    hasBadge: Array.from(cards).filter(c => c.querySelector('.agent-node__badge')).length,
    hasSparkline: Array.from(cards).filter(c => c.querySelector('.agent-node__sparkline')).length,
    hasCorners: Array.from(cards).filter(c => c.querySelector('.agent-node__corner')).length,
    sampleBorder: Array.from(cards).slice(0,1).map(c => c.style.borderColor),
  };
});
console.log('Agent node check:', JSON.stringify(agentNodeCheck));

const sidebarCheck = await page.evaluate(() => {
  const sidebar = document.querySelector('.swarm-dag-sidebar');
  const statVals = Array.from(document.querySelectorAll('.swarm-dag-stat-val')).map(el => el.textContent?.trim());
  const logEntries = Array.from(document.querySelectorAll('.swarm-dag-log-msg')).map(el => el.textContent?.trim().slice(0, 40));
  const agentRows = document.querySelectorAll('.swarm-dag-agent-row').length;
  return {
    sidebarFound: !!sidebar,
    statValues: statVals,
    logEntries: logEntries.slice(0, 5),
    agentRowCount: agentRows,
  };
});
console.log('Sidebar check:', JSON.stringify(sidebarCheck));

const edgeCheck = await page.evaluate(() => {
  const edges = document.querySelectorAll('.react-flow__edge-path');
  const styles = Array.from(edges).slice(0,2).map(e => ({
    stroke: e.getAttribute('stroke') ?? getComputedStyle(e).stroke,
    strokeDasharray: e.getAttribute('stroke-dasharray') ?? getComputedStyle(e).strokeDasharray,
  }));
  return { count: edges.length, styles };
});
console.log('Edge check:', JSON.stringify(edgeCheck));

writeFileSync('audit-checks.json', JSON.stringify({
  fontLoaded, canvasCheck, nodeCheck, cssVars,
  agentNodeCheck, sidebarCheck, edgeCheck, errors
}, null, 2));

writeFileSync('audit-console-errors.json', JSON.stringify(errors, null, 2));

console.log('\nConsole errors:', errors.length);
errors.slice(0, 10).forEach(e => console.log('  ❌', e));

await browser.close();
console.log('\nAudit complete. Screenshots + audit-checks.json written.');
