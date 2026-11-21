// Design tokens — single source of truth for color, spacing, typography.
// Consumed by app.css (via @import) and Svelte components (via import).
// Keep in sync with CSS custom properties in src/renderer/src/app.css.

export const tokens = {
  color: {
    // Base palette (HSL values matching CSS custom properties)
    background: '224 14% 4%',
    foreground: '210 16% 96%',
    card: '224 14% 7%',
    'card-foreground': '210 16% 96%',
    border: '224 10% 17%',
    input: '224 10% 17%',
    primary: '213 93% 63%',
    'primary-foreground': '0 0% 100%',
    secondary: '224 10% 13%',
    'secondary-foreground': '210 16% 96%',
    muted: '224 10% 13%',
    'muted-foreground': '220 9% 58%',
    accent: '224 10% 13%',
    'accent-foreground': '210 16% 96%',
    destructive: '0 82% 62%',
    'destructive-foreground': '0 0% 100%',
    ring: '213 93% 63%',
    // Status tokens (for confirm dialogs, toasts, badges)
    'status-ok': '142 71% 45%',
    'status-warn': '38 92% 50%',
    'status-fail': '0 82% 62%',
  } as const,

  spacing: {
    // 4px base unit scale
    'space-0': '0',
    'space-1': '0.25rem', // 4px
    'space-2': '0.5rem', // 8px
    'space-3': '0.75rem', // 12px
    'space-4': '1rem', // 16px
    'space-5': '1.25rem', // 20px
    'space-6': '1.5rem', // 24px
    'space-8': '2rem', // 32px
    'space-10': '2.5rem', // 40px
    'space-12': '3rem', // 48px
    'space-16': '4rem', // 64px
  } as const,

  typography: {
    // Font families
    fontSans: "'Inter', system-ui, -apple-system, sans-serif",
    fontMono: "'JetBrains Mono', 'Fira Code', monospace",

    // Font sizes (rem, line-height)
    'text-xs': ['0.75rem', { lineHeight: '1rem' }],
    'text-sm': ['0.875rem', { lineHeight: '1.25rem' }],
    'text-base': ['1rem', { lineHeight: '1.5rem' }],
    'text-lg': ['1.125rem', { lineHeight: '1.75rem' }],
    'text-xl': ['1.25rem', { lineHeight: '1.75rem' }],
    'text-2xl': ['1.5rem', { lineHeight: '2rem' }],
    'text-3xl': ['1.875rem', { lineHeight: '2.25rem' }],
    'text-4xl': ['2.25rem', { lineHeight: '2.5rem' }],

    // Font weights
    fontNormal: '400',
    fontMedium: '500',
    fontSemibold: '600',
    fontBold: '700',
  } as const,

  // Border radius scale
  radius: {
    none: '0',
    sm: '0.25rem',
    DEFAULT: '0.375rem',
    md: '0.5rem',
    lg: '0.75rem',
    xl: '1rem',
    '2xl': '1.5rem',
    full: '9999px',
  } as const,

  // Shadows
  shadow: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
  } as const,

  // Transitions
  transition: {
    fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    DEFAULT: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
  } as const,

  // Z-index scale
  zIndex: {
    hide: -1,
    base: 0,
    dropdown: 100,
    sticky: 200,
    overlay: 300,
    modal: 400,
    popover: 500,
    tooltip: 600,
    toast: 700,
  } as const,
} as const

export type Tokens = typeof tokens

// CSS variable name helpers
export function cssVar(path: string): string {
  return `var(--${path.replace(/\./g, '-')})`
}

// Type-safe token access
export function getToken<T extends keyof Tokens>(category: T, key: keyof Tokens[T]): Tokens[T][keyof Tokens[T]] {
  return tokens[category][key]
}