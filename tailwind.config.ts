import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      typography: {
        DEFAULT: {
          css: {
            maxWidth: 'none',
            a: {
              color: '#2563eb',
              '&:hover': {
                color: '#1e40af',
              },
              textDecoration: 'underline',
            },
          },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}

export default config
