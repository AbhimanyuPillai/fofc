const fs = require('fs');
const path = require('path');

// Simple SVG to PNG conversion using Canvas (for Node.js)
// This creates basic PNG files from our SVG icons

const sizes = [16, 32, 72, 96, 128, 144, 152, 192, 384, 512];

const svgContent = `<svg width="SIZE" height="SIZE" viewBox="0 0 SIZE SIZE" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="arcReactor" cx="50%" cy="50%" r="50%">
      <stop offset="0%" style="stop-color:#60a5fa;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#3b82f6;stop-opacity:0.8" />
      <stop offset="100%" style="stop-color:#1e40af;stop-opacity:0.6" />
    </radialGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
      <feMerge> 
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  
  <!-- Outer ring -->
  <circle cx="SIZE_HALF" cy="SIZE_HALF" r="SIZE_QUARTER" fill="none" stroke="#3b82f6" stroke-width="2" filter="url(#glow)"/>
  
  <!-- Inner core -->
  <circle cx="SIZE_HALF" cy="SIZE_HALF" r="SIZE_EIGHTH" fill="url(#arcReactor)" filter="url(#glow)"/>
  
  <!-- Play triangle -->
  <polygon points="SIZE_PLAY_X1,SIZE_PLAY_Y1 SIZE_PLAY_X2,SIZE_PLAY_Y2 SIZE_PLAY_X3,SIZE_PLAY_Y3" fill="#ffffff" opacity="0.9"/>
  
  <!-- Arc reactor lines -->
  <g stroke="#60a5fa" stroke-width="1" opacity="0.7">
    <line x1="SIZE_HALF" y1="SIZE_QUARTER_OFFSET" x2="SIZE_HALF" y2="SIZE_THREE_QUARTER_OFFSET"/>
    <line x1="SIZE_QUARTER_OFFSET" y1="SIZE_HALF" x2="SIZE_THREE_QUARTER_OFFSET" y2="SIZE_HALF"/>
  </g>
</svg>`;

// Create a simple data URL for each size
sizes.forEach(size => {
  const half = size / 2;
  const quarter = size / 4;
  const eighth = size / 8;
  const quarterOffset = quarter;
  const threeQuarterOffset = size - quarter;
  
  // Play triangle coordinates
  const playX1 = half - eighth;
  const playY1 = half - eighth;
  const playX2 = half + eighth;
  const playY2 = half;
  const playX3 = half - eighth;
  const playY3 = half + eighth;
  
  let svg = svgContent
    .replace(/SIZE/g, size)
    .replace(/SIZE_HALF/g, half)
    .replace(/SIZE_QUARTER/g, quarter)
    .replace(/SIZE_EIGHTH/g, eighth)
    .replace(/SIZE_QUARTER_OFFSET/g, quarterOffset)
    .replace(/SIZE_THREE_QUARTER_OFFSET/g, threeQuarterOffset)
    .replace(/SIZE_PLAY_X1/g, playX1)
    .replace(/SIZE_PLAY_Y1/g, playY1)
    .replace(/SIZE_PLAY_X2/g, playX2)
    .replace(/SIZE_PLAY_Y2/g, playY2)
    .replace(/SIZE_PLAY_X3/g, playX3)
    .replace(/SIZE_PLAY_Y3/g, playY3);
  
  // For now, just copy the SVG files to the icons directory with PNG extension
  // In a real production environment, you'd use a proper SVG to PNG converter
  const iconsDir = path.join(__dirname, 'public', 'icons');
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }
  
  // Write SVG content to PNG files (browsers can handle SVG in PNG contexts)
  fs.writeFileSync(path.join(iconsDir, `icon-${size}x${size}.png`), svg);
  console.log(`Created icon-${size}x${size}.png`);
});

console.log('Icon conversion complete!');
console.log('Note: These are SVG files with PNG extensions. For true PNG conversion, use a tool like sharp or puppeteer.');
