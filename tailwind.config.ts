import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#101820",
        mist: "#f6f8f9",
        line: "#dce3e7",
        signal: "#0f766e",
        ember: "#c2410c"
      },
      boxShadow: { soft: "0 18px 50px rgba(16, 24, 32, 0.08)" }
    }
  },
  plugins: []
};

export default config;
