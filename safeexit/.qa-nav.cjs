const { chromium } = require('playwright');

(async () => {
  let browser = null;
  for (const ch of ['msedge', 'chrome', null]) {
    try { browser = ch ? await chromium.launch({ channel: ch }) : await chromium.launch(); break; } catch (e) {}
  }
  if (!browser) { console.error('NO_BROWSER'); process.exit(2); }

  const file = 'file://' + process.argv[2].replace(/\\/g, '/');
  for (const w of [360, 390, 430]) {
    const page = await browser.newPage({ viewport: { width: w, height: 400 }, deviceScaleFactor: 2 });
    await page.goto(file);
    await page.waitForTimeout(1200);
    const m = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('.sd-navx').forEach((b) => {
        const l = b.querySelector('.sd-navx__label');
        out.push({
          label: l.textContent,
          colW: Math.round(b.getBoundingClientRect().width),
          textW: l.scrollWidth,
          boxW: Math.round(l.getBoundingClientRect().width),
          TRUNCATED: l.scrollWidth > l.clientWidth + 1,
        });
      });
      return { tabs: out, barH: Math.round(document.getElementById('bar').getBoundingClientRect().height) };
    });
    console.log(`\n--- ${w}px --- bar height ${m.barH}px`);
    m.tabs.forEach(t => console.log(`  ${t.label.padEnd(9)} col=${String(t.colW).padStart(3)}  text=${String(t.textW).padStart(3)}  ${t.TRUNCATED ? '*** TRUNCATED ***' : 'ok'}`));
    await page.screenshot({ path: process.argv[3].replace('.png', `-${w}.png`) });
    await page.close();
  }
  await browser.close();
})();
