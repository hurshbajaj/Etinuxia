# Etinuxia

Landing page for Etinuxia, the orbital archive of myth. The page plays a pre-rendered Blender flythrough. Scrolling moves the camera between five holds: orbit, deck, bestiary, atlas and pantheons. Each hold has hotspots that either open an entry or fly you to an instrument.

The home stop plays a seamless 16-second loop: Earth turns once and the station orbits it twice. When you scroll, the loop fast-forwards to its sync point, then the dive starts from that exact frame, so the motion never jumps. During the dive the station brakes out of orbit and rises to meet the camera, and Earth's spin eases to a stop. The station hotspot follows the ISS frame by frame and hides when it passes behind Earth.

## Run the site

```
npm run dev
```

Open http://localhost:5173. Node 18+; three.js and ogl load from esm.sh, no install step. Any static server works too.

The media in `media/` is a grey clay preview so the site runs out of the box. Render the real thing below.

## Render with EEVEE on a Mac

You need Blender 5.2.1 and ffmpeg (`brew install ffmpeg`).

Test the five holds first:

```
/Applications/Blender.app/Contents/MacOS/Blender -b blender/etinuxia.blend --python blender/render.py -- --out blender/renders --frames holds
```

Then the full sequence, which resumes if interrupted:

```
npm run render -- --skip-existing
npm run encode
```

`npm run render` expects Blender at `/Applications/Blender.app`. Set `BLENDER=/path/to/Blender` if yours lives elsewhere. The scene renders at 1920x1080 with 64 EEVEE samples; lower `eevee_samples` in `blender/shots.py` for faster drafts.

## Change the shots

`blender/shots.py` holds everything camera-related: holds, segment lengths, the path, the orbit-to-deck dissolve, lights, the sun, Earth orientation and hotspot anchors. `LOOP` sets the home loop: its length in frames, Earth turns and station orbits per loop (keep both whole numbers so it loops cleanly), orbit radius and how long the station and Earth take to settle once the dive starts. Anchors are either 3D points, rays cast from a hold camera through a screen position, or latitude and longitude on the globe.

Lighting lives there too:

- `SUN` is the key light for Earth, the station and the shafts through the dome.
- `STATION_LIGHTS` are an earthshine fill and a rim light, linked to the station only so Earth stays untouched.
- `LIGHTS` are the cockpit fills, amber practicals and under-console strips. `haze=0.0` keeps a light out of the god-ray volume.
- `VOLUME` is the cabin air that catches the sun shafts.
- `GRADE` is the compositor bloom and lift/gain split.
- `RENDER["exposure"]` is keyed per stage, with orbit darker than the deck.

`blender/lookdev/` has low-sample EEVEE checks of the home shot and the deck. Grain in the cockpit glass at low samples clears at 64; if any survives on your machine, set the `deck_glass` material's render method to Blended.

After editing it:

1. Rebuild the scene from the source models: `Blender -b cockpit.blend --python blender/build.py -- iss.blend blender/etinuxia.blend`
2. `npm run export` to reproject hotspots into `src/data/scene.js`
3. Render and encode again.

Copy lives in `src/data/content.js`.

## Layout

```
index.html
styles/            fonts, base, stage, interface
src/main.js        wiring
src/director.js    hold-to-hold state machine
src/stage.js       still and clip playback
src/media.js       preloading and codec choice
src/input.js       wheel with inertia guard, keys, swipe
src/ui/            copy panel, hotspots, rail and nav, loader
src/data/          scene.js (generated), content.js
blender/           build.py, shots.py, render.py, export_web.py, geo.py, nodes.py, prep_textures.py, textures/, etinuxia.blend
scripts/           encode.py, serve.mjs
media/             holds/*.webp, clips/*.webm and *.mp4
```

## Credits

Earth textures from NASA Visible Earth: Blue Marble Next Generation, Black Marble 2016 and the cloud composite, all public domain. Satoshi by Indian Type Foundry via Fontshare. Station and cockpit models from the source files.
