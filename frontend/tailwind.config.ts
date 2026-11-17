import type { Config } from 'tailwindcss';

/**
 * FinanceHub palette — one graphite ramp for surfaces, one brass accent.
 *
 * The `gray` and `blue` scales are mapped onto the design tokens so every
 * existing utility (text-gray-400, bg-blue-600/20, border-gray-700 …) picks
 * up the ledger palette without per-page edits:
 *
 *   gray  → graphite: 950 sidebar · 900 page/input · 800 raised · 700 hairline
 *           600 hover border · 500 muted · 400 secondary · 100 primary text
 *   blue  → brass accent: 400 links/selection · 500 fills/borders · 600 deep
 *
 * Semantic ramps are toned down so they sit inside the same palette.
 */
const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Graphite neutral ramp (surfaces, borders, text)
        gray: {
          50: '#f5f4f2',
          100: '#ededed',
          200: '#d7d6d3',
          300: '#b7b5b1',
          400: '#a1a1a6',
          500: '#85858b',
          600: '#6e6e73',
          700: '#34343a',
          800: '#26262a',
          900: '#141415',
          950: '#0f0f10',
        },
        // Brass accent — links, selection, the forecast line
        blue: {
          50: '#fbf6ea',
          100: '#f6ecd4',
          200: '#f0e0b6',
          300: '#e9d099',
          400: '#e0b463',
          500: '#cfa048',
          600: '#a37a33',
          700: '#85611f',
          800: '#63481a',
          900: '#423011',
          950: '#241a0a',
        },
        // Same accent kept under the `primary` name used by older utilities
        primary: {
          50: '#fbf6ea',
          100: '#f6ecd4',
          200: '#f0e0b6',
          300: '#e9d099',
          400: '#e0b463',
          500: '#cfa048',
          600: '#a37a33',
          700: '#85611f',
          800: '#63481a',
          900: '#423011',
          950: '#241a0a',
        },
        // Semantic — positive
        emerald: {
          200: '#b8ecd4',
          300: '#7fddb4',
          400: '#4cc38a',
          500: '#2fa875',
          600: '#157a52',
        },
        green: {
          200: '#b8ecd4',
          300: '#7fddb4',
          400: '#4cc38a',
          500: '#2fa875',
          600: '#157a52',
        },
        // Semantic — negative
        red: {
          200: '#f7c8ca',
          300: '#f09598',
          400: '#e5484d',
          500: '#cf3b40',
          600: '#b02f34',
          700: '#8f2429',
        },
        rose: {
          200: '#f7c8ca',
          300: '#f09598',
          400: '#e5484d',
          500: '#cf3b40',
          600: '#b02f34',
        },
        // Semantic — warning (burnt ochre, deliberately away from brass)
        amber: {
          300: '#e8a866',
          400: '#d98f3f',
          500: '#c2762a',
          600: '#a35f1f',
        },
        yellow: {
          300: '#e8b85c',
          400: '#d9a33f',
          500: '#c2852c',
          600: '#a36c22',
        },
        orange: {
          300: '#e8975c',
          400: '#d97a35',
          500: '#c2622a',
          600: '#a34f22',
        },
        finance: {
          green: '#4cc38a',
          red: '#e5484d',
          yellow: '#d98f3f',
          blue: '#e0b463',
          purple: '#a78bfa',
          teal: '#4cc38a',
        },
      },
      fontFamily: {
        sans: ['Tajawal', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      // One easing curve across the whole interface
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
