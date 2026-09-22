import { eraseFrom, pause, setWords, typeInto } from "./text.js";

const TYPE_MS = 34;
const ERASE_MS = 13;

export class Copy {
  #token = { cancelled: true };

  constructor(root, { reducedMotion }) {
    this.root = root;
    this.title = root.querySelector("[data-copy-title]");
    this.facts = root.querySelector("[data-copy-facts]");
    this.body = root.querySelector("[data-copy-body]");
    this.back = root.querySelector("[data-copy-back]");
    this.etidex = root.querySelector("[data-copy-etidex]");
    this.atlasLink = root.querySelector("[data-copy-atlas]");
    this.motion = reducedMotion ? 0 : 1;
    this.entry = null;
  }

  hide() {
    this.#begin();
    this.entry = null;
    this.root.classList.add("is-hidden");
  }

  async showHold(hold) {
    const token = this.#begin();
    this.entry = null;
    this.#clear();
    this.root.classList.toggle("is-hero", Boolean(hold.hero));
    this.root.classList.remove("is-hidden");
    await typeInto(this.title, hold.title, { delay: TYPE_MS * this.motion, token });
    if (!token.cancelled) {
      this.#reveal(hold.lede);
      this.etidex.hidden = hold.id !== "bestiary";
      this.atlasLink.hidden = hold.id !== "atlas";
    }
  }

  async openEntry(entry, hold) {
    const token = this.#begin();
    this.entry = entry;
    this.body.classList.remove("is-revealed");
    await pause(180 * this.motion);
    await eraseFrom(this.title, { delay: ERASE_MS * this.motion, token });
    if (token.cancelled) {
      return;
    }
    this.root.classList.remove("is-hero");
    this.etidex.hidden = true;
    this.atlasLink.hidden = true;
    this.#fillFacts(entry.facts);
    this.back.textContent = `Back to ${hold.title}`;
    await typeInto(this.title, entry.title, { delay: TYPE_MS * this.motion, token });
    if (token.cancelled) {
      return;
    }
    this.facts.classList.add("is-shown");
    this.#reveal(entry.body);
    this.back.hidden = false;
    this.title.focus({ preventScroll: true });
  }

  async closeEntry(hold) {
    const token = this.#begin();
    this.entry = null;
    this.back.hidden = true;
    this.facts.classList.remove("is-shown");
    this.body.classList.remove("is-revealed");
    await pause(200 * this.motion);
    await eraseFrom(this.title, { delay: ERASE_MS * this.motion, token });
    if (token.cancelled) {
      return;
    }
    this.facts.replaceChildren();
    this.root.classList.toggle("is-hero", Boolean(hold.hero));
    await typeInto(this.title, hold.title, { delay: TYPE_MS * this.motion, token });
    if (!token.cancelled) {
      this.#reveal(hold.lede);
      this.etidex.hidden = hold.id !== "bestiary";
      this.atlasLink.hidden = hold.id !== "atlas";
    }
  }

  #begin() {
    this.#token.cancelled = true;
    this.#token = { cancelled: false };
    return this.#token;
  }

  #clear() {
    this.title.textContent = "";
    this.facts.replaceChildren();
    this.facts.classList.remove("is-shown");
    this.body.replaceChildren();
    this.body.classList.remove("is-revealed");
    this.back.hidden = true;
    this.etidex.hidden = true;
    this.atlasLink.hidden = true;
  }

  #fillFacts(facts) {
    this.facts.classList.remove("is-shown");
    this.facts.replaceChildren(...facts.flatMap(([term, detail]) => {
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = term;
      dd.textContent = detail;
      return [dt, dd];
    }));
  }

  #reveal(text) {
    setWords(this.body, text);
    requestAnimationFrame(() => requestAnimationFrame(() => this.body.classList.add("is-revealed")));
  }
}
