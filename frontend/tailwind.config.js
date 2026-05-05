/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta EmirS
        brand: {
          DEFAULT: '#df000a',
          dark:    '#b8000a',
          darker:  '#8c0007',
          light:   '#ff2020',
        },
        accent: {
          DEFAULT: '#f6ed00',
          dark:    '#d4cc00',
        },
        secondary: {
          DEFAULT: '#ef8701',
          dark:    '#c97001',
        },
      },
    },
  },
  plugins: [],
}
