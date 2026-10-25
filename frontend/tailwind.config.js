/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // MediConnect brand: deep medical blue (primary) + healthcare teal (secondary)
        brand: {
          50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#5b9bf0',
          500: '#2f6fd6', 600: '#1e4fb8', 700: '#173e93', 800: '#122f70',
        },
        accent: {
          50: '#effcf9', 100: '#d7f7ee', 200: '#aeeede', 300: '#79dfc7', 400: '#3fc9ab',
          500: '#1aa98d', 600: '#128873', 700: '#106c5e',
        },
      },
      backdropBlur: { xs: '2px' },
    },
  },
  plugins: [],
};
