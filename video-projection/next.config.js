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
    // Disable CSS optimization to avoid missing 'critters' dependency during prerender
    optimizeCss: false,
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
};

module.exports = nextConfig;
