import { URL } from 'node:url';
// Additional guard, not a replacement for the sandbox or B1 authorization.
export default async ({ page }) => {
  await page.context().route('**/*', async route => {
    const u = new URL(route.request().url());
    const safe = u.origin === 'https://cleanops.nuvurent.com' && (u.pathname === '/demo' || u.pathname.startsWith('/demo/') || u.pathname.startsWith('/_next/'));
    if (safe && ['GET','HEAD'].includes(route.request().method())) await route.continue();
    else await route.abort('blockedbyclient');
  });
};
