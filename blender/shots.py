import math

from mathutils import Matrix, Quaternion, Vector

FPS = 24

RENDER = dict(width=1920, height=1080, eevee_samples=64, cycles_samples=48, noise_threshold=0.03, exposure=dict(orbit=0.35, deck=0.65))

SUN = dict(toward=(-0.55, 0.58, 0.6), strength=4.8, color=(1.0, 0.955, 0.9))

EARTH = dict(face=(24.0, 18.0), toward=(-1.0, 0.0, 0.05), north_tilt=-16.0, city_lights=4.2, atmosphere=3.2)

STATION = dict(center=(-392.0, 2.0, 17.0), truss_axis=(0.0, 1.0, 0.0), depth_axis=(-1.0, 0.0, 0.0), roll=-11.0, scale=0.4)

LOOP = dict(frames=384, earth_turns=1, station_orbits=2, earth_settle=2.5, station_settle=2.0, radius=190.0, orbit_normal=(0.0, 0.08, 1.0))

LIGHTS = [
    dict(name="deck_fill", group="deck", type="AREA", haze=0.0, pos=(-455.0, 0.0, 34.0), aim=(-300.0, 0.0, 0.0), size=70.0, power=1.3e5, color=(0.72, 0.8, 1.0)),
    dict(name="deck_earthshine", group="deck", type="AREA", haze=0.0, pos=(-256.0, 0.0, 6.0), aim=(-420.0, 0.0, 14.0), size=56.0, power=9.0e4, color=(0.52, 0.7, 1.0)),
    dict(name="deck_ceiling", group="deck", type="AREA", haze=0.0, pos=(-350.0, 0.0, 36.0), aim=(-350.0, 0.0, -30.0), size=80.0, power=2.5e4, color=(0.9, 0.93, 1.0)),
    dict(name="deck_glow_port", group="deck", type="POINT", pos=(-292.0, 26.0, 14.0), size=4.0, power=2.2e4, color=(1.0, 0.56, 0.24)),
    dict(name="deck_glow_starboard", group="deck", type="POINT", pos=(-292.0, -26.0, 14.0), size=4.0, power=2.2e4, color=(1.0, 0.56, 0.24)),
    dict(name="deck_glow_scope", group="deck", type="POINT", pos=(-275.0, 0.0, 12.0), size=3.0, power=1.2e4, color=(0.55, 0.78, 1.0)),
    dict(name="deck_strip_port", group="deck", type="AREA", pos=(-330.0, 40.0, -12.0), aim=(-330.0, 18.0, 22.0), size=(90.0, 3.0), power=3.0e3, color=(1.0, 0.52, 0.22)),
    dict(name="deck_strip_starboard", group="deck", type="AREA", pos=(-330.0, -40.0, -12.0), aim=(-330.0, -18.0, 22.0), size=(90.0, 3.0), power=3.0e3, color=(1.0, 0.52, 0.22)),
]

STATION_LIGHTS = [
    dict(name="station_earthshine", type="POINT", pos=(0.0, 0.0, 0.0), size=40.0, power=1.8e5, color=(0.55, 0.7, 1.0)),
    dict(name="station_rim", type="SUN", toward=(0.62, 0.42, 0.66), strength=1.4, color=(1.0, 0.9, 0.82)),
]

VOLUME = dict(density=0.0008, anisotropy=0.55, color=(0.86, 0.91, 1.0), bounds=((-472.0, -54.0, -34.0), (-242.0, 54.0, 52.0)))

GRADE = dict(threshold=1.1, strength=0.5, size=0.55, lift=(0.985, 0.995, 1.02, 1.0), gain=(1.03, 1.0, 0.965, 1.0))

