import scene from "./data/scene.js";
import { entries, holds as holdCopy } from "./data/content.js";
import { Director } from "./director.js";
import { listen } from "./input.js";
import { MediaLibrary, videoFormat } from "./media.js";
import { Stage } from "./stage.js";
import { Copy } from "./ui/copy.js";
import { Hotspots } from "./ui/hotspots.js";
import { Loader } from "./ui/loader.js";
import { Navigation } from "./ui/navigation.js";
import { coverWithPixels } from "./pixel-transition.js";

const $ = (selector) => document.querySelector(selector);
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const holds = scene.holds.map((hold) => ({ ...hold, ...holdCopy[hold.id] }));

async function start() {
  const returnTo = sessionStorage.getItem("etinuxia:return");
  sessionStorage.removeItem("etinuxia:return");
  const startIndex = Math.max(holds.findIndex((hold) => hold.id === returnTo), 0);

  const loader = new Loader($("[data-loader]"));
  const media = new MediaLibrary({
    root: "media",
    holds: holds.map(({ id }) => id),
    loops: holds.filter(({ loop }) => loop).map(({ id }) => id),
    format: videoFormat(),
  });
  try {
    await media.load((value) => loader.progress(value));
  } catch (error) {
    loader.fail(`${error.message}. Render and encode the deck, then reload.`);
    return;
  }

  const stage = new Stage($("[data-stage]"), media, { fps: scene.fps });
  await stage.show(holds[startIndex].id);

  const director = new Director({ holds, stage, reducedMotion });
  director.index = startIndex;
  const copy = new Copy($("[data-copy]"), { reducedMotion });
  const hint = $("[data-hint]");
  const navigation = new Navigation({ rail: $("[data-rail]"), sections: $("[data-sections]") }, holds, {
    onJump: (index) => director.goTo(index),
  });
  const hotspots = new Hotspots($("[data-hotspots]"), {
    labelFor: (spot) => {
      if (spot.goes) {
        return holds[director.indexOf(spot.goes)].title;
      }
      return spot.opens === "qilin" ? "Etidex" : entries[spot.opens].title;
    },
    onSelect: (spot) => {
      if (spot.goes) {
        director.goTo(director.indexOf(spot.goes));
      } else if (spot.opens === "qilin") {
        goToEtidex();
      } else {
        openEntry(spot.opens);
      }
    },
  });

  async function openEntry(id) {
    hotspots.hide();
    await copy.openEntry(entries[id], director.hold);
  }

  async function goToEtidex() {
    await coverWithPixels();
    sessionStorage.setItem("etidex:enter", "pixel");
    window.location.href = "etidex.html";
  }

  async function goToAtlas() {
    await coverWithPixels();
    sessionStorage.setItem("atlas:enter", "pixel");
    window.location.href = "atlas.html";
  }

  async function closeEntry() {
    if (!copy.entry || director.busy) {
      return;
    }
    await copy.closeEntry(director.hold);
    if (!director.busy && !copy.entry) {
      hotspots.show();
    }
  }

  function arrive(hold) {
    document.body.classList.remove("is-moving");
    navigation.update(director.index);
    hotspots.render(hold);
    hotspots.show();
    copy.showHold(hold);
  }

  stage.onAmbientFrame = (frame) => hotspots.follow(frame);
  copy.back.addEventListener("click", closeEntry);
  copy.etidex.addEventListener("click", goToEtidex);
  copy.atlasLink.addEventListener("click", goToAtlas);
  director.addEventListener("leave", () => {
    document.body.classList.add("is-moving");
    copy.hide();
    hotspots.hide();
    hint.classList.add("is-hidden");
  });
  director.addEventListener("pass", ({ detail }) => navigation.update(detail.index));
  director.addEventListener("arrive", ({ detail }) => arrive(detail.hold));

  listen({
    onStep: (direction) => director.step(direction),
    onEscape: closeEntry,
    isBusy: () => director.busy,
  });

  arrive(holds[startIndex]);
  loader.done();
  director.wake();
}

start();
