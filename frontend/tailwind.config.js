/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        dark: {
          900: "#0a0e1a",
          800: "#0f1629",
          700: "#162035",
          600: "#1e2d45",
        },
        accent: {
          blue: "#3b82f6",
          green: "#10b981",
          red: "#ef4444",
          yellow: "#f59e0b",
          purple: "#8b5cf6",
        },
      },
    },
  },
  plugins: [],
};
