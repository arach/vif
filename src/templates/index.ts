/**
 * Slide Templates
 *
 * TypeScript functions that generate HTML for video slides.
 * Rendered via Puppeteer for PNG/video output.
 */

export interface SlideConfig {
  width?: number;
  height?: number;
}

export interface TitleCardProps extends SlideConfig {
  title: string;
  subtitle?: string;
  logo?: string;
  background?: string;
  titleColor?: string;
  subtitleColor?: string;
}

export interface LowerThirdProps extends SlideConfig {
  title: string;
  subtitle?: string;
  accentColor?: string;
  background?: string;
}

export interface OutroProps extends SlideConfig {
  cta: string;
  url: string;
  tagline?: string;
  background?: string;
}

export interface ComingSoonProps extends SlideConfig {
  title?: string;
  launchDate?: string;
  background?: string;
}

const defaultStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
`;

export function titleCard(props: TitleCardProps): string {
  const {
    width = 1920,
    height = 1080,
    title,
    subtitle,
    logo,
    background = 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
    titleColor = '#ffffff',
    subtitleColor = '#94a3b8',
  } = props;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    ${defaultStyles}
    body {
      width: ${width}px;
      height: ${height}px;
      background: ${background};
      font-family: 'Inter', -apple-system, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .content { text-align: center; }
    .title {
      font-size: ${Math.round(width * 0.05)}px;
      font-weight: 700;
      color: ${titleColor};
      margin-bottom: 16px;
      letter-spacing: -0.02em;
    }
    .subtitle {
      font-size: ${Math.round(width * 0.025)}px;
      font-weight: 400;
      color: ${subtitleColor};
    }
    .logo {
      position: absolute;
      bottom: 40px;
      font-size: 24px;
      font-weight: 600;
      color: ${titleColor};
      opacity: 0.5;
    }
  </style>
</head>
<body>
  <div class="content">
    <div class="title">${escapeHtml(title)}</div>
    ${subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : ''}
  </div>
  ${logo ? `<div class="logo">${escapeHtml(logo)}</div>` : ''}
</body>
</html>`;
}

export function lowerThird(props: LowerThirdProps): string {
  const {
    width = 1920,
    height = 1080,
    title,
    subtitle,
    accentColor = '#10b981',
    background = 'rgba(15, 23, 42, 0.9)',
  } = props;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    ${defaultStyles}
    body {
      width: ${width}px;
      height: ${height}px;
      background: transparent;
      font-family: 'Inter', -apple-system, sans-serif;
      display: flex;
      align-items: flex-end;
      padding: 40px 60px;
    }
    .lower-third {
      background: ${background};
      padding: 16px 28px;
      border-radius: 8px;
      border-left: 4px solid ${accentColor};
    }
    .title {
      font-size: ${Math.round(width * 0.02)}px;
      font-weight: 600;
      color: #ffffff;
      margin-bottom: 4px;
    }
    .subtitle {
      font-size: ${Math.round(width * 0.014)}px;
      font-weight: 400;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="lower-third">
    <div class="title">${escapeHtml(title)}</div>
    ${subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : ''}
  </div>
</body>
</html>`;
}

export function outro(props: OutroProps): string {
  const {
    width = 1920,
    height = 1080,
    cta,
    url,
    tagline,
    background = 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
  } = props;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    ${defaultStyles}
    body {
      width: ${width}px;
      height: ${height}px;
      background: ${background};
      font-family: 'Inter', -apple-system, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .content { text-align: center; }
    .cta {
      font-size: ${Math.round(width * 0.035)}px;
      font-weight: 600;
      color: #ffffff;
      margin-bottom: 24px;
    }
    .url {
      font-size: ${Math.round(width * 0.025)}px;
      font-weight: 500;
      color: #10b981;
      padding: 12px 32px;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
      border-radius: 8px;
      margin-bottom: 32px;
    }
    .tagline {
      font-size: ${Math.round(width * 0.016)}px;
      font-weight: 400;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="content">
    <div class="cta">${escapeHtml(cta)}</div>
    <div class="url">${escapeHtml(url)}</div>
    ${tagline ? `<div class="tagline">${escapeHtml(tagline)}</div>` : ''}
  </div>
</body>
</html>`;
}

export function comingSoon(props: ComingSoonProps): string {
  const {
    width = 1920,
    height = 1080,
    title = 'Coming Soon',
    launchDate,
    background = 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
  } = props;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    ${defaultStyles}
    body {
      width: ${width}px;
      height: ${height}px;
      background: ${background};
      font-family: 'Inter', -apple-system, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .content { text-align: center; }
    .title {
      font-size: ${Math.round(width * 0.06)}px;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 24px;
      letter-spacing: -0.02em;
    }
    .date {
      font-size: ${Math.round(width * 0.02)}px;
      font-weight: 500;
      color: #a5b4fc;
      padding: 8px 24px;
      background: rgba(165, 180, 252, 0.1);
      border-radius: 100px;
    }
  </style>
</head>
<body>
  <div class="content">
    <div class="title">${escapeHtml(title)}</div>
    ${launchDate ? `<div class="date">${escapeHtml(launchDate)}</div>` : ''}
  </div>
</body>
</html>`;
}

// Template registry for storyboard parsing
export const templates = {
  'title-card': titleCard,
  'lower-third': lowerThird,
  'outro': outro,
  'coming-soon': comingSoon,
} as const;

export type TemplateName = keyof typeof templates;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
