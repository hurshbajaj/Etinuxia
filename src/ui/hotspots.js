const NEAR_PX = 72;
const FLIP_AT = 68;

export class Hotspots {
  constructor(layer, { labelFor, onSelect }) {
    this.layer = layer;
    this.labelFor = labelFor;
    this.onSelect = onSelect;
    this.spots = [];
    this.pointer = null;
    this.layerRect = null;
    window.addEventListener("pointermove", (event) => {
      this.pointer = { x: event.clientX, y: event.clientY };
      this.#sense();
    }, { passive: true });
    window.addEventListener("click", (event) => this.#clickNear(event));
    window.addEventListener("resize", () => { this.layerRect = null; }, { passive: true });
  }

  #rect() {
    if (!this.layerRect) {
      this.layerRect = this.layer.getBoundingClientRect();
    }
    return this.layerRect;
  }

  #distanceTo(pos, x, y) {
    const rect = this.#rect();
    const px = rect.left + (pos.x / 100) * rect.width;
    const py = rect.top + (pos.y / 100) * rect.height;
    return Math.hypot(x - px, y - py);
  }

  get shown() {
    return this.layer.classList.contains("is-shown");
  }

  render(hold) {
    this.layerRect = null;
    this.spots = hold.hotspots.map((spot) => {
      const label = this.labelFor(spot);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "hotspot";
      button.classList.toggle("is-flipped", spot.x > FLIP_AT);
      button.style.setProperty("--x", spot.x);
      button.style.setProperty("--y", spot.y);
      button.setAttribute("aria-label", label);
      button.innerHTML = '<span class="hotspot__ping" aria-hidden="true"></span><span class="hotspot__ring" aria-hidden="true"></span><span class="hotspot__label" aria-hidden="true"></span>';
      button.querySelector(".hotspot__label").textContent = label;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        this.onSelect(spot);
      });
      return { spot, button, pos: { x: spot.x, y: spot.y } };
    });
    this.layer.replaceChildren(...this.spots.map(({ button }) => button));
  }

  show() {
    this.layer.classList.add("is-shown");
  }

  hide() {
    this.layer.classList.remove("is-shown");
    this.spots.forEach(({ button }) => button.classList.remove("is-near"));
  }

  follow(frame) {
    let moved = false;
    for (const { spot, button, pos } of this.spots) {
      if (!spot.track) {
        continue;
      }
      const [x, y, seen] = spot.track[frame % spot.track.length];
      button.style.setProperty("--x", x);
      button.style.setProperty("--y", y);
      button.classList.toggle("is-flipped", x > FLIP_AT);
      button.classList.toggle("is-occluded", !seen);
      pos.x = x;
      pos.y = y;
      moved = true;
    }
    if (moved) {
      this.#sense();
    }
  }

  #sense() {
    if (!this.shown || !this.pointer) {
      return;
    }
    const { x, y } = this.pointer;
    this.spots.forEach(({ button, pos }) => {
      const near = !button.classList.contains("is-occluded") && this.#distanceTo(pos, x, y) < NEAR_PX;
      button.classList.toggle("is-near", near);
    });
  }

  #clickNear(event) {
    if (!this.shown || (event.target instanceof Element && event.target.closest("button, a"))) {
      return;
    }
    const near = this.spots.find(({ button, pos }) => !button.classList.contains("is-occluded") && this.#distanceTo(pos, event.clientX, event.clientY) < NEAR_PX);
    if (near) {
      this.onSelect(near.spot);
    }
  }
}
