import forms from '@tailwindcss/forms';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Manrope Variable"', 'Manrope', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Bleu cobalt : couleur primaire unique de TeamTrack
        brand: {
          50: '#F0F4FF',
          100: '#E1E9FF',
          200: '#C5D4FE',
          300: '#9AB4FB',
          400: '#678BF5',
          500: '#3E64EB',
          600: '#2449D8',
          700: '#1C39B4',
          800: '#1C3290',
          900: '#1B2C6E',
          950: '#111B44',
        },
        // Neutres légèrement bleutés
        ink: {
          50: '#F5F7FB',
          100: '#EBEEF5',
          200: '#DCE1EC',
          300: '#C2C9D8',
          400: '#8F99AF',
          500: '#667089',
          600: '#4B546B',
          700: '#363E52',
          800: '#232A3B',
          900: '#151B2B',
        },
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        card: '0 1px 2px rgba(17, 27, 68, 0.06)',
        lift: '0 12px 32px -12px rgba(17, 27, 68, 0.28)',
      },
      keyframes: {
        'slide-in': { from: { transform: 'translateX(24px)', opacity: '0' }, to: { transform: 'none', opacity: '1' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pop-in': { from: { transform: 'translateY(6px) scale(.98)', opacity: '0' }, to: { transform: 'none', opacity: '1' } },
      },
      animation: {
        'slide-in': 'slide-in .22s ease-out',
        'fade-in': 'fade-in .18s ease-out',
        'pop-in': 'pop-in .18s ease-out',
      },
    },
  },
  plugins: [forms],
};
