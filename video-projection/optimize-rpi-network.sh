#!/bin/bash

# Raspberry Pi Network and Performance Optimization Script
# Run this script to optimize network performance and reduce port 3000 response time

echo "=== Raspberry Pi Network Optimization ==="
echo "This script will optimize your system for better Next.js/Electron performance"
echo ""

# Check if running as root for system optimizations
if [ "$EUID" -ne 0 ]; then
    echo "Note: Some optimizations require root privileges"
    echo "Run with sudo for full optimization"
    echo ""
fi

# 1. Network optimizations
echo "1. Applying network optimizations..."

# Increase network buffer sizes
if [ "$EUID" -eq 0 ]; then
    echo "net.core.rmem_default = 262144" >> /etc/sysctl.conf
    echo "net.core.rmem_max = 16777216" >> /etc/sysctl.conf
    echo "net.core.wmem_default = 262144" >> /etc/sysctl.conf
    echo "net.core.wmem_max = 16777216" >> /etc/sysctl.conf
    echo "net.ipv4.tcp_rmem = 4096 65536 16777216" >> /etc/sysctl.conf
    echo "net.ipv4.tcp_wmem = 4096 65536 16777216" >> /etc/sysctl.conf
    sysctl -p
    echo "✓ Network buffer sizes increased"
else
    echo "⚠ Skipping network buffer optimization (requires root)"
fi

# 2. Node.js optimizations
echo ""
echo "2. Setting Node.js environment optimizations..."

# Create a .env.local file for production optimizations
cat > .env.local << 'EOF'
# Production optimizations for Raspberry Pi
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
NEXT_SHARP=0
# Reduce memory usage
NODE_OPTIONS=--max-old-space-size=512
# Disable source maps in production
GENERATE_SOURCEMAP=false
EOF

echo "✓ Created .env.local with Node.js optimizations"

# 3. Next.js configuration optimizations
echo ""
echo "3. Creating optimized Next.js configuration..."

# Check if next.config.js exists and backup
if [ -f "next.config.js" ]; then
    cp next.config.js next.config.js.backup
    echo "✓ Backed up existing next.config.js"
fi

# Create optimized next.config.js
cat > next.config.js << 'EOF'
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Production optimizations for Raspberry Pi
  swcMinify: true,
  compress: true,
  
  // Disable source maps in production
  productionBrowserSourceMaps: false,
  
  // Optimize images
  images: {
    unoptimized: true, // Disable image optimization to reduce CPU load
  },
  
  // Reduce bundle size
  experimental: {
    optimizeCss: true,
    optimizePackageImports: ['lucide-react'],
  },
  
  // Webpack optimizations
  webpack: (config, { dev, isServer }) => {
    // Production optimizations
    if (!dev) {
      config.optimization.minimize = true;
      config.optimization.sideEffects = false;
    }
    
    // Reduce memory usage
    config.optimization.splitChunks = {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
        },
      },
    };
    
    return config;
  },
  
  // Output configuration for better performance
  output: 'standalone',
  
  // Disable telemetry
  telemetry: false,
};

module.exports = nextConfig;
EOF

echo "✓ Created optimized next.config.js"

# 4. Package.json script optimizations
echo ""
echo "4. Adding optimized npm scripts..."

# Check if jq is available for JSON manipulation
if command -v jq &> /dev/null; then
    # Add production-optimized scripts
    jq '.scripts["start:optimized"] = "NODE_ENV=production NODE_OPTIONS=\"--max-old-space-size=512\" node server.js"' package.json > package.json.tmp && mv package.json.tmp package.json
    jq '.scripts["build:rpi"] = "NODE_ENV=production NODE_OPTIONS=\"--max-old-space-size=512\" next build"' package.json > package.json.tmp && mv package.json.tmp package.json
    echo "✓ Added optimized npm scripts"
else
    echo "⚠ jq not found - manually add these scripts to package.json:"
    echo '  "start:optimized": "NODE_ENV=production NODE_OPTIONS=\"--max-old-space-size=512\" node server.js"'
    echo '  "build:rpi": "NODE_ENV=production NODE_OPTIONS=\"--max-old-space-size=512\" next build"'
fi

# 5. System service optimizations
echo ""
echo "5. System optimizations..."

if [ "$EUID" -eq 0 ]; then
    # Increase file descriptor limits
    echo "* soft nofile 65536" >> /etc/security/limits.conf
    echo "* hard nofile 65536" >> /etc/security/limits.conf
    echo "✓ Increased file descriptor limits"
    
    # GPU memory split for Raspberry Pi
    if [ -f "/boot/config.txt" ]; then
        if ! grep -q "gpu_mem=" /boot/config.txt; then
            echo "gpu_mem=128" >> /boot/config.txt
            echo "✓ Set GPU memory to 128MB"
        fi
    fi
else
    echo "⚠ Skipping system optimizations (requires root)"
fi

# 6. Create performance monitoring script
echo ""
echo "6. Creating performance monitoring script..."

cat > monitor-performance.sh << 'EOF'
#!/bin/bash
echo "=== Performance Monitor ==="
echo "Date: $(date)"
echo ""
echo "Memory Usage:"
free -h
echo ""
echo "CPU Usage:"
top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1
echo ""
echo "Network Connections:"
netstat -tuln | grep :3000
echo ""
echo "Node.js Processes:"
ps aux | grep node | grep -v grep
echo ""
echo "Port 3000 Response Test:"
time curl -s http://localhost:3000/tv > /dev/null && echo "✓ Port 3000 responding" || echo "✗ Port 3000 not responding"
EOF

chmod +x monitor-performance.sh
echo "✓ Created performance monitoring script"

echo ""
echo "=== Optimization Complete ==="
echo ""
echo "Next steps:"
echo "1. Rebuild the project: npm run build:rpi"
echo "2. Test with production script: ./start-electron-production.sh"
echo "3. Monitor performance: ./monitor-performance.sh"
echo ""
echo "Network optimizations:"
echo "- Increased network buffer sizes"
echo "- Optimized Node.js memory usage"
echo "- Disabled unnecessary features"
echo "- Created production-optimized build"
echo ""
echo "If running on Raspberry Pi, consider:"
echo "- Using a fast SD card (Class 10 or better)"
echo "- Ensuring adequate cooling"
echo "- Using wired ethernet instead of WiFi"
echo ""
echo "Reboot recommended to apply all optimizations."
