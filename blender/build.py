import math
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))

import geo
import shots
from nodes import NodeBuilder

ROOT = Path(__file__).resolve().parent
TEXTURES = ROOT / "textures"
EARTH_RADIUS = 91.32

PRESETS = {
    "shell": dict(color=(0.062, 0.064, 0.07), metallic=0.05, roughness=0.74, grain=0.35, bump=0.1),
    "leather": dict(color=(0.12, 0.074, 0.05), metallic=0.0, roughness=0.45, grain=0.5, sheen=0.5, bump=0.16),
    "gunmetal": dict(color=(0.28, 0.285, 0.3), metallic=0.7, roughness=0.38, grain=0.35, bump=0.05),
    "console": dict(color=(0.07, 0.075, 0.085), metallic=0.3, roughness=0.45, grain=0.35, bump=0.06),
    "brass": dict(color=(0.72, 0.52, 0.28), metallic=1.0, roughness=0.28, grain=0.4, bump=0.04),
}

DECK_MATERIALS = {
    "Material2.010": ("deck_shell", "shell"),
    "Material3.001": ("deck_hull", "shell"),
    "Material2.008": ("deck_seats", "leather"),
    "Material3": ("deck_ribs", "gunmetal"),
    "Material2.009": ("deck_frame", "gunmetal"),
    "Material2.007": ("deck_fittings", "gunmetal"),
    "Material2": ("deck_console", "console"),
    "Material2.006": ("deck_instruments", "brass"),
    "Material2.005": ("deck_glass", "glass"),
    "Material3.002": ("deck_placard", "console"),
    "Material3.003": ("deck_underfloor", "console"),
}


def arguments():
    argv = sys.argv[sys.argv.index("--") + 1:]
    return Path(argv[0]), Path(argv[1])


def collection(name):
    col = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if col.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(col)
    return col


def move_to(ob, col):
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    col.objects.link(ob)


def fresh_material(name):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    if mat.node_tree is None:
        mat.use_nodes = True
    mat.node_tree.nodes.clear()
    return mat


def image(name, colorspace="sRGB"):
    img = bpy.data.images.load(str(TEXTURES / name), check_existing=True)
    img.colorspace_settings.name = colorspace
    return img


def clean_deck():
    for ob in list(bpy.context.scene.objects):
        if ob.type == "MESH" and ob.parent is not None:
            world = ob.matrix_world.copy()
            ob.parent = None
            ob.matrix_world = world
    for ob in list(bpy.context.scene.objects):
        doomed = ob.type == "EMPTY" or ob.name == "Sphere"
        doomed = doomed or (ob.type == "MESH" and (len(ob.data.polygons) < 4))
        if doomed:
            bpy.data.objects.remove(ob, do_unlink=True)


def build_deck():
    deck = collection("Deck")
    kinds = {}
    for source, (name, kind) in DECK_MATERIALS.items():
        ob = bpy.data.objects.get(source)
        if ob is None:
            continue
        ob.name = name
        move_to(ob, deck)
        if kind not in kinds:
            kinds[kind] = deck_material(kind)
        ob.data.materials.clear()
        ob.data.materials.append(kinds[kind])
        unify_normals(ob.data)
        ob.data.shade_smooth()
        ob.data.set_sharp_from_angle(angle=math.radians(38))
        ob.visible_shadow = kind != "glass"
    return deck


def unify_normals(mesh):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.001)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()


