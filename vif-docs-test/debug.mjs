import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ 
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto('http://localhost:3001/docs/', { waitUntil: 'networkidle0', timeout: 15000 });
await page.waitForSelector('.dw-layout', { timeout: 10000 }).catch(() => {});

// Check layout structure
const layout = await page.evaluate(() => {
  const header = document.querySelector('header');
  const sidebar = document.querySelector('.dw-sidebar');
  const main = document.querySelector('.dw-main, main');
  const content = document.querySelector('.dw-content');
  
  const getStyles = (el) => {
    if (!el) return null;
    const s = getComputedStyle(el);
    return {
      position: s.position,
      top: s.top,
      left: s.left,
      width: s.width,
      height: s.height,
      paddingTop: s.paddingTop,
      marginTop: s.marginTop,
      zIndex: s.zIndex
    };
  };
  
  return {
    header: getStyles(header),
    sidebar: getStyles(sidebar),
    main: getStyles(main),
    content: getStyles(content)
  };
});
console.log('Layout:', JSON.stringify(layout, null, 2));

// Check if header overlaps content
const overlap = await page.evaluate(() => {
  const header = document.querySelector('header');
  const sidebar = document.querySelector('.dw-sidebar');
  if (!header || !sidebar) return 'Elements not found';
  
  const headerRect = header.getBoundingClientRect();
  const sidebarRect = sidebar.getBoundingClientRect();
  
  return {
    headerBottom: headerRect.bottom,
    sidebarTop: sidebarRect.top,
    overlap: headerRect.bottom > sidebarRect.top
  };
});
console.log('Overlap check:', JSON.stringify(overlap, null, 2));

await browser.close();
