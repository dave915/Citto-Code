/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}', './index.html'],
  theme: {
    extend: {
      colors: {
        claude: {
          orange: '#D97757',
          bg: '#F5F0EB',
          sidebar: '#1A1A1A',
          'sidebar-hover': '#2A2A2A',
          'sidebar-active': '#333333',
          border: '#E5DDD4',
          text: '#1A1A1A',
          muted: '#8B7B6B',
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace']
      }
    }
  },
  plugins: [require('@tailwindcss/typography')]
}
