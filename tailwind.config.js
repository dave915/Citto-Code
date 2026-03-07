/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}', './index.html'],
  theme: {
    extend: {
      colors: {
        claude: {
          orange: 'rgb(var(--claude-orange) / <alpha-value>)',
          bg: 'rgb(var(--claude-bg) / <alpha-value>)',
          panel: 'rgb(var(--claude-panel) / <alpha-value>)',
          surface: 'rgb(var(--claude-surface) / <alpha-value>)',
          'surface-2': 'rgb(var(--claude-surface-2) / <alpha-value>)',
          sidebar: 'rgb(var(--claude-sidebar) / <alpha-value>)',
          'sidebar-hover': 'rgb(var(--claude-sidebar-hover) / <alpha-value>)',
          'sidebar-active': 'rgb(var(--claude-sidebar-active) / <alpha-value>)',
          border: 'rgb(var(--claude-border) / <alpha-value>)',
          text: 'rgb(var(--claude-text) / <alpha-value>)',
          muted: 'rgb(var(--claude-muted) / <alpha-value>)',
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
