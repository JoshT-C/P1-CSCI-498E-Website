"""
Shared helpers for the room build.

Everything is authored in *three.js* convention — metres, +y up, +z toward
the viewer — and converted to Blender's Z-up at the point of creation by
P(). That keeps the numbers here identical to the ones the runtime and the
camera path use, so a position read off a script is a position in the site.
"""
import math

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector


def P(x, y, z):
    """three.js (x, y-up, z-toward-viewer) -> Blender (x, y-back, z-up)."""
    return Vector((x, -z, y))


def yaw(rad):
    """A rotation about the up axis, in three.js sense (+ turns +z toward +x)."""
    return Euler((0.0, 0.0, rad), 'XYZ')


# ── collections ──────────────────────────────────────────────────────────
# Objects land in one of three collections, which decide their fate:
#   baked   — static; lighting baked into the shared atlas, exported unlit
#   live    — driven at runtime (screens, CRT glass, LEDs); own materials
#   helpers — anchors and hitboxes; exported as empties / invisible boxes
COLLECTIONS = ('baked', 'live', 'helpers')


def collection(name):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    return col


def link(obj, col='baked'):
    for c in obj.users_collection:
        c.objects.unlink(obj)
    collection(col).objects.link(obj)
    return obj


def new_object(name, mesh, col='baked'):
    obj = bpy.data.objects.new(name, mesh)
    collection(col).objects.link(obj)
    return obj


# ── primitives ───────────────────────────────────────────────────────────
def box(name, size, at, mat=None, col='baked', bevel=0.0, segments=2, rot=None):
    """An axis-aligned box. size/at in three.js convention (w, h, d)."""
    w, h, d = size
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((w, d, h)), verts=bm.verts)
    bm.to_mesh(mesh)
    bm.free()
    obj = new_object(name, mesh, col)
    obj.location = P(*at)
    if rot is not None:
        obj.rotation_euler = rot
    if mat is not None:
        obj.data.materials.append(mat)
    if bevel > 0:
        add_bevel(obj, bevel, segments)
    return obj


def cylinder(name, radius, depth, at, mat=None, col='baked', verts=32, axis='y', bevel=0.0):
    """A cylinder whose axis is three.js `axis`."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=radius, radius2=radius, depth=depth)
    bm.to_mesh(mesh)
    bm.free()
    obj = new_object(name, mesh, col)
    obj.location = P(*at)
    # Blender cone is along its local Z (= three y). Rotate for x / z axes.
    if axis == 'x':
        obj.rotation_euler = Euler((0, math.pi / 2, 0))
    elif axis == 'z':
        obj.rotation_euler = Euler((math.pi / 2, 0, 0))
    if mat is not None:
        obj.data.materials.append(mat)
    if bevel > 0:
        add_bevel(obj, bevel, 2)
    return obj


def plane(name, size, at, normal='z', mat=None, col='baked', subdiv=0):
    """A rectangle facing three.js `normal` ('z' faces the viewer, 'x' faces +x, 'y' up)."""
    w, h = size
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bm.loops.layers.uv.new('UVMap')
    # calc_uvs: live planes (screens, the CRT, the whiteboard) show canvases
    bmesh.ops.create_grid(bm, x_segments=subdiv + 1, y_segments=subdiv + 1, size=0.5, calc_uvs=True)
    bmesh.ops.scale(bm, vec=Vector((w, h, 1)), verts=bm.verts)
    bm.to_mesh(mesh)
    bm.free()
    obj = new_object(name, mesh, col)
    obj.location = P(*at)
    # Blender grid lies in XY facing +Z (three +y). Stand it up as asked.
    if normal == 'z':
        obj.rotation_euler = Euler((math.pi / 2, 0, 0))          # faces -Y blender = +z three
    elif normal == '-z':
        obj.rotation_euler = Euler((-math.pi / 2, 0, 0))
    elif normal == 'x':
        obj.rotation_euler = Euler((math.pi / 2, 0, math.pi / 2))
    elif normal == '-x':
        obj.rotation_euler = Euler((math.pi / 2, 0, -math.pi / 2))
    elif normal == '-y':
        obj.rotation_euler = Euler((math.pi, 0, 0))
    if mat is not None:
        obj.data.materials.append(mat)
    return obj


def add_bevel(obj, width, segments=2):
    """Rounded edges: the single biggest tell between 'real object' and 'CG box'."""
    mod = obj.modifiers.new('bevel', 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.harden_normals = True
    obj.data.shade_smooth()
    wn = obj.modifiers.new('weighted', 'WEIGHTED_NORMAL')
    wn.keep_sharp = True
    return obj


def array(obj, count, offset, axis_three='x'):
    """Constant-offset array along a three.js axis."""
    mod = obj.modifiers.new('array', 'ARRAY')
    mod.count = count
    mod.use_relative_offset = False
    mod.use_constant_offset = True
    v = {'x': (offset, 0, 0), 'y': (0, 0, offset), 'z': (0, -offset, 0)}[axis_three]
    mod.constant_offset_displace = v
    return obj


def parent(child, par):
    """Parent keeping the child's world transform."""
    mw = child.matrix_world.copy()
    child.parent = par
    child.matrix_world = mw
    return child


