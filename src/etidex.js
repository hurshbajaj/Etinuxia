import { createPixelBlast } from "./pixel-blast.js";
import { coverWithPixels, revealFromPixels } from "./pixel-transition.js";

const FRAME_MS = 220;
const BATCH_SIZE = 16;

const bgContainer = document.querySelector("[data-pixel-blast]");
createPixelBlast(bgContainer, {
  color: "#ffffff",
  pixelSize: 4,
  patternScale: 3,
  patternDensity: 1,
  edgeFade: 0.4,
  speed: 0.5,
});

if (sessionStorage.getItem("etidex:enter") === "pixel") {
  sessionStorage.removeItem("etidex:enter");
  revealFromPixels();
}

document.querySelector("[data-etidex-back]").addEventListener("click", async () => {
  await coverWithPixels();
  sessionStorage.setItem("etinuxia:return", "bestiary");
  window.location.href = "index.html";
});

const grid = document.querySelector("[data-grid]");
const cardsEl = document.querySelector("[data-cards]");
const sentinel = document.querySelector("[data-sentinel]");
const searchInput = document.querySelector("[data-search]");
const filtersBtn = document.querySelector("[data-filters-btn]");
const filtersPop = document.querySelector("[data-filters-pop]");
const filtersClear = document.querySelector("[data-filters-clear]");
const powerRange = document.querySelector("[data-power-range]");
const powerValue = document.querySelector("[data-power-value]");

const state = {
  query: "",
  regions: new Set(),
  elements: new Set(),
  classes: new Set(),
  minPower: 0,
};

let beasts = [];
let queue = [];
let pass = 0;

function shuffled(list) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function randomIndex() {
  return String(Math.floor(Math.random() * 100000)).padStart(5, "0");
}

// --- per-card sprite animation: only ticks for cards in view, hovered card
// stays at full framerate, other visible cards run at half framerate ---

const visibleSprites = new Set();
let hoveredSprite = null;
let tick = 0;

const spriteObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      visibleSprites.add(entry.target);
    } else {
      visibleSprites.delete(entry.target);
    }
  });
}, { root: grid, rootMargin: "80px" });

function stepSprite(sprite) {
  const next = (Number(sprite.dataset.frame) + 1) % 4;
  sprite.dataset.frame = String(next);
  sprite.style.setProperty("--frame", next);
}

setInterval(() => {
  tick += 1;
  visibleSprites.forEach((sprite) => {
    if (sprite === hoveredSprite || tick % 2 === 0) {
      stepSprite(sprite);
    }
  });
}, FRAME_MS);

grid.addEventListener("pointerover", (event) => {
  const card = event.target.closest(".etidex-card");
  if (card) {
    hoveredSprite = card.querySelector(".etidex-card__sprite");
  }
});

grid.addEventListener("pointerout", (event) => {
  const card = event.target.closest(".etidex-card");
  if (card && hoveredSprite === card.querySelector(".etidex-card__sprite")) {
    hoveredSprite = null;
  }
});

function cardFor(beast) {
  const card = document.createElement("article");
  card.className = "etidex-card";
  card.tabIndex = 0;

  const sprite = document.createElement("div");
  sprite.className = "etidex-card__sprite";
  const col = (beast.sprite % 4) * 4;
  const row = Math.floor(beast.sprite / 4);
  sprite.style.setProperty("--sp-col", col);
  sprite.style.setProperty("--sp-row", row);
  sprite.style.setProperty("--frame", 0);
  sprite.dataset.frame = "0";

  const name = document.createElement("p");
  name.className = "etidex-card__name";
  name.textContent = beast.name;

  const index = document.createElement("p");
  index.className = "etidex-card__index";
  index.textContent = `#${beast._dup ? randomIndex() : beast.index}`;

  card.append(sprite, name, index);
  spriteObserver.observe(sprite);
  return card;
}

function isFiltering() {
  return Boolean(
    state.query ||
    state.regions.size ||
    state.elements.size ||
    state.classes.size ||
    state.minPower > 0
  );
}

function matches(beast) {
  if (state.query && !beast.name.toLowerCase().includes(state.query)) {
    return false;
  }
  if (state.regions.size && !state.regions.has(beast.region)) {
    return false;
  }
  if (state.elements.size && !state.elements.has(beast.element)) {
    return false;
  }
  if (state.classes.size && !state.classes.has(beast.class)) {
    return false;
  }
  if (beast.power < state.minPower) {
    return false;
  }
  return true;
}

