const { chromium } = require('playwright');

(async () => {
  let browser = null;
  for (const channel of ['msedge', 'chrome', null]) {
    try {
      browser = channel ? await chromium.launch({ channel }) : await chromium.launch();
      break;
    } catch (e) { /* next */ }
  }
  if (!browser) { console.error('NO_BROWSER'); process.exit(2); }

  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  await page.goto('file://' + process.argv[2].replace(/\\/g, '/'));
  await page.waitForTimeout(1500);

  const metrics = await page.evaluate(() => {
    const rows = [];
    document.querySelectorAll('.sd-qa').forEach((tile) => {
      const inner = tile.querySelector('.sd-tile__inner');
      const t = tile.querySelector('.sd-card-title');
      const d = tile.querySelector('.sd-act-desc');
      const lh = (el) => parseFloat(getComputedStyle(el).lineHeight);
      // scrollHeight vs clientHeight reveals text the line-clamp is cutting off
      rows.push({
        title: t.textContent,
        tileH: Math.round(inner.getBoundingClientRect().height),
        tileW: Math.round(inner.getBoundingClientRect().width),
        titleLines: Math.round(t.getBoundingClientRect().height / lh(t)),
        descW: Math.round(d.getBoundingClientRect().width),
        descLines: Math.round(d.getBoundingClientRect().height / lh(d)),
        descNeededLines: Math.round(d.scrollHeight / lh(d)),
        CLAMPED: d.scrollHeight > d.clientHeight + 1,
      });
    });
    return { tiles: rows, docScrollW: document.documentElement.scrollWidth };
  });
  console.log(JSON.stringify(metrics, null, 2));
  await page.screenshot({ path: process.argv[3], fullPage: true });
  await browser.close();
})();
