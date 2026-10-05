export interface Project {
  name: string;
  summary: string;
  stack: string[];
  repo: string;
  url?: string;
  post?: string;
  featured?: boolean;
}

export const projects: Project[] = [
  {
    name: "homelab",
    summary:
      "Six OptiPlex Micros running Talos Linux and Kubernetes, with Cilium BGP, Rook-Ceph and Flux, plus a MikroTik network managed entirely by Terraform.",
    stack: ["Talos", "Kubernetes", "Cilium", "Rook-Ceph", "Flux", "Terraform"],
    repo: "https://github.com/Lil-Strudel/homelab",
    post: "homelab",
    featured: true,
  },
  {
    name: "discord-audio-streamer",
    summary:
      "A Windows desktop app in Go that pushes a playlist, a soundboard or any audio device into a Discord voice channel through your own bot, end-to-end encrypted with DAVE.",
    stack: ["Go", "cgo", "Wails", "Svelte 5", "libopus", "WASAPI"],
    repo: "https://github.com/Lil-Strudel/discord-audio-streamer",
    post: "discord-audio-pacer",
    featured: true,
  },
  {
    name: ".dotfiles",
    summary:
      "A hand-rolled Arch and Hyprland setup with tmux (zero plugins), zsh (two) and Neovim (twelve, via native vim.pack). Every line had to earn its place.",
    stack: ["Arch", "Hyprland", "Neovim", "zsh", "tmux", "yadm"],
    repo: "https://github.com/Lil-Strudel/.dotfiles",
    post: "dotfiles",
    featured: true,
  },
  {
    name: "glassact-studios",
    summary:
      "A B2B ordering platform for custom stained-glass memorial inlays. A Go API over Postgres and PostGIS, a SolidJS app, and AWS infrastructure in Terraform.",
    stack: ["Go", "PostGIS", "SolidJS", "Terraform", "AWS"],
    repo: "https://github.com/Lil-Strudel/glassact-studios",
    featured: true,
  },
  {
    name: "tsukaiyasui_zmk",
    summary:
      "A ZMK keymap generator in Go with its own lexer and parser. Pick QWERTY or Colemak-DH, a home-row-mod style and a nav layout, and it writes keymaps for the Corne and Lily58.",
    stack: ["Go", "ZMK", "GitHub Actions"],
    repo: "https://github.com/Lil-Strudel/tsukaiyasui_zmk",
  },
  {
    name: "quickbase.ts",
    summary:
      "A small, strongly typed Quickbase client with type-inferred table CRUD and field selection, published on npm.",
    stack: ["TypeScript", "tsup", "Vitest"],
    repo: "https://github.com/Lil-Strudel/quickbase.ts",
    url: "https://www.npmjs.com/package/quickbase.ts",
  },
  {
    name: "choredom",
    summary: "A gamified chores PWA with points, a leaderboard and confetti.",
    stack: ["Next.js", "tRPC", "Drizzle", "NextAuth"],
    repo: "https://github.com/Lil-Strudel/choredom",
    url: "https://choredom.vercel.app",
  },
  {
    name: "ChekkPoint",
    summary:
      "An offline-first sync prototype: Postgres streamed to a SQLite replica in the browser with ElectricSQL and TanStack DB, with writes queued in an outbox until the network comes back.",
    stack: ["TanStack Start", "SolidJS", "ElectricSQL", "Postgres"],
    repo: "https://github.com/Lil-Strudel/ChekkPoint",
  },
];
