/** @type {import('tailwindcss').Config} */

const defaultTheme = require("tailwindcss/defaultTheme");

export default {
  darkMode: "class",
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  safelist: [
    "text-blue",
    "text-cyan",
    "text-green",
    "text-indigo",
    "italic",
    "font-bold",
  ],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      black: {
        light: "#292e42",
        DEFAULT: "#222436",
        dark: "#1a1b26",
      },
      white: "#c8d3f5",
      gray: "#828bb8",
      red: "#ff757f",
      orange: "#ff966c",
      yellow: "#ffc777",
      green: "#c3e88d",
      teal: "#4fd6be",
      cyan: "#86e1fc",
      blue: "#82aaff",
      indigo: "#9d6cd8",
      purple: "#c099ff",
      pink: "#fca7ea",
    },
    fontFamily: {
      sans: [
        "Montserrat Variable",
        "Montserrat",
        ...defaultTheme.fontFamily.sans,
      ],
      serif: ["Fira Mono", ...defaultTheme.fontFamily.serif],
    },
    extend: {},
  },
  plugins: [],
};

// Tokyo Night Moon
// local ret = {
//     none = "NONE",
//     bg_dark = "#1e2030", --
//     bg = "#222436", --
//     bg_highlight = "#2f334d", --
//     terminal_black = "#444a73", --
//     fg = "#c8d3f5", --
//     fg_dark = "#828bb8", --
//     fg_gutter = "#3b4261",
//     dark3 = "#545c7e",
//     comment = "#7a88cf", --
//     dark5 = "#737aa2",
//     blue0 = "#3e68d7", --
//     blue = "#82aaff", --
//     cyan = "#86e1fc", --
//     blue1 = "#65bcff", --
//     blue2 = "#0db9d7",
//     blue5 = "#89ddff",
//     blue6 = "#b4f9f8", --
//     blue7 = "#394b70",
//     purple = "#fca7ea", --
//     magenta2 = "#ff007c",
//     magenta = "#c099ff", --
//     orange = "#ff966c", --
//     yellow = "#ffc777", --
//     green = "#c3e88d", --
//     green1 = "#4fd6be", --
//     green2 = "#41a6b5",
//     teal = "#4fd6be", --
//     red = "#ff757f", --
//     red1 = "#c53b53", --
//   }
//   ret.comment = util.blend(ret.comment, ret.bg, "bb")
//   ret.git = {
//     change = util.blend(ret.blue, ret.bg, "ee"),
//     add = util.blend(ret.green, ret.bg, "ee"),
//     delete = util.blend(ret.red, ret.bg, "dd"),
//   }
//   ret.gitSigns = {
//     change = util.blend(ret.blue, ret.bg, "66"),
//     add = util.blend(ret.green, ret.bg, "66"),
//     delete = util.blend(ret.red, ret.bg, "aa"),
//   }

// Tokyo Night Night
// M.default = {
//   none = "NONE",
//   bg_dark = "#16161e",
//   bg = "#1a1b26",
//   bg_highlight = "#292e42",
//   terminal_black = "#414868",
//   fg = "#c0caf5",
//   fg_dark = "#a9b1d6",
//   fg_gutter = "#3b4261",
//   dark3 = "#545c7e",
//   comment = "#565f89",
//   dark5 = "#737aa2",
//   blue0 = "#3d59a1",
//   blue = "#7aa2f7",
//   cyan = "#7dcfff",
//   blue1 = "#2ac3de",
//   blue2 = "#0db9d7",
//   blue5 = "#89ddff",
//   blue6 = "#b4f9f8",
//   blue7 = "#394b70",
//   magenta = "#bb9af7",
//   magenta2 = "#ff007c",
//   purple = "#9d7cd8",
//   orange = "#ff9e64",
//   yellow = "#e0af68",
//   green = "#9ece6a",
//   green1 = "#73daca",
//   green2 = "#41a6b5",
//   teal = "#1abc9c",
//   red = "#f7768e",
//   red1 = "#db4b4b",
//   git = { change = "#6183bb", add = "#449dab", delete = "#914c54" },
//   gitSigns = {
//     add = "#266d6a",
//     change = "#536c9e",
//     delete = "#b2555b",
//   },
// }
