/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        sentry: {
          purple: '#362d59',
          pink: '#e1567c',
          orange: '#f2583e',
          yellow: '#ffc227',
        }
      }
    },
  },
  plugins: [],
}