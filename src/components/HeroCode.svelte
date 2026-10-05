<script lang="ts">
  import { onMount } from "svelte";
  import { onKonami } from "../lib/konami";

  interface Token {
    content: string;
    color?: string | undefined;
    italic: boolean;
  }

  interface Props {
    lines: Token[][];
  }

  const MS_PER_KEYSTROKE = 24;
  const MS_PER_NEWLINE = 140;

  let { lines }: Props = $props();

  const lineStarts = $derived(
    lines.reduce<number[]>((starts, line, i) => {
      const previous =
        i === 0 ? 0 : starts[i - 1]! + lineLength(lines[i - 1]!) + 1;
      starts.push(previous);
      return starts;
    }, []),
  );
  const totalChars = $derived(lineStarts.at(-1)! + lineLength(lines.at(-1)!));

  const text = $derived(
    lines.map((line) => line.map((token) => token.content).join("")).join("\n"),
  );

  // Indentation appears instantly, the way an editor auto-indents.
  const typedAt = $derived.by(() => {
    let elapsed = 0;
    let indenting = true;
    return text.split("").map((char) => {
      if (char === "\n") {
        indenting = true;
        elapsed += MS_PER_NEWLINE;
      } else if (!(indenting && char === " ")) {
        indenting = false;
        elapsed += MS_PER_KEYSTROKE;
      }
      return elapsed;
    });
  });

  let typed = $state(0);
  let unlocked = $state(false);
  const done = $derived(typed >= totalChars);

  function lineLength(line: Token[]) {
    return line.reduce((sum, token) => sum + token.content.length, 0);
  }

  function tokenStart(lineIndex: number, tokenIndex: number) {
    let start = lineStarts[lineIndex]!;
    for (let i = 0; i < tokenIndex; i++) {
      start += lines[lineIndex]![i]!.content.length;
    }
    return start;
  }

  function caretIn(start: number, length: number) {
    return !done && typed >= start && typed < start + length;
  }

  onMount(() => {
    const stopListening = onKonami(() => {
      unlocked = !unlocked;
      document.documentElement.toggleAttribute("data-konami", unlocked);
    });

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      typed = totalChars;
      return stopListening;
    }

    const startedAt = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      let next = typed;
      while (next < totalChars && typedAt[next]! <= now - startedAt) next++;
      typed = next;
      if (!done) frame = requestAnimationFrame(tick);
    });

    return () => {
      cancelAnimationFrame(frame);
      stopListening();
    };
  });
</script>

{#snippet caret()}<span
    class="caret absolute -ml-px inline-block h-5 w-[2px] translate-y-0.5 bg-editor-fg"
    aria-hidden="true"
  ></span>{/snippet}

<div class="hero-code" aria-label="Source of konami.ts">
  <pre
    class="px-5 py-4 font-mono text-[0.8rem] leading-6 text-editor-fg sm:text-sm lg:text-[0.8rem]"><code
      >{#each lines as line, l}{@const lineEnd =
          lineStarts[l]! + lineLength(line)}<span class="flex"
          ><span
            class="mr-5 w-6 shrink-0 select-none text-right text-editor-gutter"
            aria-hidden="true">{l + 1}</span
          ><span class="min-w-0 wrap-anywhere whitespace-pre-wrap"
            >{#each line as token, t}{@const start = tokenStart(
                l,
                t,
              )}{@const visible = Math.max(0, typed - start)}<span
                style:color={token.color}
                class:italic={token.italic}
                >{token.content.slice(
                  0,
                  visible,
                )}{#if caretIn(start, token.content.length)}{@render caret()}{/if}<span
                  class="pending invisible">{token.content.slice(visible)}</span
                ></span
              >{/each}{#if caretIn(lineEnd, 1)}{@render caret()}{/if}</span
          ></span
        >{/each}</code
    ></pre>
  <div
    class="flex items-center justify-between gap-4 border-t border-editor-line bg-editor-bar px-4 py-1.5 font-mono text-[0.7rem] text-editor-gutter"
  >
    <span class={unlocked ? "text-[#d27e99]" : ""}>
      {#if unlocked}-- STRUDEL --{:else if done}-- NORMAL --{:else}-- INSERT --{/if}
    </span>
    <span class="transition-opacity duration-700" class:opacity-0={!done}>
      try it: ↑ ↑ ↓ ↓ ← → ← → b a
    </span>
  </div>
</div>

<style>
  .caret {
    animation: blink 1s steps(1) infinite;
  }

  @keyframes blink {
    50% {
      opacity: 0;
    }
  }
</style>
