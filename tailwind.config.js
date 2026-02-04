/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      screens: {
        // Viewport width breakpoints (industry standard)
        xs: '375px',           // phone portrait
        headerNarrow: '360px', // set ID in dropdown (last to hide)
        headerMid: '480px',    // percentile visible (progress bar hidden below headerWide)
        headerWide: '640px',   // progress bar visible (phone landscape / small tablet)
      },
      colors: {
        gray: {
          900: '#121212',
          800: '#1E1E1E',
          700: '#2C2C2C',
          600: '#3D3D3D',
        },
        primary: {
          500: '#3B82F6', // TCG Pocket Blue
          600: '#2563EB',
        },
        accent: {
          500: '#F43F5E', // Rose/Red for alerts or remove
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 3s linear infinite',
      }
    }
  },
  plugins: [],
}