def deck_material(kind):
    mat = fresh_material(f"deck_{kind}")
    nb = NodeBuilder(mat.node_tree)
    out = nb.node("ShaderNodeOutputMaterial")
    if kind == "glass":
        fresnel = nb.node("ShaderNodeFresnel", IOR=1.45)
        clear = nb.node("ShaderNodeBsdfTransparent", Color=(0.93, 0.97, 1.0, 1))
        gloss = nb.node("ShaderNodeBsdfGlossy", Roughness=0.04)
        tint = nb.math("MULTIPLY", fresnel.outputs["Fac"], 0.5)
        mix = nb.node("ShaderNodeMixShader")
        nb.link(tint, mix.inputs[0])
        nb.link(clear.outputs[0], mix.inputs[1])
        nb.link(gloss.outputs[0], mix.inputs[2])
        nb.link(mix.outputs[0], out.inputs["Surface"])
        return mat

    p = PRESETS[kind]
    mat.diffuse_color = tuple(min(1.0, c * 2.4 + 0.05) for c in p["color"]) + (1.0,)
    bsdf = nb.node(
        "ShaderNodeBsdfPrincipled",
        Metallic=p["metallic"],
        Roughness=p["roughness"],
    )
    if "sheen" in p:
        bsdf.inputs["Sheen Weight"].default_value = p["sheen"]
    coords = nb.node("ShaderNodeTexCoord")
    noise = nb.node("ShaderNodeTexNoise", Scale=0.35, Detail=6.0, Roughness=0.62)
    nb.link(coords.outputs["Object"], noise.inputs["Vector"])
    rough = nb.map_range(noise.outputs["Fac"], 0.3, 0.7, p["roughness"] * (1 - p["grain"] * 0.5), p["roughness"] * (1 + p["grain"] * 0.5))
    nb.link(rough, bsdf.inputs["Roughness"])
    shade = nb.map_range(noise.outputs["Fac"], 0.3, 0.7, 0.82, 1.12)
    color = nb.mix_color(1.0, p["color"] + (1,), shade, "MULTIPLY")
    occlusion = nb.node("ShaderNodeAmbientOcclusion", Distance=6.0)
    grime = nb.map_range(occlusion.outputs["AO"], 0.0, 1.0, 0.42, 1.0)
    nb.link(nb.mix_color(1.0, color, grime, "MULTIPLY"), bsdf.inputs["Base Color"])
    fine = nb.node("ShaderNodeTexNoise", Scale=2.4, Detail=10.0, Roughness=0.6)
    nb.link(coords.outputs["Object"], fine.inputs["Vector"])
    bump = nb.node("ShaderNodeBump", Strength=p["bump"], Distance=0.4)
    nb.link(fine.outputs["Fac"], bump.inputs["Height"])
    nb.link(bump.outputs["Normal"], bsdf.inputs["Normal"])
    nb.link(bsdf.outputs[0], out.inputs["Surface"])
    return mat


def append_station(iss_path):
    with bpy.data.libraries.load(str(iss_path), link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n == "panel_04_s"]
    iss = dst.objects[0]
    iss.name = "station"
    collection("Station").objects.link(iss)
    iss.parent = None

    verts = np.empty(len(iss.data.vertices) * 3, dtype=np.float32)
    iss.data.vertices.foreach_get("co", verts)
    verts = verts.reshape(-1, 3)
    lo, hi = verts.min(0), verts.max(0)
    center = Vector(((lo + hi) / 2).tolist())
    xy = verts[:, :2] - verts[:, :2].mean(0)
    evals, evecs = np.linalg.eigh(np.cov(xy.T))
    truss = Vector((evecs[0, 1], evecs[1, 1], 0.0)).normalized()

    local = Matrix((truss, Vector((0, 0, 1)).cross(truss), Vector((0, 0, 1)))).transposed()
    target = Matrix((
        Vector(shots.STATION["truss_axis"]).normalized(),
        Vector(shots.STATION["depth_axis"]).normalized().cross(Vector(shots.STATION["truss_axis"]).normalized()),
        Vector(shots.STATION["depth_axis"]).normalized(),
    )).transposed()
    rotation = (target @ local.inverted()).to_4x4()
    spin = Matrix.Rotation(math.radians(shots.STATION["roll"]), 4, Vector(shots.STATION["depth_axis"]).normalized())
    scale = Matrix.Scale(shots.STATION["scale"], 4)
    iss.matrix_world = Matrix.Translation(shots.STATION["center"]) @ spin @ rotation @ scale @ Matrix.Translation(-center)
    animate_station(iss)
    return iss


