/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [require("daisyui")], // MUSS HIER STEHEN!
  daisyui: {
    themes: ["light", "dark", "cupcake"], // MUSS HIER STEHEN!
  },
};
