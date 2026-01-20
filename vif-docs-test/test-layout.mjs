import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

console.log('Navigating to docs...');
await page.goto('http://localhost:3001/docs/', { waitUntil: 'networkidle0', timeout: 15000 });
await page.waitForSelector('.dw-layout', { timeout: 10000 }).catch(() => {});

// Check layout structure
const layout = await page.evaluate(() => {
  const header = document.querySelector('.dw-header');
  const sidebar = document.querySelector('.dw-sidebar');
  const main = document.querySelector('.dw-main');
  const content = document.querySelector('.dw-content');

  const getStyles = (el, name) => {
    if (!el) return { exists: false, name };
    const s = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      exists: true,
      name,
      position: s.position,
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      background: s.backgroundColor,
    };
  };

  return {
    header: getStyles(header, 'header'),
    sidebar: getStyles(sidebar, 'sidebar'),
    main: getStyles(main, 'main'),
    content: getStyles(content, 'content')
  };
});

console.log('\n=== Layout Check ===');
console.log('Header:', JSON.stringify(layout.header, null, 2));
console.log('Sidebar:', JSON.stringify(layout.sidebar, null, 2));
console.log('Main:', JSON.stringify(layout.main, null, 2));
console.log('Content:', JSON.stringify(layout.content, null, 2));

// Verify layout is correct
const issues = [];
if (layout.header.position !== 'fixed') issues.push(`Header position is ${layout.header.position}, should be fixed`);
if (layout.header.height > 100) issues.push(`Header height is ${layout.header.height}, should be ~56px`);
if (layout.sidebar.exists && layout.sidebar.left > 0) issues.push(`Sidebar left is ${layout.sidebar.left}, should be 0`);

if (issues.length === 0) {
  console.log('\n✅ Layout looks correct!');
} else {
  console.log('\n❌ Layout issues:');
  issues.forEach(i => console.log('  -', i));
}

// Take a screenshot
await page.screenshot({ path: '/tmp/docs-layout-test.png', fullPage: false });
console.log('\nScreenshot saved to /tmp/docs-layout-test.png');

await browser.close();
