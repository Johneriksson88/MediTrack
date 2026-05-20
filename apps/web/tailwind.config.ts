import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

/**
 * shadcn new-york + slate preset, CSS-variable bound per UI-SPEC.
 *
 * Colors live as `hsl(var(--xxx))` so shadcn primitives consume them
 * directly. The actual hex values are pinned in `src/index.css` and
 * are the locked palette from UI-SPEC §Color:
 *
 *   background       #F8FAFC   (dominant surface, 60%)
 *   foreground       #0F172A   (primary text)
 *   muted            #F1F5F9   (secondary surface, 30%)
 *   muted-foreground #475569   (secondary text)
 *   border           #E2E8F0   (dividers / outlines)
 *   primary          #2563EB   (accent, 10% — reserved per UI-SPEC)
 *   destructive      #DC2626   (logout, errors only)
 *   card             #FFFFFF   (login card, empty state)
 */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [animate],
} satisfies Config;
