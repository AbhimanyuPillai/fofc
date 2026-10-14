/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      animation: {
        'spin-slow': 'spin 8s linear infinite',
        'spin-reverse': 'spin-reverse 6s linear infinite',
        'float': 'float 4s ease-in-out infinite',
        'float-delayed': 'float 4s ease-in-out infinite 2s',
        'circuit-wave': 'circuit-wave 3s ease-in-out infinite',
        'ai-os': 'ai-os 6s ease-in-out infinite',
        'ai-os-delayed': 'ai-os 6s ease-in-out infinite 3s',
        'scan-line': 'scan-line 4s linear infinite',
        'circuit-flow': 'circuit-flow 6s linear infinite',
        'circuit-flow-reverse': 'circuit-flow-reverse 6s linear infinite',
        'circuit-flow-vertical': 'circuit-flow-vertical 8s linear infinite',
        'circuit-flow-vertical-reverse': 'circuit-flow-vertical-reverse 8s linear infinite',
        'data-pulse': 'data-pulse 2s ease-in-out infinite',
        'data-pulse-delayed': 'data-pulse 2s ease-in-out infinite 1s',
        'code-stream': 'code-stream 10s linear infinite',
        'code-stream-delayed': 'code-stream 10s linear infinite 5s',
        'hex-stream': 'hex-stream 8s linear infinite',
        'hex-stream-delayed': 'hex-stream 8s linear infinite 4s',
        'terminal-blink': 'terminal-blink 3s ease-in-out infinite',
        'terminal-blink-delayed': 'terminal-blink 3s ease-in-out infinite 1.5s',
        'typing': 'typing 2s steps(20) infinite',
        'typing-delayed': 'typing 2s steps(20) infinite 1s',
        'progress-glow': 'progress-glow 2s ease-in-out infinite',
        'progress-glow-delayed': 'progress-glow 2s ease-in-out infinite 1s',
        'progress-fill': 'progress-fill 4s ease-in-out infinite',
        'progress-fill-reverse': 'progress-fill-reverse 4s ease-in-out infinite',
        'wave-expand': 'wave-expand 3s ease-out infinite',
        'wave-expand-delayed': 'wave-expand 3s ease-out infinite 1.5s',
        'hud-pulse': 'hud-pulse 2s ease-in-out infinite',
        'hud-pulse-delayed': 'hud-pulse 2s ease-in-out infinite 1s',
      },
      keyframes: {
        'spin-reverse': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(-360deg)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px) rotateX(45deg)' },
          '50%': { transform: 'translateY(-20px) rotateX(45deg)' },
        },
        'circuit-wave': {
          '0%': { 
            transform: 'translateX(0px)',
            opacity: '0.4'
          },
          '50%': { 
            transform: 'translateX(20px)',
            opacity: '0.8'
          },
          '100%': { 
            transform: 'translateX(0px)',
            opacity: '0.4'
          },
        },
        'ai-os': {
          '0%': { 
            transform: 'scale(1) rotateY(0deg)',
            opacity: '0.4'
          },
          '25%': { 
            transform: 'scale(1.1) rotateY(90deg)',
            opacity: '0.8'
          },
          '50%': { 
            transform: 'scale(1) rotateY(180deg)',
            opacity: '0.4'
          },
          '75%': { 
            transform: 'scale(1.1) rotateY(270deg)',
            opacity: '0.8'
          },
          '100%': { 
            transform: 'scale(1) rotateY(360deg)',
            opacity: '0.4'
          },
        },
        'scan-line': {
          '0%': { transform: 'translateY(-100vh)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        'circuit-flow': {
          '0%': { 
            background: 'linear-gradient(90deg, transparent 0%, currentColor 50%, transparent 100%)',
            backgroundPosition: '-100% 0'
          },
          '100%': { 
            background: 'linear-gradient(90deg, transparent 0%, currentColor 50%, transparent 100%)',
            backgroundPosition: '200% 0'
          },
        },
        'circuit-flow-reverse': {
          '0%': { 
            background: 'linear-gradient(90deg, transparent 0%, currentColor 50%, transparent 100%)',
            backgroundPosition: '200% 0'
          },
          '100%': { 
            background: 'linear-gradient(90deg, transparent 0%, currentColor 50%, transparent 100%)',
            backgroundPosition: '-100% 0'
          },
        },
        'circuit-flow-vertical': {
          '0%': { 
            background: 'linear-gradient(0deg, transparent 0%, currentColor 50%, transparent 100%)',
            backgroundPosition: '0 -100%'
          },
          '100%': { 
            background: 'linear-gradient(0deg, transparent 0%, currentColor 50%, transparent 100%)',
            backgroundPosition: '0 200%'
          },
        },
        'circuit-flow-vertical-reverse': {
          '0%': { 
            background: 'linear-gradient(0deg, transparent 0%, currentColor 50%, transparent 100%)',
            backgroundPosition: '0 200%'
          },
          '100%': { 
            background: 'linear-gradient(0deg, transparent 0%, currentColor 50%, transparent 100%)',
            backgroundPosition: '0 -100%'
          },
        },
        'data-pulse': {
          '0%, 100%': { 
            transform: 'scale(1)',
            opacity: '0.6'
          },
          '50%': { 
            transform: 'scale(1.2)',
            opacity: '1'
          },
        },
        'code-stream': {
          '0%': { 
            transform: 'translateX(-100%)',
            opacity: '0'
          },
          '10%': { 
            opacity: '1'
          },
          '90%': { 
            opacity: '1'
          },
          '100%': { 
            transform: 'translateX(100vw)',
            opacity: '0'
          },
        },
        'hex-stream': {
          '0%': { 
            transform: 'translateY(-100%)',
            opacity: '0'
          },
          '10%': { 
            opacity: '1'
          },
          '90%': { 
            opacity: '1'
          },
          '100%': { 
            transform: 'translateY(100vh)',
            opacity: '0'
          },
        },
        'terminal-blink': {
          '0%, 100%': { 
            borderColor: 'currentColor',
            boxShadow: '0 0 10px currentColor'
          },
          '50%': { 
            borderColor: 'transparent',
            boxShadow: 'none'
          },
        },
        'typing': {
          '0%': { width: '0' },
          '100%': { width: '100%' },
        },
        'progress-glow': {
          '0%, 100%': { 
            boxShadow: '0 0 5px currentColor'
          },
          '50%': { 
            boxShadow: '0 0 20px currentColor'
          },
        },
        'progress-fill': {
          '0%': { width: '0%' },
          '50%': { width: '100%' },
          '100%': { width: '0%' },
        },
        'progress-fill-reverse': {
          '0%': { width: '100%' },
          '50%': { width: '0%' },
          '100%': { width: '100%' },
        },
        'wave-expand': {
          '0%': { 
            transform: 'scale(0)',
            opacity: '1'
          },
          '100%': { 
            transform: 'scale(2)',
            opacity: '0'
          },
        },
        'hud-pulse': {
          '0%, 100%': { 
            borderColor: 'currentColor',
            opacity: '0.6'
          },
          '50%': { 
            borderColor: 'currentColor',
            opacity: '1',
            boxShadow: '0 0 15px currentColor'
          },
        },
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))"
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))"
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))"
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))"
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))"
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))"
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))"
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))"
        }
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)"
      }
    }
  },
  plugins: [require("tailwindcss-animate")],
}
