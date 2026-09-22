import argparse
import json
import sys
import time
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))

import shots

ENGINES = {"eevee": "BLENDER_EEVEE", "cycles": "CYCLES", "workbench": "BLENDER_WORKBENCH"}


def options():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--frames", default="all")
    parser.add_argument("--engine", default="eevee", choices=sorted(ENGINES))
    parser.add_argument("--size", default="")
    parser.add_argument("--samples", type=int, default=0)
    parser.add_argument("--no-blur", action="store_true")
    parser.add_argument("--skip-existing", action="store_true")
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1:])


def frame_list(spec):
    if spec == "all":
        return list(range(1, shots.last_frame() + 1))
    if spec == "holds":
        return shots.hold_frames()
    frames = []
    for part in spec.split(","):
        if "-" in part:
            a, b = part.split("-")
            frames.extend(range(int(a), int(b) + 1))
        else:
            frames.append(int(part))
    return frames


def configure(opts):
    scene = bpy.context.scene
    scene.render.engine = ENGINES[opts.engine]
    if opts.size:
        scene.render.resolution_x, scene.render.resolution_y = (int(v) for v in opts.size.split("x"))
    if opts.samples:
        scene.cycles.samples = opts.samples
        scene.eevee.taa_render_samples = opts.samples
    if opts.no_blur:
        scene.render.use_motion_blur = False
    if opts.engine == "workbench":
        shading = scene.display.shading
        shading.light = "STUDIO"
        shading.color_type = "TEXTURE"
        shading.show_cavity = True
        shading.show_specular_highlight = False
        scene.render.use_compositing = False
        for name in ("clouds", "atmosphere", "deck_glass", "deck_air"):
            bpy.data.objects[name].hide_render = True


def show_stage(stage):
    orbit = stage == "orbit"
    bpy.data.collections["Station"].hide_render = not orbit
    bpy.data.collections["Deck"].hide_render = orbit
    for ob in bpy.data.collections["Rig"].objects:
        if ob.get("group") == "deck":
            ob.hide_render = orbit


def write_manifest(out):
    start, end = shots.dissolve_window()
    manifest = dict(
        fps=shots.FPS,
        holds=[dict(name=h["name"], frame=f) for h, f in zip(shots.HOLDS, shots.hold_frames())],
        dissolve=dict(start=start, end=end),
        last=shots.last_frame(),
        loop=dict(hold=shots.HOLDS[0]["name"], start=1, end=shots.LOOP["frames"]),
        width=bpy.context.scene.render.resolution_x,
        height=bpy.context.scene.render.resolution_y,
    )
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2))


def main():
    opts = options()
    configure(opts)
    out = Path(opts.out)
    out.mkdir(parents=True, exist_ok=True)
    write_manifest(out)
    jobs = []
    for frame in frame_list(opts.frames):
        stage = shots.stage_for(frame)
        if stage == "blend":
            jobs += [("orbit", frame, f"f_{frame:04d}_orbit.png"), ("deck", frame, f"f_{frame:04d}_deck.png")]
        else:
            jobs.append((stage, frame, f"f_{frame:04d}.png"))
    scene = bpy.context.scene
    for stage, frame, name in sorted(jobs, key=lambda job: (job[0] != "orbit", job[1])):
        path = out / name
        if opts.skip_existing and path.exists():
            continue
        show_stage(stage)
        scene.frame_set(frame)
        scene.render.filepath = str(path)
        started = time.time()
        bpy.ops.render.render(write_still=True)
        print(f"FRAME {frame} {stage} {time.time() - started:.1f}s", flush=True)


main()
