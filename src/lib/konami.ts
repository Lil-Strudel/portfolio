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

  const onKeyUp = ({ key }: KeyboardEvent) => {
    recent = [...recent, key].slice(-sequence.length);

    if (recent.join() === sequence.join()) {
      recent = [];
      unlock();
    }
  };

  addEventListener("keyup", onKeyUp);
  return () => removeEventListener("keyup", onKeyUp);
}
