/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        hex: {
          unknown: '#1a1a2e',
          explored: '#2d3561',
          known: '#4a4e69',
        },
      },
    },
  },
  plugins: [],
}
