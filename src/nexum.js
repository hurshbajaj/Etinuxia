import { createLightRays } from "./light-rays.js";
import { createSky } from "./nexum-sky.js";
import { typeInto } from "./ui/text.js";
import { coverWithPixels, revealFromPixels } from "./pixel-transition.js";

const scene = document.querySelector("[data-scene]");
const sky = document.querySelector("[data-sky]");
const card = document.querySelector("[data-card]");
const cardPantheon = document.querySelector("[data-card-pantheon]");
const cardName = document.querySelector("[data-card-name]");
const cardTag = document.querySelector("[data-card-tag]");
const cardBlurb = document.querySelector("[data-card-blurb]");
const cardKin = document.querySelector("[data-card-kin]");
let typeToken = { cancelled: true };

createLightRays(scene, {
  raysOrigin: "top-right",
  raysAnchor: [1.15, -0.15],
  raysDir: [-1.8, 1],
  raysColor: "#ffffff",
  raysSpeed: 1.4,
  lightSpread: 0.35,
  rayLength: 2.2,
  fadeDistance: 1.2,
  saturation: 1.0,
  followMouse: true,
  mouseInfluence: 0.12,
  lightMode: false,
});

function showDeity({ node, cluster }) {
  typeToken.cancelled = true;
  typeToken = { cancelled: false };

  cardPantheon.textContent = cluster.pantheon.name;
  cardName.textContent = node.name;
  cardTag.textContent = node.tag;
  cardKin.innerHTML = "";
  for (const sibling of cluster.nodes) {
    if (sibling.name === node.name) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = sibling.name;
    btn.addEventListener("click", () => {
      skyInstance.retarget(sibling);
      showDeity({ node: sibling, cluster });
    });
    cardKin.appendChild(btn);
  }
  card.hidden = false;
  requestAnimationFrame(() => card.classList.add("is-shown"));
  typeInto(cardBlurb, cluster.pantheon.blurb, { delay: 16, token: typeToken });
}

const skyInstance = createSky(sky, {
  onFocus: showDeity,
  onUnfocus: () => {
    typeToken.cancelled = true;
    card.classList.remove("is-shown");
    setTimeout(() => {
      card.hidden = true;
    }, 360);
  },
});

if (sessionStorage.getItem("nexum:enter") === "pixel") {
  sessionStorage.removeItem("nexum:enter");
  revealFromPixels();
}

document.querySelector("[data-nexum-back]").addEventListener("click", async () => {
  await coverWithPixels();
  sessionStorage.setItem("etinuxia:return", "pantheons");
  window.location.href = "index.html";
});
