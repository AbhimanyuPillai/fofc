const fs = require('fs');
const path = require('path');

// Create a simple SVG icon for the Video Projection Hub
const createSVGIcon = (size) => {
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0f172a;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#1e293b;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#334155;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#8b5cf6;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- Background -->
  <rect width="${size}" height="${size}" fill="url(#bg)" rx="${size * 0.15}"/>
  
  <!-- Iron Man Arc Reactor Style Circle -->
  <circle cx="${size/2}" cy="${size/2}" r="${size * 0.25}" fill="none" stroke="url(#accent)" stroke-width="${size * 0.02}" opacity="0.8"/>
  <circle cx="${size/2}" cy="${size/2}" r="${size * 0.15}" fill="none" stroke="url(#accent)" stroke-width="${size * 0.015}" opacity="0.6"/>
  <circle cx="${size/2}" cy="${size/2}" r="${size * 0.08}" fill="url(#accent)" opacity="0.9"/>
  
  <!-- Video Play Symbol -->
  <polygon points="${size * 0.45},${size * 0.4} ${size * 0.45},${size * 0.6} ${size * 0.6},${size * 0.5}" fill="white" opacity="0.9"/>
  
  <!-- Decorative Elements -->
  <circle cx="${size * 0.2}" cy="${size * 0.2}" r="${size * 0.02}" fill="url(#accent)" opacity="0.7"/>
  <circle cx="${size * 0.8}" cy="${size * 0.2}" r="${size * 0.02}" fill="url(#accent)" opacity="0.7"/>
  <circle cx="${size * 0.2}" cy="${size * 0.8}" r="${size * 0.02}" fill="url(#accent)" opacity="0.7"/>
  <circle cx="${size * 0.8}" cy="${size * 0.8}" r="${size * 0.02}" fill="url(#accent)" opacity="0.7"/>
</svg>`;
};

// Icon sizes needed for PWA
const iconSizes = [16, 32, 72, 96, 128, 144, 152, 192, 384, 512];

// Create icons directory if it doesn't exist
const iconsDir = path.join(__dirname, 'public', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Generate SVG icons for each size
iconSizes.forEach(size => {
  const svgContent = createSVGIcon(size);
  const filename = `icon-${size}x${size}.svg`;
  fs.writeFileSync(path.join(iconsDir, filename), svgContent);
  console.log(`Generated ${filename}`);
});

// Create a simple PNG fallback using a basic canvas approach (for demonstration)
// In a real project, you'd use a proper image processing library like sharp or jimp
const createSimplePNG = (size) => {
  // This is a placeholder - in practice you'd convert SVG to PNG
  // For now, we'll create the SVG files which browsers can use
  return `<!-- PNG placeholder for ${size}x${size} -->`;
};

console.log('Icon generation complete! SVG icons created.');
console.log('Note: For production, consider converting SVG icons to PNG format using a tool like sharp or imagemagick.');
