import { createPixelBlast } from "./pixel-blast.js";
import { coverWithPixels, revealFromPixels } from "./pixel-transition.js";
import { pause, typeInto } from "./ui/text.js";

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

const panel = document.querySelector("[data-panel]");
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
  card.beastData = beast;
  spriteObserver.observe(sprite);
  return card;
}

cardsEl.addEventListener("click", (event) => {
  const card = event.target.closest(".etidex-card");
  if (card?.beastData) {
    openDetail(card.beastData, card);
  }
});

cardsEl.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  const card = event.target.closest(".etidex-card");
  if (card?.beastData) {
    event.preventDefault();
    openDetail(card.beastData, card);
  }
});

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

function pool() {
  return isFiltering() ? beasts.filter(matches) : beasts;
}

function nextBatch(count) {
  const source = pool();
  if (!source.length) {
    return [];
  }
  while (queue.length < count) {
    const tagged = shuffled(source).map((beast) => ({ ...beast, _dup: pass > 0 }));
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

function render(reset = true) {
  if (reset) {
    visibleSprites.clear();
    hoveredSprite = null;
    cardsEl.replaceChildren();
    queue = [];
    pass = 0;
  }
  if (!pool().length) {
    const empty = document.createElement("p");
    empty.className = "etidex-grid__empty";
    empty.textContent = "No beasts match those filters.";
    cardsEl.replaceChildren(empty);
    return;
  }
  appendCards(nextBatch(BATCH_SIZE));
  sentinelObserver.unobserve(sentinel);
  sentinelObserver.observe(sentinel);
}

const sentinelObserver = new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting && beasts.length) {
    render(false);
  }
}, { root: grid, rootMargin: "600px" });
sentinelObserver.observe(sentinel);

searchInput.addEventListener("input", () => {
  state.query = searchInput.value.trim().toLowerCase();
  render();
  renderActiveFilters();
});

searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    state.query = searchInput.value.trim().toLowerCase();
    render();
    renderActiveFilters();
    searchInput.blur();
  }
});

function uniqueValues(key) {
  return [...new Set(beasts.map((beast) => beast[key]))].sort();
}

const chipSets = { region: state.regions, element: state.elements, class: state.classes };

function syncChips() {
  document.querySelectorAll(".etidex-chip").forEach((chip) => {
    const set = chipSets[chip.dataset.key];
    chip.classList.toggle("is-active", set.has(chip.dataset.value));
  });
}

function buildChips(key, set) {
  const container = document.querySelector(`[data-chips="${key}"]`);
  container.replaceChildren();
  uniqueValues(key).forEach((value) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "etidex-chip";
    chip.textContent = value;
    chip.dataset.key = key;
    chip.dataset.value = value;
    chip.addEventListener("click", () => {
      if (set.has(value)) {
        set.delete(value);
      } else {
        set.add(value);
      }
      syncChips();
      render();
      renderActiveFilters();
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
  renderActiveFilters();
});

const activeBar = document.querySelector("[data-active]");

function activePill(label, onRemove) {
  const pill = document.createElement("button");
  pill.type = "button";
  pill.className = "etidex-active__pill";
  const text = document.createElement("span");
  text.textContent = label;
  const x = document.createElement("span");
  x.className = "etidex-active__x";
  x.textContent = "×";
  pill.append(text, x);
  pill.addEventListener("click", () => {
    onRemove();
    syncChips();
    render();
    renderActiveFilters();
  });
  return pill;
}

function renderActiveFilters() {
  const pills = [];
  if (state.query) {
    pills.push(activePill(`"${searchInput.value.trim()}"`, () => {
      state.query = "";
      searchInput.value = "";
    }));
  }
  state.regions.forEach((value) => {
    pills.push(activePill(value, () => state.regions.delete(value)));
  });
  state.elements.forEach((value) => {
    pills.push(activePill(value, () => state.elements.delete(value)));
  });
  state.classes.forEach((value) => {
    pills.push(activePill(value, () => state.classes.delete(value)));
  });
  if (state.minPower > 0) {
    pills.push(activePill(`Power ${state.minPower}+`, () => setPower(0)));
  }
  activeBar.replaceChildren(...pills);
  activeBar.hidden = pills.length === 0;
}

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
  syncChips();
  render();
  renderActiveFilters();
});

const DETAIL_SIZE = 260;
const DETAIL_GAP = 40;
const DETAIL_PAD = 40;

const detail = document.querySelector("[data-detail]");
const detailPanel = document.querySelector("[data-detail-panel]");
const detailSprite = document.querySelector("[data-detail-sprite]");
detailSprite.dataset.frame = "0";
const detailCopy = document.querySelector("[data-detail-copy]");
const detailIndex = document.querySelector("[data-detail-index]");
const detailTitle = document.querySelector("[data-detail-title]");
const detailRoles = document.querySelector("[data-detail-roles]");
const detailFacts = document.querySelector("[data-detail-facts]");
const detailBody = document.querySelector("[data-detail-body]");
const detailKinWrap = document.querySelector("[data-detail-kin]");
const detailKinList = document.querySelector("[data-detail-kinlist]");
const detailClose = document.querySelector("[data-detail-close]");

