import json
import math
import sys
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view

sys.path.insert(0, str(Path(__file__).resolve().parent))

import geo
import shots

ROOT = Path(__file__).resolve().parents[1]
PASS_THROUGH = {"deck_glass", "deck_air", "atmosphere", "clouds"}


def stage(hold):
    orbit = hold == "orbit"
    bpy.data.collections["Station"].hide_viewport = not orbit
    bpy.data.collections["Deck"].hide_viewport = orbit
    bpy.context.view_layer.update()


def focus(hold):
    stage(hold)
    scene = bpy.context.scene
    scene.frame_set(shots.hold_frames()[shots.hold_index(hold)])
    return scene, scene.camera


def cast(scene, origin, direction):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    start = origin
    for _ in range(12):
        hit, location, _normal, _index, ob, _matrix = scene.ray_cast(depsgraph, start, direction)
        if not hit:
            return None
        if ob.name not in PASS_THROUGH:
            return location
        start = location + direction * 0.05
    return None


def pixel_ray(scene, cam, x, y):
    tr, br, bl, tl = [cam.matrix_world @ corner for corner in cam.data.view_frame(scene=scene)]
    target = tl + (tr - tl) * x + (bl - tl) * y
    origin = cam.matrix_world.translation
    return origin, (target - origin).normalized()


def behind_earth(origin, point, radius):
    offset = point - origin
    length = offset.length
    direction = offset / length
    closest = -origin.dot(direction)
    if closest < 0:
        return False
    miss = origin.length_squared - closest * closest
    if miss > radius * radius:
        return False
    return closest - math.sqrt(radius * radius - miss) < length


def station_track():
    scene, cam = focus(shots.HOLDS[0]["name"])
    radius = bpy.data.objects["earth"].dimensions.x / 2
    origin = cam.matrix_world.translation
    track = []
    for frame in range(1, shots.LOOP["frames"] + 1):
        point = shots.station_center(frame)
        view = world_to_camera_view(scene, cam, point)
        track.append([round(view.x * 100, 2), round((1 - view.y) * 100, 2), 0 if behind_earth(origin, point, radius) else 1])
    return track


def anchor_point(name, spec):
    if "follow" in spec:
        return shots.station_center(shots.hold_frames()[0])
    if "point" in spec:
        return spec["point"]
    if "geo" in spec:
        return geo.surface_point(bpy.data.objects["earth"], *spec["geo"])
    hold, x, y = spec["ray"]
    scene, cam = focus(hold)
    point = cast(scene, *pixel_ray(scene, cam, x, y))
    if point is None:
        raise ValueError(f"anchor {name} hits nothing")
    return point


def visible(scene, cam, point):
    origin = cam.matrix_world.translation
    offset = point - origin
    hit = cast(scene, origin, offset.normalized())
    return hit is None or (hit - origin).length >= offset.length - 1.0


def main():
    from mathutils import Vector

    points = {name: Vector(anchor_point(name, spec)) for name, spec in shots.ANCHORS.items()}
    holds = []
    for hold, frame in zip(shots.HOLDS, shots.hold_frames()):
        scene, cam = focus(hold["name"])
        spots = []
        for spot in shots.HOTSPOTS.get(hold["name"], []):
            point = points[spot["anchor"]]
            view = world_to_camera_view(scene, cam, point)
            x, y = round(view.x * 100, 2), round((1 - view.y) * 100, 2)
            if view.z <= 0 or not (0 <= x <= 100 and 0 <= y <= 100):
                print(f"warning: {spot['anchor']} is off screen in {hold['name']}")
            elif not visible(scene, cam, point):
                print(f"warning: {spot['anchor']} is behind geometry in {hold['name']}")
            entry = {"id": spot["anchor"], "x": x, "y": y}
            entry.update({key: spot[key] for key in ("opens", "goes") if key in spot})
            if "follow" in shots.ANCHORS[spot["anchor"]]:
                entry["track"] = station_track()
            spots.append(entry)
            print(f"SPOT {hold['name']:10s} {spot['anchor']:10s} {x:6.2f} {y:6.2f}")
        record = {"id": hold["name"], "frame": frame, "hotspots": spots}
        if hold is shots.HOLDS[0]:
            record["loop"] = {"frames": shots.LOOP["frames"]}
        holds.append(record)
    stage("deck")
    target = ROOT / "src" / "data" / "scene.js"
    body = json.dumps({"fps": shots.FPS, "holds": holds}, ensure_ascii=False, separators=(",", ":"))
    target.write_text(f"export default {body};\n")
    print(f"wrote {target}")


main()
