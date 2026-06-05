import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('http://localhost:5174/index.html');
await page.waitForTimeout(2000);
await page.locator('.top-nav-tab').nth(1).click();
await page.waitForTimeout(500);
await page.locator('button', { hasText: /demo/i }).first().click();
await page.waitForTimeout(5000);

// Zoom into INTAKE agent area (roughly x:50-280, y:280-430 within canvas which starts at y:101)
// Canvas starts at page y=101, so agent area is page y=101+170 to 101+480
await page.screenshot({ path: '/tmp/sim-zoom-intake.png', clip: { x: 30, y: 260, width: 310, height: 260 } });

// Zoom into FORGE area 
await page.screenshot({ path: '/tmp/sim-zoom-forge.png', clip: { x: 370, y: 260, width: 290, height: 260 } });

// Zoom into DISPATCH bottom row
await page.screenshot({ path: '/tmp/sim-zoom-dispatch.png', clip: { x: 370, y: 520, width: 290, height: 260 } });

// 3x zoom sim via CSS transform to see agent pixel detail
const agentPixelDetail = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  if (!canvas) return null;
  // Get 2D context to sample pixels in agent area
  const ctx = canvas.getContext('2d');
  // Sample a grid around where INTAKE agent typically is: ~px 170, py 285-340 in canvas coords
  const samples = [];
  for (let sy = 285; sy < 340; sy += 2) {
    for (let sx = 140; sx < 210; sx += 2) {
      const d = ctx.getImageData(sx, sy, 1, 1).data;
      if (d[3] > 0 && (d[0] > 30 || d[1] > 30 || d[2] > 30)) {
        samples.push({ x: sx, y: sy, r: d[0], g: d[1], b: d[2], a: d[3] });
      }
    }
  }
  return { 
    totalSamples: samples.length,
    coloredSamples: samples.filter(s => s.r > 20 || s.g > 20 || s.b > 20),
    canvasWidth: canvas.width, canvasHeight: canvas.height
  };
});
console.log('Agent pixel detail:', JSON.stringify(agentPixelDetail, null, 2));

await browser.close();
