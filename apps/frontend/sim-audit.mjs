import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

console.log('Navigating to app...');
await page.goto('http://localhost:5174/index.html');
await page.waitForTimeout(3000);

// Navigate to Visualize tab
const tabs = page.locator('.top-nav-tab');
const tabCount = await tabs.count();
console.log(`Found ${tabCount} nav tabs`);
for (let i = 0; i < tabCount; i++) {
  const txt = await tabs.nth(i).textContent();
  console.log(`  Tab ${i}: "${txt}"`);
}

// Click Visualize tab (index 1)
await tabs.nth(1).click();
await page.waitForTimeout(1000);
await page.screenshot({ path: '/tmp/sim-1-visualize-tab.png' });
console.log('Screenshot 1: visualize tab');

// Find and click DEMO VIEW button
const buttons = page.locator('button');
const btnCount = await buttons.count();
console.log(`Found ${btnCount} buttons`);
for (let i = 0; i < Math.min(btnCount, 10); i++) {
  const txt = await buttons.nth(i).textContent();
  console.log(`  Btn ${i}: "${txt}"`);
}

// Click DEMO VIEW
const demoBtn = page.locator('button', { hasText: /demo/i }).first();
await demoBtn.click();
console.log('Clicked DEMO VIEW');
await page.waitForTimeout(4000);

// Full page screenshot
await page.screenshot({ path: '/tmp/sim-2-demo-full.png' });
console.log('Screenshot 2: demo full');

// Wait more for animation
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/sim-3-demo-animated.png' });
console.log('Screenshot 3: after animation');

// Top row rooms (INTAKE, FORGE, QA, ROUTER)
await page.screenshot({ path: '/tmp/sim-4-top-rooms.png', clip: { x: 0, y: 36, width: 1220, height: 380 } });
console.log('Screenshot 4: top rooms');

// Bottom row rooms (MEMORY, DISPATCH, AUDIT, HITL)
await page.screenshot({ path: '/tmp/sim-5-bottom-rooms.png', clip: { x: 0, y: 380, width: 1220, height: 420 } });
console.log('Screenshot 5: bottom rooms');

// Right panel (agents + log)
await page.screenshot({ path: '/tmp/sim-6-right-panel.png', clip: { x: 1200, y: 36, width: 240, height: 824 } });
console.log('Screenshot 6: right panel');

// Canvas info
const canvasInfo = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  if (!canvas) return { found: false };
  const rect = canvas.getBoundingClientRect();
  return {
    found: true,
    cssWidth: rect.width,
    cssHeight: rect.height,
    attrWidth: canvas.width,
    attrHeight: canvas.height,
    devicePixelRatio: window.devicePixelRatio,
    className: canvas.className,
  };
});
console.log('Canvas info:', JSON.stringify(canvasInfo, null, 2));

// Check what's visible in the canvas area
const domInfo = await page.evaluate(() => {
  const wrapper = document.querySelector('.pixel-sim-wrapper');
  const canvas = document.querySelector('canvas');
  const overlayTop = document.querySelector('.pixel-sim-overlay-top');
  const overlayRight = document.querySelector('.pixel-sim-overlay-right');
  const overlayBottom = document.querySelector('.pixel-sim-overlay-bottom');
  return {
    wrapperExists: !!wrapper,
    canvasExists: !!canvas,
    overlayTopExists: !!overlayTop,
    overlayRightExists: !!overlayRight,
    overlayBottomExists: !!overlayBottom,
    wrapperRect: wrapper ? wrapper.getBoundingClientRect() : null,
  };
});
console.log('DOM info:', JSON.stringify(domInfo, null, 2));

await browser.close();
console.log('Done.');
