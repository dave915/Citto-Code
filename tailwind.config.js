/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}', './index.html'],
  theme: {
    extend: {
      colors: {
        claude: {
          orange: '#B97C56',
          bg: '#242426',
          panel: '#2B2B2E',
          surface: '#303034',
          'surface-2': '#38383D',
          sidebar: '#232325',
          'sidebar-hover': '#2D2D30',
          'sidebar-active': '#343439',
          border: '#3E3E44',
          text: '#F2EEE8',
          muted: '#A7A19A',
        }
      },
      fontFamily: {
        sans: ['"SF Pro Display"', 'Pretendard Variable', 'Pretendard', '"Apple SD Gothic Neo"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace']
      }
    }
  },
  plugins: [require('@tailwindcss/typography')]
}