def animate_station(iss):
    rest = iss.matrix_world.copy()
    axis = shots.orbit_axis()
    iss.rotation_mode = "QUATERNION"
    for frame in range(1, shots.last_frame() + 1):
        lift = Matrix.Translation(shots.station_offset(frame))
        location, rotation, _scale = (Matrix.Rotation(shots.station_angle(frame), 4, axis) @ lift @ rest).decompose()
        iss.location = location
        iss.rotation_quaternion = rotation
        iss.keyframe_insert("location", frame=frame)
        iss.keyframe_insert("rotation_quaternion", frame=frame)


def spin_globe(objects, rest):
    axis = (rest.to_3x3() @ Vector((0.0, 0.0, 1.0))).normalized()
    for ob in objects:
        ob.rotation_mode = "QUATERNION"
    for frame in range(1, shots.last_frame() + 1):
        turn = (Matrix.Rotation(shots.earth_angle(frame), 3, axis) @ rest.to_3x3()).to_quaternion()
        for ob in objects:
            ob.rotation_quaternion = turn
            ob.keyframe_insert("rotation_quaternion", frame=frame)


def build_sun():
    data = bpy.data.lights.new("sun", "SUN")
    data.energy = shots.SUN["strength"]
    data.angle = math.radians(0.54)
    data.use_shadow_jitter = True
    data.color = shots.SUN["color"]
    sun = bpy.data.objects.new("sun", data)
    collection("Rig").objects.link(sun)
    toward = Vector(shots.SUN["toward"]).normalized()
    sun.rotation_mode = "QUATERNION"
    sun.rotation_quaternion = toward.to_track_quat("Z", "Y")
    sun.location = (0, 0, 0)
    return sun


def sphere(name, radius, segments=192, rings=96):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=radius, location=(0, 0, 0))
    ob = bpy.context.active_object
    ob.name = name
    ob.data.name = name
    for poly in ob.data.polygons:
        poly.use_smooth = True
    move_to(ob, collection("Earth"))
    return ob


def sun_factor(nb, sun, radius):
    coords = nb.node("ShaderNodeTexCoord")
    coords.object = sun
    split = nb.node("ShaderNodeSeparateXYZ")
    nb.link(coords.outputs["Object"], split.inputs[0])
    return nb.math("DIVIDE", split.outputs["Z"], radius)


def earth_shell(name, radius, rotation):
    ob = sphere(name, radius)
    geo.normalize_uv(ob.data)
    ob.matrix_world = rotation
    return ob