HOLDS = [
    dict(name="orbit", pos=(-1000.0, -144.0, 206.0), target=(0.0, 0.0, 0.0), lens=40.0, fstop=16.0),
    dict(name="deck", pos=(-412.0, 0.0, 9.0), target=(-250.0, 0.0, 3.0), lens=19.0, fstop=1.2),
    dict(name="bestiary", pos=(-346.0, -3.0, 21.0), target=(-286.0, -33.0, 5.0), lens=24.0, fstop=0.45),
    dict(name="atlas", pos=(-320.0, 0.0, 15.0), target=(-256.0, 0.0, -1.0), lens=24.0, fstop=0.5),
    dict(name="pantheons", pos=(-346.0, 3.0, 21.0), target=(-286.0, 33.0, 5.0), lens=24.0, fstop=0.45),
]

SEGMENTS = [
    dict(frames=84, ease="cinematic", via=[
        dict(pos=(-700.0, -60.0, 84.0), target=(-300.0, 10.0, 8.0), lens=32.0, roll=-4.0),
        dict(pos=(-506.0, -14.0, 21.0), target=(-360.0, 1.0, 13.0), lens=26.0, roll=-1.5),
    ]),
    dict(frames=36, ease="gentle", via=[dict(pos=(-380.0, -6.0, 20.0), target=(-275.0, -22.0, 4.0), lens=22.0, roll=0.0)]),
    dict(frames=36, ease="gentle", via=[]),
    dict(frames=36, ease="gentle", via=[]),
]

DISSOLVE_FRAMES = 12
DECK_ENTRY_X = -462.0

ANCHORS = {
    "station": dict(follow="station"),
    "bestiary": dict(ray=("bestiary", 0.4, 0.4)),
    "atlas": dict(ray=("atlas", 0.5, 0.55)),
    "pantheons": dict(ray=("deck", 0.407, 0.443)),
    "kraken": dict(ray=("bestiary", 0.35, 0.4)),
    "qilin": dict(ray=("bestiary", 0.555, 0.51)),
    "anansi": dict(geo=(6.7, -1.6)),
    "baba-yaga": dict(geo=(49.0, 24.0)),
    "norse": dict(ray=("pantheons", 0.53, 0.36)),
    "egyptian": dict(ray=("pantheons", 0.44, 0.52)),
}

HOTSPOTS = {
    "orbit": [dict(anchor="station", opens="station")],
    "deck": [dict(anchor="bestiary", goes="bestiary"), dict(anchor="atlas", goes="atlas"), dict(anchor="pantheons", goes="pantheons")],
    "bestiary": [dict(anchor="kraken", opens="kraken"), dict(anchor="qilin", opens="qilin")],
    "atlas": [dict(anchor="anansi", opens="anansi"), dict(anchor="baba-yaga", opens="baba-yaga")],
    "pantheons": [dict(anchor="norse", opens="norse"), dict(anchor="egyptian", opens="egyptian")],
}


def hold_frames():
    frames = [LOOP["frames"] + 1]
    for seg in SEGMENTS:
        frames.append(frames[-1] + seg["frames"])
    return frames


def hold_index(name):
    return [h["name"] for h in HOLDS].index(name)


def last_frame():
    return hold_frames()[-1]


def orbit_axis():
    radial = Vector(STATION["center"]).normalized()
    normal = Vector(LOOP["orbit_normal"])
    return (normal - radial * normal.dot(radial)).normalized()


def settling(frame, cycles, settle_seconds):
    rate = 2.0 * math.pi * cycles / LOOP["frames"]
    settle = settle_seconds * FPS
    lead = rate * settle / 2.0
    home = hold_frames()[0]
    if frame <= home:
        return rate * (frame - 1) - lead
    t = min(frame - home, settle)
    return rate * (home - 1) - lead + rate * (t - t * t / (2.0 * settle))


def station_angle(frame):
    return settling(frame, LOOP["station_orbits"], LOOP["station_settle"])


def earth_angle(frame):
    return settling(frame, LOOP["earth_turns"], LOOP["earth_settle"])


def station_rise(frame):
    home = hold_frames()[0]
    t = min(max((frame - home) / (LOOP["station_settle"] * FPS), 0.0), 1.0)
    return t * t * (3.0 - 2.0 * t)


def station_offset(frame):
    dock = Vector(STATION["center"])
    radius = LOOP["radius"] + (dock.length - LOOP["radius"]) * station_rise(frame)
    return dock.normalized() * (radius - dock.length)


