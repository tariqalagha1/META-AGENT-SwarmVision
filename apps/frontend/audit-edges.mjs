import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('http://localhost:5173');
await page.waitForTimeout(4000);
const opsBtn = page.locator('.viz-toggle button', { hasText: /ops view/i }).first();
if (await opsBtn.isVisible()) { await opsBtn.click(); await page.waitForTimeout(2000); }
await page.evaluate(() => {
  const dag = document.querySelector('.swarm-dag-wrapper');
  if (dag) dag.scrollIntoView({ behavior: 'instant', block: 'start' });
});
await page.waitForTimeout(400);
await page.screenshot({ path: 'audit-edges.png', fullPage: false });

const edgeInfo = await page.evaluate(() => {
  const edges = document.querySelectorAll('.react-flow__edge-path');
  const e = edges[0];
  if (!e) return { count: 0 };
  const cs = getComputedStyle(e);
  return {
    count: edges.length,
    stroke: cs.stroke,
    strokeWidth: cs.strokeWidth,
    opacity: cs.opacity,
    dasharray: cs.strokeDasharray,
  };
});
console.log('Edge info:', JSON.stringify(edgeInfo));
await browser.close();
