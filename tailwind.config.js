/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}', './index.html'],
  theme: {
    extend: {
      colors: {
        claude: {
          orange: '#C98B5B',
          bg: '#11100F',
          panel: '#181614',
          surface: '#1E1A18',
          'surface-2': '#25211E',
          sidebar: '#151412',
          'sidebar-hover': '#201D1B',
          'sidebar-active': '#2B2622',
          border: '#312B27',
          text: '#F3EEE7',
          muted: '#A2978A',
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
