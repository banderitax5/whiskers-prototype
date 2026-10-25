// Mobile viewport screenshot audit (owner-approved: Playwright + Chromium, 390x844 / 360x800).
// Usage:
//   $env:AUDIT_ADMIN_EMAIL='...'; $env:AUDIT_ADMIN_PASSWORD='...'
//   node scripts/mobile-screenshots.mjs            # defaults to 390x844
//   $env:W=360; $env:H=800; node scripts/mobile-screenshots.mjs
// Output defaults to <cwd>/screenshots/<W>x<H>/ ; set OUT to override.
// Credentials never land in the repo — they travel via env only.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const API = process.env.API_URL || 'http://localhost:4141';
const ADMIN_EMAIL = process.env.AUDIT_ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.AUDIT_ADMIN_PASSWORD || '';
const WIDTH = Number(process.env.W || 390);
const HEIGHT = Number(process.env.H || 844);
const OUT = process.env.OUT || path.join(process.cwd(), 'screenshots', `${WIDTH}x${HEIGHT}`);

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set AUDIT_ADMIN_EMAIL and AUDIT_ADMIN_PASSWORD env vars first.');
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });

async function settle(page) {
  try {
    await page.waitForLoadState('networkidle', { timeout: 8000 });
  } catch {
    // vite HMR socket can keep the network "busy" — the fixed wait below is enough
  }
  await page.waitForTimeout(900);
}

async function shoot(page, name) {
  await settle(page);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`shot ${name}`);
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return res.json();
}

const products = await getJson(`${API}/api/products?page=1&pageSize=1`);
const productId = products.items?.[0]?.prod_id;
if (!productId) {
  console.error('No products from API �?" is the backend running on :4141?');
  process.exit(1);
}
const content = await getJson(`${API}/api/site-content`);
const policySlug = content.policies?.[0]?.slug || null;

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
const page = await context.newPage();
page.setDefaultTimeout(25000);

// ---- guest pages ----
const guest = [
  ['01-home', '/'],
  ['02-menu', '/menu'],
  ['03-product-detail', `/products/${productId}`],
  ['04-cart', '/cart'],
  ['05-support', '/support'],
  ['06-about', '/about'],
  ...(policySlug ? [['07-policy', `/policies/${policySlug}`]] : []),
  ['08-pets', '/pets'],
];
for (const [name, p] of guest) {
  await page.goto(BASE + p, { waitUntil: 'load' });
  await shoot(page, name);
}

// ---- login modal (opened from the mobile hamburger menu) ----
await page.goto(BASE + '/', { waitUntil: 'load' });
await settle(page);
await page.locator('button[aria-label="Menu"]').click();
await page.locator('button:text-is("Sign In"):visible').first().click();
await page.waitForSelector('#login-email');
await shoot(page, '09-login-modal');
await page.fill('#login-email', ADMIN_EMAIL);
await page.fill('#login-password', ADMIN_PASSWORD);
await page.locator('#login-password').press('Enter');
await page.waitForSelector('#login-email', { state: 'detached', timeout: 30000 });
await page.waitForTimeout(1200);

// ---- admin pages ----
const admin = [
  ['10-admin-dashboard', '/admin'],
  ['11-admin-products', '/admin/products'],
  ['12-admin-orders', '/admin/orders'],
  ['13-admin-payments', '/admin/payments'],
  ['14-admin-customers', '/admin/customers'],
  ['15-admin-promos', '/admin/promos'],
  ['16-admin-media', '/admin/media'],
  ['17-admin-banners', '/admin/banners'],
  ['18-admin-home-sections', '/admin/home-sections'],
  ['19-admin-navigation', '/admin/navigation'],
  ['20-admin-settings', '/admin/settings'],
  ['21-admin-support', '/admin/support'],
  ['22-admin-audit-logs', '/admin/audit-logs'],
];
for (const [name, p] of admin) {
  await page.goto(BASE + p, { waitUntil: 'load' });
  await shoot(page, name);
}

// ---- customer pages as the signed-in staff/admin account ----
await page.goto(BASE + '/orders', { waitUntil: 'load' });
await shoot(page, '23-user-orders');
await page.goto(BASE + '/profile', { waitUntil: 'load' });
await shoot(page, '24-user-profile');

await browser.close();
console.log('done ->', OUT);
