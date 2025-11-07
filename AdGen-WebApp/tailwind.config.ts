import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: '#007acc',
          gray1: '#3e3e42',
          gray2: '#2d2d30',
          gray3: '#252526',
          gray4: '#1e1e1e'
        }
      },
      boxShadow: {
        glow: '0 0 0 2px rgba(0,122,204,0.25), 0 10px 30px rgba(0,0,0,0.45)'
      },
      backgroundImage: {
        grid: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)'
      }
    }
  },
  plugins: []
};

export default config;