let typeToken = { cancelled: true };
let detailFrameTimer = null;

function startDetailAnimation() {
  if (detailFrameTimer) {
    return;
  }
  detailFrameTimer = setInterval(() => stepSprite(detailSprite), FRAME_MS);
}

function stopDetailAnimation() {
  clearInterval(detailFrameTimer);
  detailFrameTimer = null;
}

function fillDetailCopy(beast) {
  detailIndex.textContent = `#${beast.index}`;
  detailTitle.textContent = beast.name;

  detailRoles.replaceChildren(...beast.roles.map((role) => {
    const span = document.createElement("span");
    span.className = "etidex-detail__role";
    span.textContent = role;
    return span;
  }));

  const factPairs = [
    ["Tradition", beast.region],
    ["Element", beast.element],
    ["Class", beast.class],
    ["Power", String(beast.power)],
  ];
  detailFacts.replaceChildren(...factPairs.flatMap(([term, value]) => {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = value;
    return [dt, dd];
  }));

  detailBody.textContent = "";

  if (beast.kin?.length) {
    detailKinWrap.hidden = false;
    detailKinList.replaceChildren(...beast.kin.map((name) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "etidex-detail__kinchip";
      chip.textContent = name;
      chip.addEventListener("click", () => {
        const target = beasts.find((b) => b.name === name);
        if (target) {
          openDetail(target, null);
        }
      });
      return chip;
    }));
  } else {
    detailKinWrap.hidden = true;
    detailKinList.replaceChildren();
  }
}

async function openDetail(beast, sourceCard) {
  typeToken.cancelled = true;

  const switchingBeast = detailCopy.classList.contains("is-shown");
  if (switchingBeast) {
    detailCopy.classList.remove("is-shown");
    detailSprite.classList.add("is-hidden");
    await pause(320);
  }

  const sourceSprite = sourceCard?.querySelector(".etidex-card__sprite") ?? null;
  const startRect = (sourceSprite ?? detailSprite).getBoundingClientRect();
  const startFrame = sourceSprite
    ? sourceSprite.style.getPropertyValue("--frame")
    : detailSprite.style.getPropertyValue("--frame");

  detailSprite.style.setProperty("--sp-col", (beast.sprite % 4) * 4);
  detailSprite.style.setProperty("--sp-row", Math.floor(beast.sprite / 4));
  detailSprite.style.setProperty("--frame", startFrame || "0");

  detailSprite.style.transition = "none";
  detailSprite.style.left = `${startRect.left}px`;
  detailSprite.style.top = `${startRect.top}px`;
  detailSprite.style.width = `${startRect.width}px`;
  detailSprite.style.height = `${startRect.height}px`;

  detail.hidden = false;
  panel.classList.add("is-leaving");
  startDetailAnimation();

  fillDetailCopy(beast);

  detailSprite.getBoundingClientRect();

  const panelWidth = Math.min(940, window.innerWidth * 0.92);
  const panelHeight = Math.min(560, window.innerHeight * 0.84);
  const panelLeft = (window.innerWidth - panelWidth) / 2;
  const panelTop = (window.innerHeight - panelHeight) / 2;

  const spriteLeft = panelLeft + DETAIL_PAD;
  const spriteTop = panelTop + (panelHeight - DETAIL_SIZE) / 2;
  const copyLeft = spriteLeft + DETAIL_SIZE + DETAIL_GAP;

  detailCopy.style.left = `${copyLeft}px`;
  detailCopy.style.top = `${panelTop + DETAIL_PAD}px`;
  detailCopy.style.width = `${panelLeft + panelWidth - DETAIL_PAD - copyLeft}px`;
  detailCopy.style.height = `${panelHeight - DETAIL_PAD * 2}px`;

  requestAnimationFrame(() => {
    detailPanel.classList.add("is-shown");
    detailSprite.style.transition = "";
    detailSprite.classList.remove("is-hidden");
    detailSprite.style.left = `${spriteLeft}px`;
    detailSprite.style.top = `${spriteTop}px`;
    detailSprite.style.width = `${DETAIL_SIZE}px`;
    detailSprite.style.height = `${DETAIL_SIZE}px`;
  });

  await pause(400);
  detailCopy.classList.add("is-shown");
  await pause(180);

  const token = { cancelled: false };
  typeToken = token;
  await typeInto(detailBody, beast.body, { delay: 9, token });
}

async function closeDetail() {
  typeToken.cancelled = true;
  detailCopy.classList.remove("is-shown");
  await pause(80);
  detailPanel.classList.remove("is-shown");
  detailSprite.classList.add("is-hidden");
  panel.classList.remove("is-leaving");
  await pause(340);
  detail.hidden = true;
  stopDetailAnimation();
}

detailClose.addEventListener("click", closeDetail);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !detail.hidden) {
    closeDetail();
  }
});

fetch("src/data/beasts.json")
  .then((response) => response.json())
  .then((data) => {
    beasts = data;
    buildChips("region", state.regions);
    buildChips("element", state.elements);
    buildChips("class", state.classes);
    render(true);
    renderActiveFilters();
  });