def station_center(frame):
    return Matrix.Rotation(station_angle(frame), 3, orbit_axis()) @ (Vector(STATION["center"]) + station_offset(frame))


def ease(kind, t):
    if kind == "cinematic":
        return t * t * t * (t * (6 * t - 15) + 10)
    return 0.5 - 0.5 * math.cos(math.pi * t)


def catmull_rom(points, t):
    if len(points) == 2:
        return points[0].lerp(points[1], t)
    padded = [points[0] * 2 - points[1]] + points + [points[-1] * 2 - points[-2]]
    spans = len(points) - 1
    scaled = min(t * spans, spans - 1e-9)
    i = int(scaled)
    u = scaled - i
    p0, p1, p2, p3 = padded[i], padded[i + 1], padded[i + 2], padded[i + 3]
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u)


def arc_table(points, samples=400):
    table = [0.0]
    prev = catmull_rom(points, 0.0)
    for k in range(1, samples + 1):
        cur = catmull_rom(points, k / samples)
        table.append(table[-1] + (cur - prev).length)
        prev = cur
    return table


def param_at(table, fraction):
    total = table[-1]
    if total <= 1e-9:
        return fraction
    goal = fraction * total
    samples = len(table) - 1
    for k in range(1, samples + 1):
        if table[k] >= goal:
            span = table[k] - table[k - 1]
            local = 0.0 if span <= 1e-9 else (goal - table[k - 1]) / span
            return (k - 1 + local) / samples
    return 1.0


def orientation(pos, target, roll):
    forward = (target - pos).normalized()
    quat = forward.to_track_quat("-Z", "Y")
    return quat @ Quaternion((0.0, 0.0, 1.0), math.radians(roll))


def pose(pos, target, lens, fstop, roll=0.0):
    return dict(
        pos=pos,
        target=target,
        rotation=orientation(pos, target, roll),
        lens=lens,
        focus=(target - pos).length,
        fstop=fstop,
    )


def bake():
    frames = hold_frames()
    first = HOLDS[0]
    rest = pose(Vector(first["pos"]), Vector(first["target"]), first["lens"], first["fstop"])
    for frame in range(1, frames[0] + 1):
        yield frame, rest
    for index, seg in enumerate(SEGMENTS):
        a, b = HOLDS[index], HOLDS[index + 1]
        keys = [dict(pos=a["pos"], target=a["target"], lens=a["lens"], roll=0.0)] + seg["via"] + [dict(pos=b["pos"], target=b["target"], lens=b["lens"], roll=0.0)]
        positions = [Vector(k["pos"]) for k in keys]
        targets = [Vector(k["target"]) for k in keys]
        table = arc_table(positions)
        for step in range(1, seg["frames"] + 1):
            fraction = ease(seg["ease"], step / seg["frames"])
            t = param_at(table, fraction)
            spans = len(keys) - 1
            scaled = min(t * spans, spans - 1e-9)
            i = int(scaled)
            u = scaled - i
            smooth_u = 0.5 - 0.5 * math.cos(math.pi * u)
            lens = keys[i]["lens"] + (keys[i + 1]["lens"] - keys[i]["lens"]) * smooth_u
            roll = keys[i]["roll"] + (keys[i + 1]["roll"] - keys[i]["roll"]) * smooth_u
            fstop = math.exp(math.log(a["fstop"]) + (math.log(b["fstop"]) - math.log(a["fstop"])) * fraction)
            yield frames[index] + step, pose(catmull_rom(positions, t), catmull_rom(targets, t), lens, fstop, roll)


def dissolve_window():
    deck_hold = hold_frames()[1]
    for frame, p in bake():
        if frame > deck_hold:
            break
        if p["pos"].x >= DECK_ENTRY_X:
            return frame, min(frame + DISSOLVE_FRAMES - 1, deck_hold - 1)
    raise ValueError("camera never enters the deck")


def stage_for(frame):
    start, end = dissolve_window()
    if frame < start:
        return "orbit"
    if frame > end:
        return "deck"
    return "blend"
