import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const OUT = 'C:/Users/admin/AppData/Local/Temp/audit';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

const wsMessages = [];
const wsErrors = [];
const consoleErrors = [];

page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});

// Listen to WebSocket connections
await page.route('**', route => route.continue());

// Use CDP to monitor WebSockets
const client = await page.context().newCDPSession(page);
await client.send('Network.enable');

client.on('Network.webSocketCreated', ({ url }) => {
  wsMessages.push({ type: 'created', url });
  console.log('WS Created:', url);
});
client.on('Network.webSocketClosed', ({ requestId }) => {
  wsMessages.push({ type: 'closed', requestId });
});
client.on('Network.webSocketFrameError', ({ requestId, errorMessage }) => {
  wsErrors.push({ requestId, errorMessage });
  console.log('WS Error:', errorMessage);
});

await page.goto('http://localhost:5173');
await page.waitForTimeout(5000);

console.log('\n=== WebSocket URLs ===');
wsMessages.forEach(m => console.log(m));
console.log('\n=== WS Errors ===');
wsErrors.forEach(e => console.log(e));
console.log('\n=== Console Errors ===');
consoleErrors.forEach(e => console.log(e));

// Check all visual elements while in default view
const visualCheck = await page.evaluate(() => {
  // Check the Commander panel visibility
  const commanderPanel = document.querySelector('[class*="commander"], [class*="Commander"], [class*="rpg"], [class*="game"]');
  const swarmOrch = document.querySelector('[class*="swarm-orch"], [class*="SwarmOrch"]');
  const vizToggle = document.querySelector('[class*="viz-toggle"], [class*="VizToggle"]');

  // Check app layout classes
  const mainLayout = document.querySelector('.app-main-layout');
  const mainLeft = document.querySelector('.app-main-left');

  return {
    commanderPanel: commanderPanel?.className || 'NOT FOUND',
    swarmOrch: swarmOrch?.className || 'NOT FOUND',
    vizToggle: vizToggle?.className || 'NOT FOUND',
    mainLayoutChildren: mainLayout ? Array.from(mainLayout.children).map(c => c.className) : [],
    mainLeftChildren: mainLeft ? Array.from(mainLeft.children).map(c => c.className) : [],
  };
});
console.log('\n=== Visual Check ===');
console.log(JSON.stringify(visualCheck, null, 2));

// Check specific elements for DEMO view
const demoBtn = page.locator('button').filter({ hasText: /demo\s*view/i }).first();
if (await demoBtn.isVisible()) await demoBtn.click();
await page.waitForTimeout(2000);

const demoLayoutCheck = await page.evaluate(() => {
  const pixelSim = document.querySelector('.pixel-sim-wrapper');
  const canvas = document.querySelector('canvas.pixel-sim-canvas');
  const overlayTop = document.querySelector('[class*="overlay-top"]');
  const overlayBot = document.querySelector('[class*="overlay-bot"]');
  const rightPanel = document.querySelector('[class*="overlay-right"]');

  return {
    hasPixelSim: !!pixelSim,
    hasCanvas: !!canvas,
    canvasSize: canvas ? `${canvas.width}x${canvas.height}` : 'none',
    hasOverlayTop: !!overlayTop,
    overlayTopText: overlayTop?.textContent?.trim().slice(0, 80),
    hasOverlayBot: !!overlayBot,
    overlayBotText: overlayBot?.textContent?.trim().slice(0, 100),
    hasRightPanel: !!rightPanel,
    rightPanelText: rightPanel?.textContent?.trim().slice(0, 200),
  };
});
console.log('\n=== Demo Layout Check ===');
console.log(JSON.stringify(demoLayoutCheck, null, 2));

// Take a targeted screenshot of just the sim canvas area
await page.screenshot({
  path: `${OUT}/audit-demo-canvas-area.png`,
  fullPage: false,
  clip: { x: 0, y: 440, width: 1180, height: 450 }
});
console.log('Canvas area screenshot taken');

writeFileSync(`${OUT}/audit-ws-checks.json`, JSON.stringify({
  wsMessages, wsErrors, consoleErrors, visualCheck, demoLayoutCheck
}, null, 2));

await browser.close();