function nextBatch(count) {
  if (!beasts.length) {
    return [];
  }
  while (queue.length < count) {
    const tagged = shuffled(beasts).map((beast) => ({ ...beast, _dup: pass > 0 }));
    queue = queue.concat(tagged);
    pass += 1;
  }
  return queue.splice(0, count);
}

function appendCards(list) {
  const fragment = document.createDocumentFragment();
  list.forEach((beast) => fragment.appendChild(cardFor(beast)));
  cardsEl.appendChild(fragment);
}

function renderInfinite(reset) {
  if (reset) {
    visibleSprites.clear();
    hoveredSprite = null;
    cardsEl.replaceChildren();
    queue = [];
    pass = 0;
  }
  appendCards(nextBatch(BATCH_SIZE));
}

function renderFiltered() {
  visibleSprites.clear();
  hoveredSprite = null;
  cardsEl.replaceChildren();
  const results = beasts.filter(matches);
  if (!results.length) {
    const empty = document.createElement("p");
    empty.className = "etidex-grid__empty";
    empty.textContent = "No beasts match those filters.";
    cardsEl.appendChild(empty);
    return;
  }
  appendCards(results);
}

function render(reset = true) {
  if (isFiltering()) {
    renderFiltered();
  } else {
    renderInfinite(reset);
  }
}

const sentinelObserver = new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting && beasts.length && !isFiltering()) {
    renderInfinite(false);
  }
}, { root: grid, rootMargin: "600px" });
sentinelObserver.observe(sentinel);

searchInput.addEventListener("input", () => {
  state.query = searchInput.value.trim().toLowerCase();
  render();
});

searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    state.query = searchInput.value.trim().toLowerCase();
    render();
    searchInput.blur();
  }
});

function uniqueValues(key) {
  return [...new Set(beasts.map((beast) => beast[key]))].sort();
}

function buildChips(key, set) {
  const container = document.querySelector(`[data-chips="${key}"]`);
  container.replaceChildren();
  uniqueValues(key).forEach((value) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "etidex-chip";
    chip.textContent = value;
    chip.addEventListener("click", () => {
      if (set.has(value)) {
        set.delete(value);
        chip.classList.remove("is-active");
      } else {
        set.add(value);
        chip.classList.add("is-active");
      }
      render();
    });
    container.appendChild(chip);
  });
}

function setPower(value) {
  state.minPower = value;
  powerRange.value = value;
  powerValue.textContent = `${value}+`;
  powerRange.style.setProperty("--fill", `${(value / 99) * 100}%`);
}

powerRange.addEventListener("input", () => {
  setPower(Number(powerRange.value));
  render();
});

function positionFilters() {
  const rect = filtersBtn.getBoundingClientRect();
  filtersPop.style.top = `${rect.bottom + 10}px`;
  filtersPop.style.right = `${window.innerWidth - rect.right}px`;
}

function openFilters() {
  positionFilters();
  filtersPop.hidden = false;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => filtersPop.classList.add("is-open"));
  });
  filtersBtn.setAttribute("aria-expanded", "true");
}

function closeFilters() {
  filtersPop.classList.remove("is-open");
  filtersBtn.setAttribute("aria-expanded", "false");
  filtersPop.addEventListener("transitionend", () => {
    if (!filtersPop.classList.contains("is-open")) {
      filtersPop.hidden = true;
    }
  }, { once: true });
}

filtersBtn.addEventListener("click", () => {
  if (filtersPop.classList.contains("is-open")) {
    closeFilters();
  } else {
    openFilters();
  }
});

document.addEventListener("click", (event) => {
  if (
    filtersPop.classList.contains("is-open") &&
    !event.target.closest(".etidex-filters") &&
    !event.target.closest("[data-filters-pop]")
  ) {
    closeFilters();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && filtersPop.classList.contains("is-open")) {
    closeFilters();
  }
});

window.addEventListener("resize", () => {
  if (filtersPop.classList.contains("is-open")) {
    positionFilters();
  }
});

filtersClear.addEventListener("click", () => {
  state.regions.clear();
  state.elements.clear();
  state.classes.clear();
  state.query = "";
  searchInput.value = "";
  setPower(0);
  document.querySelectorAll(".etidex-chip.is-active").forEach((chip) => chip.classList.remove("is-active"));
  render();
});

document.querySelectorAll("[data-view-mode]").forEach((btn) => {
  btn.addEventListener("click", () => closeFilters());
});

fetch("src/data/beasts.json")
  .then((response) => response.json())
  .then((data) => {
    beasts = data;
    buildChips("region", state.regions);
    buildChips("element", state.elements);
    buildChips("class", state.classes);
    render(true);
  });
