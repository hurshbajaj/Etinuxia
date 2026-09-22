export const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function typeInto(element, text, { delay, token }) {
  element.textContent = "";
  if (!delay) {
    element.textContent = text;
    return;
  }
  element.classList.add("is-typing");
  for (const character of text) {
    if (token.cancelled) {
      break;
    }
    element.textContent += character;
    await pause(delay);
  }
  element.classList.remove("is-typing");
}

export async function eraseFrom(element, { delay, token }) {
  if (!delay) {
    element.textContent = "";
    return;
  }
  element.classList.add("is-typing");
  while (element.textContent.length > 0 && !token.cancelled) {
    element.textContent = element.textContent.slice(0, -1);
    await pause(delay);
  }
  element.classList.remove("is-typing");
}

export function setWords(element, text) {
  element.classList.remove("is-revealed");
  let index = 0;
  const nodes = text.split(/(\s+)/).filter(Boolean).map((part) => {
    if (/^\s+$/.test(part)) {
      return document.createTextNode(part);
    }
    const word = document.createElement("span");
    word.className = "copy__word";
    word.style.setProperty("--i", index);
    word.textContent = part;
    index += 1;
    return word;
  });
  element.replaceChildren(...nodes);
}