def build_earth(sun):
    probe = sphere("earth", EARTH_RADIUS)
    geo.normalize_uv(probe.data)
    lat, lon = shots.EARTH["face"]
    rotation = geo.facing_rotation(probe.data, lat, lon, shots.EARTH["toward"], shots.EARTH["north_tilt"])
    probe.matrix_world = rotation
    earth = probe

    mat = fresh_material("earth_surface")
    nb = NodeBuilder(mat.node_tree)
    out = nb.node("ShaderNodeOutputMaterial")
    uv = nb.node("ShaderNodeTexCoord").outputs["UV"]
    water = nb.texture(image("earth_water.png", "Non-Color"), uv)
    night = nb.texture(image("earth_night.jpg"), uv)
    day = nb.texture(image("earth_day.jpg"), uv)
    light = sun_factor(nb, sun, EARTH_RADIUS)

    vivid = nb.node("ShaderNodeHueSaturation", Saturation=1.12, Value=1.22)
    nb.link(day, vivid.inputs["Color"])
    ocean = nb.mix_color(nb.math("MULTIPLY", water, 0.35), vivid.outputs["Color"], (0.015, 0.06, 0.15, 1), "MIX")
    facing = nb.node("ShaderNodeLayerWeight", Blend=0.5).outputs["Facing"]
    haze = nb.math("MULTIPLY", nb.math("POWER", facing, 2.4), 0.66)
    base = nb.mix_color(haze, ocean, (0.2, 0.42, 0.85, 1), "MIX")

    lamp = nb.node("ShaderNodeGamma", Gamma=2.1)
    nb.link(night, lamp.inputs["Color"])
    warm = nb.mix_color(1.0, lamp.outputs[0], (1.0, 0.7, 0.42, 1), "MULTIPLY")
    dark = nb.map_range(light, 0.05, -0.2, 0.0, 1.0, smooth=True)

    bsdf = nb.node("ShaderNodeBsdfPrincipled", Metallic=0.0)
    nb.link(base, bsdf.inputs["Base Color"])
    nb.link(nb.map_range(water, 0, 1, 0.86, 0.22), bsdf.inputs["Roughness"])
    nb.link(nb.map_range(water, 0, 1, 0.12, 0.95), bsdf.inputs["Specular IOR Level"])
    nb.link(warm, bsdf.inputs["Emission Color"])
    nb.link(nb.math("MULTIPLY", dark, shots.EARTH["city_lights"]), bsdf.inputs["Emission Strength"])
    nb.link(bsdf.outputs[0], out.inputs["Surface"])
    earth.data.materials.append(mat)

    clouds = earth_shell("clouds", EARTH_RADIUS * 1.0045, rotation)
    mat = fresh_material("earth_clouds")
    nb = NodeBuilder(mat.node_tree)
    out = nb.node("ShaderNodeOutputMaterial")
    uv = nb.node("ShaderNodeTexCoord").outputs["UV"]
    cover = nb.map_range(nb.texture(image("earth_clouds.jpg", "Non-Color"), uv), 0.1, 0.85, 0.0, 0.96)
    bsdf = nb.node("ShaderNodeBsdfPrincipled", Roughness=0.95)
    bsdf.inputs["Base Color"].default_value = (0.92, 0.93, 0.95, 1)
    bsdf.inputs["Specular IOR Level"].default_value = 0.05
    clear = nb.node("ShaderNodeBsdfTransparent")
    mix = nb.node("ShaderNodeMixShader")
    nb.link(cover, mix.inputs[0])
    nb.link(clear.outputs[0], mix.inputs[1])
    nb.link(bsdf.outputs[0], mix.inputs[2])
    nb.link(mix.outputs[0], out.inputs["Surface"])
    mat.surface_render_method = "DITHERED"
    mat.use_transparent_shadow = True
    clouds.data.materials.append(mat)

    shell_radius = EARTH_RADIUS * 1.028
    atmosphere = earth_shell("atmosphere", shell_radius, rotation)
    atmosphere.visible_shadow = False
    atmosphere.visible_diffuse = False
    atmosphere.visible_glossy = False
    mat = fresh_material("earth_atmosphere")
    nb = NodeBuilder(mat.node_tree)
    out = nb.node("ShaderNodeOutputMaterial")
    facing = nb.node("ShaderNodeLayerWeight", Blend=0.38).outputs["Facing"]
    rim = nb.math("POWER", facing, 2.8)
    sunside = sun_factor(nb, sun, shell_radius)
    lit = nb.map_range(sunside, -0.35, 0.55, 0.04, 1.0, smooth=True)
    dusk = nb.map_range(nb.math("ABSOLUTE", nb.math("SUBTRACT", sunside, 0.02)), 0.0, 0.22, 1.0, 0.0, smooth=True)
    front = nb.math("SUBTRACT", 1.0, nb.node("ShaderNodeNewGeometry").outputs["Backfacing"])
    glow = nb.math("MULTIPLY", nb.math("MULTIPLY", rim, lit), nb.math("MULTIPLY", front, shots.EARTH["atmosphere"]))
    emission = nb.node("ShaderNodeEmission")
    nb.link(nb.mix_color(dusk, (0.3, 0.58, 1.0, 1), (1.0, 0.46, 0.2, 1), "MIX"), emission.inputs["Color"])
    nb.link(glow, emission.inputs["Strength"])
    add = nb.node("ShaderNodeAddShader")
    nb.link(nb.node("ShaderNodeBsdfTransparent").outputs[0], add.inputs[0])
    nb.link(emission.outputs[0], add.inputs[1])
    nb.link(add.outputs[0], out.inputs["Surface"])
    mat.surface_render_method = "BLENDED"
    mat.use_backface_culling = True
    atmosphere.data.materials.append(mat)
    spin_globe((earth, clouds), rotation)


