/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg:      'rgb(var(--bg-rgb) / <alpha-value>)',
        fg:      'rgb(var(--fg-rgb) / <alpha-value>)',
        surface: 'rgb(var(--surface-rgb) / <alpha-value>)'
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      letterSpacing: { tightest: '-0.05em' },
      borderRadius: { '2xl': '1.5rem', '3xl': '2rem' },
      backdropBlur: { xl: '20px' }
    }
  },
  plugins: []
};
