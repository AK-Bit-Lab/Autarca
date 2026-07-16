import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        autarca: {
          bg: "#0b0e14",
          panel: "#121826",
          accent: "#5eead4",
          warn: "#facc15",
          danger: "#f87171",
        },
      },
    },
  },
  plugins: [],
};
export default config;
