/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}', './index.html'],
  theme: {
    extend: {
      colors: {
        claude: {
          orange: 'rgb(var(--claude-orange) / <alpha-value>)',
          bg: 'rgb(var(--claude-bg) / <alpha-value>)',
          'chat-bg': 'rgb(var(--claude-chat-bg) / <alpha-value>)',
          panel: 'rgb(var(--claude-panel) / <alpha-value>)',
          surface: 'rgb(var(--claude-surface) / <alpha-value>)',
          'surface-2': 'rgb(var(--claude-surface-2) / <alpha-value>)',
          'user-bubble': 'rgb(var(--claude-user-bubble) / <alpha-value>)',
          'user-bubble-border': 'rgb(var(--claude-user-bubble-border) / <alpha-value>)',
          'assistant-bubble': 'rgb(var(--claude-assistant-bubble) / <alpha-value>)',
          'assistant-bubble-border': 'rgb(var(--claude-assistant-bubble-border) / <alpha-value>)',
          sidebar: 'rgb(var(--claude-sidebar) / <alpha-value>)',
          'sidebar-hover': 'rgb(var(--claude-sidebar-hover) / <alpha-value>)',
          'sidebar-active': 'rgb(var(--claude-sidebar-active) / <alpha-value>)',
          border: 'rgb(var(--claude-border) / <alpha-value>)',
          text: 'rgb(var(--claude-text) / <alpha-value>)',
          muted: 'rgb(var(--claude-muted) / <alpha-value>)',
        }
      },
      borderRadius: {
        sm: '1px',
        DEFAULT: '2px',
        md: '3px',
        lg: '4px',
        xl: '6px',
        '2xl': '8px',
        '3xl': '12px',
        full: '9999px',
      },
      fontFamily: {
        sans: ['"SF Pro Display"', 'Pretendard Variable', 'Pretendard', '"Apple SD Gothic Neo"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace']
      }
    }
  },
  plugins: [require('@tailwindcss/typography')]
}