def build_world():
    world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.color = (0.0, 0.0, 0.0)
    if world.node_tree is None:
        world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    nb = NodeBuilder(nt)
    out = nb.node("ShaderNodeOutputWorld")
    direction = nb.node("ShaderNodeTexCoord").outputs["Generated"]

    def stars(scale, size, threshold, gain):
        cells = nb.node("ShaderNodeTexVoronoi", Scale=scale, Randomness=1.0)
        cells.voronoi_dimensions = "3D"
        nb.link(direction, cells.inputs["Vector"])
        core = nb.map_range(cells.outputs["Distance"], 0.0, size, 1.0, 0.0, smooth=True)
        pick = nb.node("ShaderNodeSeparateColor")
        nb.link(cells.outputs["Color"], pick.inputs[0])
        bright = nb.map_range(pick.outputs[0], threshold, 1.0, 0.0, gain)
        return nb.math("MULTIPLY", nb.math("POWER", core, 2.0), nb.math("POWER", bright, 1.6))

    field = nb.math("ADD", stars(220.0, 0.08, 0.7, 7.0), stars(640.0, 0.12, 0.74, 2.8))
    band = nb.node("ShaderNodeTexNoise", Scale=1.4, Detail=8.0, Roughness=0.66)
    nb.link(direction, band.inputs["Vector"])
    dust = nb.map_range(band.outputs["Fac"], 0.52, 0.8, 0.0, 0.012)
    haze = nb.mix_color(dust, (0, 0, 0, 1), (0.36, 0.42, 0.62, 1), "MIX")
    starlight = nb.node("ShaderNodeCombineColor")
    nb.link(field, starlight.inputs[0])
    nb.link(nb.math("MULTIPLY", field, 0.96), starlight.inputs[1])
    nb.link(nb.math("MULTIPLY", field, 0.9), starlight.inputs[2])
    sky = nb.mix_color(1.0, starlight.outputs[0], haze, "ADD")
    bg = nb.node("ShaderNodeBackground")
    nb.link(sky, bg.inputs["Color"])
    nb.link(nb.node("ShaderNodeLightPath").outputs["Is Camera Ray"], bg.inputs["Strength"])
    nb.link(bg.outputs[0], out.inputs["Surface"])


def build_lights():
    rig = collection("Rig")
    for spec in shots.LIGHTS:
        data = bpy.data.lights.new(spec["name"], spec["type"])
        data.energy = spec["power"]
        data.color = spec["color"]
        if spec["type"] == "AREA" and isinstance(spec["size"], tuple):
            data.shape = "RECTANGLE"
            data.size, data.size_y = spec["size"]
        elif spec["type"] == "AREA":
            data.shape = "DISK"
            data.size = spec["size"]
        else:
            data.shadow_soft_size = spec["size"]
        data.use_shadow_jitter = True
        data.volume_factor = spec.get("haze", 1.0)
        ob = bpy.data.objects.new(spec["name"], data)
        ob.visible_camera = False
        ob.visible_glossy = spec["type"] == "AREA"
        rig.objects.link(ob)
        ob.location = spec["pos"]
        if "aim" in spec:
            ob.rotation_mode = "QUATERNION"
            ob.rotation_quaternion = (Vector(spec["aim"]) - Vector(spec["pos"])).to_track_quat("-Z", "Y")
        ob["group"] = spec["group"]


