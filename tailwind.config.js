/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Semantic accent for plain-English coaching reads layered over
        // charts ("Athlete Intelligence" pattern). Maps to Tailwind orange
        // today so existing utilities keep working; promoting it to a token
        // here lets us re-theme the whole layer in one place later.
        intelligence: {
          50: '#FFF7ED',
          100: '#FFEDD5',
          200: '#FED7AA',
          300: '#FDBA74',
          500: '#F97316',
          600: '#EA580C',
          700: '#C2410C',
          800: '#9A3412',
          900: '#7C2D12',
          950: '#431407',
        },
      },
    },
  },
  plugins: [],
}

