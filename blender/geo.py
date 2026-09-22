import math

from mathutils import Matrix, Vector


def surface_direction(mesh, lat, lon):
    uv = mesh.uv_layers.active.data
    goal_u = (lon + 180.0) / 360.0
    goal_v = (lat + 90.0) / 180.0
    best = min(range(len(uv)), key=lambda i: (uv[i].uv.x - goal_u) ** 2 + (uv[i].uv.y - goal_v) ** 2)
    return mesh.vertices[mesh.loops[best].vertex_index].co.normalized()


def normalize_uv(mesh):
    uv = mesh.uv_layers.active.data
    if surface_direction(mesh, 0.0, 0.0).cross(surface_direction(mesh, 0.0, 90.0)).z < 0:
        for corner in uv:
            corner.uv.x = 1.0 - corner.uv.x
    if surface_direction(mesh, 80.0, 0.0).z < 0:
        for corner in uv:
            corner.uv.y = 1.0 - corner.uv.y


def basis(forward, up):
    f = forward.normalized()
    u = (up - f * up.dot(f)).normalized()
    return Matrix((f, u.cross(f), u)).transposed()


def facing_rotation(mesh, lat, lon, toward, tilt):
    local = basis(surface_direction(mesh, lat, lon), Vector((0.0, 0.0, 1.0)))
    toward = Vector(toward).normalized()
    north = Matrix.Rotation(math.radians(tilt), 3, toward) @ Vector((0.0, 0.0, 1.0))
    return (basis(toward, north) @ local.transposed()).to_4x4()


def surface_point(earth, lat, lon):
    return earth.matrix_world @ (surface_direction(earth.data, lat, lon) * earth.dimensions.x * 0.5 / earth.scale.x)
