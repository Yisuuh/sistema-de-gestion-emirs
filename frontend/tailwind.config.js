/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Barlow Condensed — headings, labels, nav
        display: ['"Barlow Condensed"', 'sans-serif'],
        // JetBrains Mono — numbers, data, monetary values
        data:    ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // Brand palette
        brand: {
          DEFAULT: '#df000a',
          dark:    '#b8000a',
          darker:  '#8c0007',
          light:   '#ff4040',
        },
        accent: {
          DEFAULT: '#f6ed00',
          dark:    '#d4cc00',
        },
        secondary: {
          DEFAULT: '#ef8701',
          dark:    '#c97001',
        },
        // Dark design system surfaces
        surface: {
          page:     '#0d0f14',
          card:     '#141720',
          elevated: '#1c1f2b',
          input:    '#181b24',
          sidebar:  '#0a0c10',
        },
        ink: {
          1: '#eceef2',
          2: '#8f95a3',
          3: '#4d5263',
        },
      },
      boxShadow: {
        'glow-red':    '0 0 20px rgba(223,0,10,0.30)',
        'glow-red-sm': '0 0 8px rgba(223,0,10,0.20)',
      },
    },
  },
  plugins: [],
}
