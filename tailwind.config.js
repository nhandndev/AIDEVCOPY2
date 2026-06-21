/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'cyber-slate': '#1e293b',
        'neon-cyan': '#22d3ee',
      }
    },
  },
  plugins: [],
}