def build_station_lights():
    rig = collection("Rig")
    station = collection("Station")
    for spec in shots.STATION_LIGHTS:
        data = bpy.data.lights.new(spec["name"], spec["type"])
        data.color = spec["color"]
        ob = bpy.data.objects.new(spec["name"], data)
        rig.objects.link(ob)
        if spec["type"] == "SUN":
            data.energy = spec["strength"]
            ob.rotation_mode = "QUATERNION"
            ob.rotation_quaternion = Vector(spec["toward"]).normalized().to_track_quat("Z", "Y")
        else:
            data.energy = spec["power"]
            data.shadow_soft_size = spec["size"]
            data.use_shadow = False
            ob.location = spec["pos"]
        ob.visible_camera = False
        ob.light_linking.receiver_collection = station


def polish_station():
    iss = bpy.data.objects["station"]
    seen = set()
    for slot in iss.material_slots:
        mat = slot.material
        if mat is None or mat.name in seen:
            continue
        seen.add(mat.name)
        bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None:
            continue
        name = mat.name.lower()
        metal, rough = bsdf.inputs["Metallic"], bsdf.inputs["Roughness"]
        if "foil" in name:
            rough.default_value = 0.22
        elif "shiny_panel" in name:
            metal.default_value = 0.35
            rough.default_value = 0.18
            bsdf.inputs["Coat Weight"].default_value = 0.6
        else:
            metal.default_value = min(metal.default_value, 0.12)
            rough.default_value = min(max(rough.default_value, 0.4), 0.7)
        base = bsdf.inputs["Base Color"]
        if base.is_linked:
            source = base.links[0].from_socket
            lift = mat.node_tree.nodes.new("ShaderNodeHueSaturation")
            lift.inputs["Value"].default_value = 1.15
            mat.node_tree.links.new(source, lift.inputs["Color"])
            mat.node_tree.links.new(lift.outputs["Color"], base)


