# lilstrudel.io

My portfolio and blog: projects, a homelab, Go, and the nerdy parts in between.

Built with [Astro](https://astro.build) 7, [Svelte](https://svelte.dev) 5 and [Tailwind CSS](https://tailwindcss.com) 4, themed in [Kanagawa](https://github.com/rebelot/kanagawa.nvim): Dragon for dark mode and Lotus for light, so the site matches my terminal.

## Getting started

Requires Node 22.12 or newer.

```sh
npm install
npm run dev
```

The dev server runs at `localhost:4321`.

| Command           | What it does                                         |
| :---------------- | :--------------------------------------------------- |
| `npm run dev`     | Start the dev server with hot reload                 |
| `npm run build`   | Type-check with `astro check`, then build to `dist/` |
| `npm run preview` | Serve the production build locally                   |
| `npm run check`   | Type-check only                                      |
| `npm run format`  | Format everything with Prettier                      |

## Layout

```text
src/
├── components/       Header, Footer, ProjectCard, PostList, HeroCode.svelte
├── content/blog/     Blog posts, one Markdown file each
├── content.config.ts Frontmatter schema for posts
├── data/             Site metadata and the projects list
├── layouts/Base.astro  <head>, theme bootstrapping, header and footer
├── lib/              Post helpers and the Konami listener
├── pages/            Routes, plus rss.xml.ts
└── styles/global.css Tailwind setup, Kanagawa tokens, prose styles
```

## Writing a post

Add a Markdown file to `src/content/blog/`. The filename becomes the URL, so `my-post.md` is served at `/blog/my-post`.

```yaml
---
title: "The title"
description: "One or two sentences for the post list, RSS and link previews."
published: 2026-10-04
tags: [kubernetes, go]
repo: https://github.com/Lil-Strudel/some-repo # optional
draft: true # optional; drafts show in dev and are left out of builds
---
```

Posts with more than two `##` headings get a table of contents automatically. Code blocks are highlighted at build time by Shiki in both Kanagawa themes, so they follow the light/dark toggle.

To feature a post on a project card, set `post` to the post's filename in `src/data/projects.ts`.

## Theming

Every color is a CSS variable in `src/styles/global.css`, redefined under `[data-theme="dark"]` and exposed to Tailwind as `bg-bg`, `text-fg`, `text-blue` and so on. Components never need `dark:` variants. To change the palette, edit those two blocks.

The theme follows the system preference until someone clicks the toggle, after which their choice is kept in `localStorage`.

## The hero

The code in the home page's editor window is the real source of `src/lib/konami.ts`, highlighted at build time and typed out by `HeroCode.svelte`. It's also the code that runs, so try the Konami code on the home page.

## Deploying

`npm run build` produces a fully static site in `dist/` with a sitemap and RSS feed. Set the production URL in `astro.config.mjs` (`site`) so canonical links, the sitemap and RSS point at the right domain.
