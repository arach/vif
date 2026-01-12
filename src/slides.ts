/**
 * Slide Renderer
 *
 * Renders TypeScript templates to PNG/video using Puppeteer.
 */

import puppeteer, { Browser } from 'puppeteer';
import { writeFileSync } from 'fs';
import {
  templates,
  TemplateName,
  TitleCardProps,
  LowerThirdProps,
  OutroProps,
  ComingSoonProps,
} from './templates/index.js';

export type SlideProps = TitleCardProps | LowerThirdProps | OutroProps | ComingSoonProps;

export interface RenderSlideOptions {
  template: TemplateName;
  props: SlideProps;
  output: string;
  width?: number;
  height?: number;
}

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browserInstance;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

export async function renderSlide(options: RenderSlideOptions): Promise<string> {
  const { template, props, output, width = 1920, height = 1080 } = options;

  const templateFn = templates[template];
  if (!templateFn) {
    throw new Error(`Unknown template: ${template}`);
  }

  // Add dimensions to props
  const propsWithDimensions = { ...props, width, height } as SlideProps;

  // Generate HTML
  const html = templateFn(propsWithDimensions as any);

  // Render with Puppeteer
  const browser = await getBrowser();
  const page = await browser.newPage();

  await page.setViewport({ width, height });
  await page.setContent(html, { waitUntil: 'domcontentloaded' });

  // Wait for fonts to load (with timeout)
  await Promise.race([
    page.evaluate(() => document.fonts.ready),
    new Promise(resolve => setTimeout(resolve, 3000))
  ]);

  // Take screenshot
  await page.screenshot({
    path: output,
    type: output.endsWith('.png') ? 'png' : 'jpeg',
    omitBackground: template === 'lower-third', // Transparent for overlays
  });

  await page.close();

  return output;
}

export async function renderSlides(
  slides: RenderSlideOptions[]
): Promise<string[]> {
  const outputs: string[] = [];

  for (const slide of slides) {
    const output = await renderSlide(slide);
    outputs.push(output);
  }

  await closeBrowser();
  return outputs;
}

// Quick render functions for common templates
export async function renderTitleCard(
  props: TitleCardProps,
  output: string
): Promise<string> {
  return renderSlide({ template: 'title-card', props, output });
}

export async function renderLowerThird(
  props: LowerThirdProps,
  output: string
): Promise<string> {
  return renderSlide({ template: 'lower-third', props, output });
}

export async function renderOutro(
  props: OutroProps,
  output: string
): Promise<string> {
  return renderSlide({ template: 'outro', props, output });
}

export async function renderComingSoon(
  props: ComingSoonProps,
  output: string
): Promise<string> {
  return renderSlide({ template: 'coming-soon', props, output });
}