def group(name, objects, at=(0, 0, 0), rot=0.0, col='baked'):
    """An empty that owns `objects`, placed and yawed as a unit. Children are
    authored around the origin; the group moves them into the room."""
    empty = bpy.data.objects.new(name, None)
    collection(col).objects.link(empty)
    for o in objects:
        o.parent = empty
    empty.location = P(*at)
    empty.rotation_euler = yaw(rot)
    return empty


def anchor(name, at, look=None, **props):
    """A named empty the runtime reads (camera targets, station framing)."""
    empty = bpy.data.objects.new(f'anchor_{name}', None)
    collection('helpers').objects.link(empty)
    empty.location = P(*at)
    empty.empty_display_size = 0.05
    for k, v in props.items():
        empty[k] = v
    if look is not None:
        empty['look'] = list(look)
    return empty


def hitbox(station, size, at, rot=0.0, item=None):
    obj = box(f'hit_{station}' + (f'_{item}' if item else ''), size, at, col='helpers')
    obj.rotation_euler = yaw(rot)
    obj['station'] = station
    if item:
        obj['item'] = item
    obj.display_type = 'WIRE'
    obj.hide_render = True
    return obj


def apply_all_modifiers(objs):
    for obj in objs:
        if obj.type != 'MESH' or not obj.modifiers:
            continue
        bpy.context.view_layer.objects.active = obj
        for m in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for name in COLLECTIONS:
        collection(name)


# ── shaped geometry ──────────────────────────────────────────────────────
def profile_extrude(name, profile, width, at=(0, 0, 0), mat=None, col='baked', bevel=0.0, segments=3):
    """Extrude a side silhouette, given as (z, y) points with the front at
    +z, across `width` along x, centred. The VT100 case, keyboard wedges and
    monitor stands all start as one of these."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    verts = [bm.verts.new(Vector((-width / 2, -z, y))) for z, y in profile]
    face = bm.faces.new(verts)
    ret = bmesh.ops.extrude_face_region(bm, geom=[face])
    moved = [e for e in ret['geom'] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=Vector((width, 0, 0)), verts=moved)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = new_object(name, mesh, col)
    obj.location = P(*at)
    if mat is not None:
        obj.data.materials.append(mat)
    if bevel > 0:
        add_bevel(obj, bevel, segments)
    return obj


def rounded_rect_points(w, h, r, seg=6):
    """Counter-clockwise outline of a rounded rectangle centred on 0."""
    pts = []
    r = min(r, w / 2 - 1e-4, h / 2 - 1e-4)
    corners = ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270))
    for cx, cy, start in corners:
        for i in range(seg + 1):
            a = math.radians(start + 90 * i / seg)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def frame_panel(name, outer, inner, radius_o, radius_i, depth, at, mat=None, col='baked', bevel=0.0, inner_offset=(0.0, 0.0)):
    """A flat plate with a rounded-rect opening, facing +z: bezels, whiteboard
    frames, monitor surrounds."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    o = rounded_rect_points(outer[0], outer[1], radius_o)
    i = rounded_rect_points(inner[0], inner[1], radius_i)
    ox, oy = inner_offset
    vo = [bm.verts.new(Vector((x, 0, y))) for x, y in o]
    vi = [bm.verts.new(Vector((x + ox, 0, y + oy))) for x, y in i]
    n = len(vo)
    for k in range(n):
        bm.faces.new((vo[k], vo[(k + 1) % n], vi[(k + 1) % n], vi[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = new_object(name, mesh, col)
    obj.location = P(*at)
    sol = obj.modifiers.new('solidify', 'SOLIDIFY')
    sol.thickness = depth
    sol.offset = 1.0
    if mat is not None:
        obj.data.materials.append(mat)
    if bevel > 0:
        add_bevel(obj, bevel, 2)
    return obj


def rounded_slab(name, w, h, d, r, at, mat=None, col='baked', seg=8, bevel=0.0):
    """A slab whose outline (w × h, facing +z) has rounded corners, extruded d
    deep: monitor bodies, gateway, mini-PC fronts, keycaps."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    pts = rounded_rect_points(w, h, r, seg)
    verts = [bm.verts.new(Vector((x, d / 2, y))) for x, y in pts]
    face = bm.faces.new(verts)
    ret = bmesh.ops.extrude_face_region(bm, geom=[face])
    moved = [e for e in ret['geom'] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=Vector((0, -d, 0)), verts=moved)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = new_object(name, mesh, col)
    obj.location = P(*at)
    if mat is not None:
        obj.data.materials.append(mat)
    if bevel > 0:
        add_bevel(obj, bevel, 2)
    return obj


def join(name, objs, col=None):
    """Apply modifiers and merge into one object (fewer draw calls, one UV
    island set). Keeps the first object's collection unless `col` is given."""
    objs = [o for o in objs if o is not None]
    apply_all_modifiers(objs)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    out = bpy.context.view_layer.objects.active
    out.name = name
    out.data.name = name
    if col:
        link(out, col)
    return out
