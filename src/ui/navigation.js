export class Navigation {
  constructor({ rail, sections }, holds, { onJump }) {
    this.stops = holds.map((hold, index) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "rail__stop";
      button.innerHTML = '<span class="rail__label"></span><span class="rail__tick" aria-hidden="true"></span>';
      button.querySelector(".rail__label").textContent = hold.title;
      button.addEventListener("click", () => onJump(index));
      item.append(button);
      return button;
    });
    rail.replaceChildren(...this.stops.map((button) => button.parentElement));

    this.links = holds.flatMap((hold, index) => {
      if (!hold.section) {
        return [];
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sections__link";
      button.textContent = hold.title;
      button.addEventListener("click", () => onJump(index));
      return [{ index, button }];
    });
    sections.replaceChildren(...this.links.map(({ button }) => button));
  }

  update(current) {
    this.stops.forEach((button, index) => {
      if (index === current) {
        button.setAttribute("aria-current", "step");
      } else {
        button.removeAttribute("aria-current");
      }
    });
    this.links.forEach(({ index, button }) => button.setAttribute("aria-current", String(index === current)));
  }
}