def build_volume():
    (x0, y0, z0), (x1, y1, z1) = shots.VOLUME["bounds"]
    bpy.ops.mesh.primitive_cube_add(location=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    air = bpy.context.active_object
    air.name = "deck_air"
    air.dimensions = (x1 - x0, y1 - y0, z1 - z0)
    move_to(air, collection("Deck"))
    mat = fresh_material("deck_air")
    nb = NodeBuilder(mat.node_tree)
    out = nb.node("ShaderNodeOutputMaterial")
    volume = nb.node("ShaderNodeVolumePrincipled", Density=shots.VOLUME["density"], Anisotropy=shots.VOLUME["anisotropy"])
    volume.inputs["Color"].default_value = shots.VOLUME["color"] + (1.0,)
    nb.link(volume.outputs[0], out.inputs["Volume"])
    air.data.materials.append(mat)


def build_grade(scene):
    tree = bpy.data.node_groups.new("Etinuxia grade", "CompositorNodeTree")
    tree.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    layers = tree.nodes.new("CompositorNodeRLayers")
    glare = tree.nodes.new("CompositorNodeGlare")
    glare.inputs["Type"].default_value = "Bloom"
    glare.inputs["Quality"].default_value = "High"
    glare.inputs["Threshold"].default_value = shots.GRADE["threshold"]
    glare.inputs["Strength"].default_value = shots.GRADE["strength"]
    glare.inputs["Size"].default_value = shots.GRADE["size"]
    balance = tree.nodes.new("CompositorNodeColorBalance")
    colors = {s.name: s for s in balance.inputs if s.type == "RGBA"}
    colors["Lift"].default_value = shots.GRADE["lift"]
    colors["Gain"].default_value = shots.GRADE["gain"]
    output = tree.nodes.new("NodeGroupOutput")
    tree.links.new(layers.outputs["Image"], glare.inputs["Image"])
    tree.links.new(glare.outputs["Image"], balance.inputs["Image"])
    tree.links.new(balance.outputs["Image"], output.inputs["Image"])
    scene.compositing_node_group = tree
    scene.render.use_compositing = True


def key_exposure(scene):
    start, end = shots.dissolve_window()
    levels = shots.RENDER["exposure"]
    for frame, value in ((1, levels["orbit"]), (start, levels["orbit"]), (end, levels["deck"]), (shots.last_frame(), levels["deck"])):
        scene.view_settings.exposure = value
        scene.view_settings.keyframe_insert("exposure", frame=frame)


def build_camera():
    data = bpy.data.cameras.new("observer")
    data.sensor_width = 36
    data.clip_start = 0.5
    data.clip_end = 6000
    data.dof.use_dof = True
    cam = bpy.data.objects.new("observer", data)
    collection("Rig").objects.link(cam)
    bpy.context.scene.camera = cam
    cam.rotation_mode = "QUATERNION"
    bpy.context.preferences.edit.keyframe_new_interpolation_type = "LINEAR"
    for frame, pose in shots.bake():
        cam.location = pose["pos"]
        cam.rotation_quaternion = pose["rotation"]
        data.lens = pose["lens"]
        data.dof.focus_distance = pose["focus"]
        data.dof.aperture_fstop = pose["fstop"]
        cam.keyframe_insert("location", frame=frame)
        cam.keyframe_insert("rotation_quaternion", frame=frame)
        data.keyframe_insert("lens", frame=frame)
        data.dof.keyframe_insert("focus_distance", frame=frame)
        data.dof.keyframe_insert("aperture_fstop", frame=frame)
    return cam


def configure_eevee(scene):
    ee = scene.eevee
    ee.taa_render_samples = shots.RENDER["eevee_samples"]
    ee.use_shadows = True
    ee.shadow_ray_count = 2
    ee.shadow_step_count = 8
    ee.use_raytracing = True
    ee.ray_tracing_method = "SCREEN"
    ee.ray_tracing_options.resolution_scale = "2"
    ee.ray_tracing_options.trace_max_roughness = 0.55
    ee.use_fast_gi = True
    ee.fast_gi_method = "GLOBAL_ILLUMINATION"
    ee.fast_gi_distance = 60.0
    ee.clamp_surface_indirect = 12.0
    ee.motion_blur_steps = 1
    ee.use_volumetric_shadows = True
    ee.volumetric_tile_size = "8"
    ee.volumetric_samples = 64
    ee.volumetric_shadow_samples = 16
    ee.use_volume_custom_range = True
    ee.volumetric_start = 1.0
    ee.volumetric_end = 700.0


def configure_cycles(scene):
    cy = scene.cycles
    cy.device = "GPU"
    cy.samples = shots.RENDER["cycles_samples"]
    cy.use_adaptive_sampling = True
    cy.adaptive_threshold = shots.RENDER["noise_threshold"]
    cy.use_denoising = True
    cy.denoiser = "OPENIMAGEDENOISE"
    cy.max_bounces = 8
    cy.diffuse_bounces = 3
    cy.glossy_bounces = 3
    cy.transmission_bounces = 4
    cy.transparent_max_bounces = 16
    cy.caustics_reflective = False
    cy.caustics_refractive = False
    cy.sample_clamp_indirect = 8.0
    scene.render.use_persistent_data = True


def configure_render():
    scene = bpy.context.scene
    configure_cycles(scene)
    configure_eevee(scene)
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.use_motion_blur = True
    scene.render.motion_blur_shutter = 0.5
    scene.render.film_transparent = False
    scene.render.resolution_x = shots.RENDER["width"]
    scene.render.resolution_y = shots.RENDER["height"]
    scene.render.resolution_percentage = 100
    scene.render.fps = shots.FPS
    scene.frame_start = 1
    scene.frame_end = shots.last_frame()
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Punchy"
    key_exposure(scene)
    build_grade(scene)


def main():
    iss_path, out_path = arguments()
    bpy.context.preferences.edit.keyframe_new_interpolation_type = "LINEAR"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    clean_deck()
    build_deck()
    append_station(iss_path)
    sun = build_sun()
    build_earth(sun)
    build_world()
    build_lights()
    build_station_lights()
    polish_station()
    build_volume()
    build_camera()
    configure_render()
    for img in bpy.data.images:
        if img.source == "FILE" and img.packed_file is None and img.filepath:
            img.pack()
    bpy.ops.wm.save_as_mainfile(filepath=str(out_path), compress=True)


main()
