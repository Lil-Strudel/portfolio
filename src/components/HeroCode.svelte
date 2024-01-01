<script lang="ts">
  import { onMount, onDestroy } from "svelte";

  const parts = [
    {
      text: "const ",
      color: "indigo",
      italic: true,
    },
    {
      text: "welcomeMessage ",
      color: "blue",
      bold: true,
    },
    {
      text: "= ",
      color: "cyan",
    },
    {
      text: '"Hello World"',
      color: "green",
      bold: true,
    },
    {
      text: ";",
      color: "cyan",
    },
    {
      text: " ",
      color: "white",
      break: true,
    },
    {
      text: "const ",
      color: "indigo",
      italic: true,
    },
    {
      text: "welcomeMessage ",
      color: "blue",
      bold: true,
    },
    {
      text: "= ",
      color: "cyan",
    },
    {
      text: '"Hello World"',
      color: "green",
      bold: true,
    },
    {
      text: ";",
      color: "cyan",
    },
  ];

  const partLengthCounts = parts.reduce<number[]>((acc, part, index) => {
    let prev = 0;
    if (index > 0) {
      const newPrev = acc[index - 1];
      if (newPrev) prev = newPrev;
    }

    acc.push(part.text.length + prev);
    return acc;
  }, []);

  const completeString = parts.map((part) => part.text).join("");

  function getPartLength(index: number) {
    if (index < 0) return 0;

    return partLengthCounts[index] ?? 0;
  }

  let charCount = 0;
  let interval: number;

  onMount(() => {
    interval = setInterval(() => {
      charCount++;
      if (charCount === completeString.length) {
        clearInterval(interval);
      }
    }, 75);
  });

  onDestroy(() => {
    clearInterval(interval);
  });
</script>

<code class="font-serif text-white">
  {#each parts as part, i}
    {#if charCount >= getPartLength(i - 1)}
      {#if part.break}<br />{:else}
        <span
          class="text-{part.color}"
          class:italic={part.italic}
          class:font-bold={part.bold}
          >{#if charCount > getPartLength(i)}{part.text}{:else}{part.text.slice(
              0,
              charCount - getPartLength(i - 1),
            )}{/if}</span
        >
      {/if}
    {/if}
  {/each}
</code>
