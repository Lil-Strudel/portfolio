const sequence = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

export function onKonami(unlock: () => void) {
  let recent: string[] = [];

  const onKeyUp = (event: KeyboardEvent) => {
    recent = [...recent, event.key].slice(-sequence.length);

    if (recent.join() === sequence.join()) {
      recent = [];
      unlock();
    }
  };

  document.addEventListener("keyup", onKeyUp);
  return () => document.removeEventListener("keyup", onKeyUp);
}
