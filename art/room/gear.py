"""Everything on the desk and walls: the VT100 and its keyboard, the two
modern monitors, the laptop on its stand, the black keyboard and mouse,
the crafting table on the hutch, the whiteboard frame and the
two flags.

Screens, the CRT glass and the whiteboard surface are 'live' objects: they
are lit sources in the bake (so the room glows the right colour) but the
runtime replaces their materials with its own canvases and shaders.
"""
import math

import bmesh
import bpy
from mathutils import Vector

import lib
from lib import P, box, cylinder, frame_panel, group, join, plane, profile_extrude, rounded_slab, anchor, hitbox
from layout import (DESK_TOP, FLAG_BLUE, FLAG_PRIDE, HUTCH, KEYBOARD_MAIN, LAPTOP, MONITOR_BIG, MONITOR_MID,
                    MOUSE, ROOM, VT100, VT100_KB, WHITEBOARD)

# VT100 proportions (≈46 × 36 × 50 cm), screen 12" 4:3.
VT = dict(w=0.46, h=0.36, d=0.5, sw=0.25, sh=0.19, rise=0.205, tilt=0.07, bevel=0.012)


def _face_z(y):
    return VT['d'] / 2 - y * math.tan(VT['tilt']) + VT['bevel']


def vt100(pal):
    d, h = VT['d'] / 2, VT['h']
    lean = h * math.tan(VT['tilt'])
    shell = profile_extrude('vt100_case', [(-d + 0.04, 0), (d, 0), (d - lean, h), (d - lean - 0.2, h + 0.004), (-d, h * 0.62), (-d, 0.02)],
                            VT['w'], mat=pal['abs_beige'], bevel=VT['bevel'], segments=4)
    fy = VT['rise']
    bezel = frame_panel('vt100_bezel', (VT['sw'] + 0.075, VT['sh'] + 0.065), (VT['sw'] - 0.004, VT['sh'] - 0.004), 0.02, 0.016, 0.009,
                        (0, fy, _face_z(fy) - 0.001), pal['abs_beige_dark'], bevel=0.0025)
    bezel.rotation_euler = (math.pi / 2 - VT['tilt'], 0, 0)
    bezel.rotation_euler = (VT['tilt'], 0, 0)
    vents = [box(f'vt_vent_{i}', (0.26, 0.004, 0.008), (0, h + 0.007, -0.04 - i * 0.02), pal['abs_beige_dark']) for i in range(9)]
    feet = [cylinder(f'vt_foot_{i}', 0.015, 0.008, (sx * 0.19, -0.004, sz * 0.2), pal['rubber']) for i, (sx, sz) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1)))]
    led = box('vt_power_led', (0.008, 0.005, 0.004), (VT['w'] / 2 - 0.05, 0.03, _face_z(0.03) + 0.002), pal['led_green'], col='live')
    trim = join('vt100_trim', [bezel] + vents + feet)

    # The tube: a bulged plane in front of the case face. Live: the runtime
    # puts the CRT shader on it; in the bake it glows phosphor green.
    glass = plane('crt_glass', (VT['sw'], VT['sh']), (0, fy, _face_z(fy) + 0.002), normal='z', mat=pal['crt_green'], col='live', subdiv=16)
    bm = bmesh.new()
    bm.from_mesh(glass.data)
    for v in bm.verts:
        nx, ny = v.co.x / (VT['sw'] / 2), v.co.y / (VT['sh'] / 2)
        v.co.z += 0.006 * (1 - nx * nx * 0.9) * (1 - ny * ny * 0.9)
    bm.to_mesh(glass.data)
    bm.free()
    glass.rotation_euler = (math.pi / 2 - VT['tilt'], 0, 0)

    unit = group('vt100', [shell, trim, glass, led], (VT100['x'], DESK_TOP, VT100['z']), VT100['yaw'])
    # The dive target: the glass centre, and the direction it faces.
    sin, cos = math.sin(VT100['yaw']), math.cos(VT100['yaw'])
    local_z = _face_z(fy) + 0.008
    anchor('screen', (VT100['x'] + sin * local_z, DESK_TOP + fy, VT100['z'] + cos * local_z), look=(sin, 0, cos), width=VT['sw'], height=VT['sh'])
    # the case and its keyboard, no further: a bigger box reached over the
    # laptop from the doorway and stole its clicks
    hitbox('terminal', (0.5, 0.42, 0.7), (VT100['x'] + 0.1, DESK_TOP + 0.21, VT100['z']), VT100['yaw'])
    return unit


def vt100_keyboard(pal):
    kd, kw = 0.2, 0.46
    wedge = profile_extrude('vt_kb_case', [(-kd / 2, 0), (kd / 2, 0), (kd / 2, 0.022), (-kd / 2, 0.052)], kw, mat=pal['abs_beige'], bevel=0.006)
    keys = []
    pitch = 0.0195
    tilt = math.atan2(0.03, kd)
    rows = [(0, 14), (0.5, 13), (0.75, 12), (1.25, 11)]
    left = -kw / 2 + 0.018
    for r, (off, n) in enumerate(rows):
        for i in range(n):
            keys.append(((off + i + 0.5) * pitch + left, r, 1.0, 'key_beige'))
        if r > 0:
            keys.append(((off - 0.55) * pitch + left, r, 1.0, 'key_brown'))
        keys.append(((off + n + 0.75) * pitch + left, r, 1.4, 'key_brown'))
    keys.append(((3 + 4) * pitch + left, 4, 8.0, 'key_beige'))
    for r in range(5):
        for c in range(4):
            keys.append(((16.7 + c) * pitch + left, r, 1.0, 'key_dark' if r == 0 else 'key_brown'))
    objs = []
    for i, (x, r, wmul, matname) in enumerate(keys):
        z = -kd / 2 + 0.045 + r * pitch
        y = 0.052 - ((z + kd / 2) / kd) * 0.03
        k = box(f'vt_key_{i}', (pitch * 0.84 * wmul + (wmul - 1) * pitch * 0.16, 0.011, pitch * 0.84), (x, y + 0.0055, z), pal[matname], bevel=0.0018)
        k.rotation_euler = (tilt, 0, 0)
        objs.append(k)
    kb_keys = join('vt_kb_keys', objs)
    return group('vt100_keyboard', [wedge, kb_keys], (VT100_KB['x'], DESK_TOP, VT100_KB['z']), VT100_KB['yaw'] + 0.03)


def _coil(name, points, turns, radius, wire, mat):
    """The coiled keyboard cord: a helix wound along a sagging path."""
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = wire
    curve.bevel_resolution = 2
    spline = curve.splines.new('POLY')
    steps = 700
    path = [Vector(p) for p in points]

    def at(t):
        seg = min(int(t * (len(path) - 1)), len(path) - 2)
        u = t * (len(path) - 1) - seg
        return path[seg].lerp(path[seg + 1], u), (path[seg + 1] - path[seg]).normalized()

    spline.points.add(steps)
    up = Vector((0, 0, 1))
    for i in range(steps + 1):
        t = i / steps
        p, tan = at(t)
        side = up.cross(tan).normalized()
        n = tan.cross(side).normalized()
        a = t * turns * math.tau
        q = p + side * math.cos(a) * radius + n * math.sin(a) * radius
        spline.points[i].co = (q.x, q.y, q.z, 1)
    obj = bpy.data.objects.new(name, curve)
    lib.collection('baked').objects.link(obj)
    obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    return obj


def monitor(pal, name, spec):
    """A modern flat panel: thin bezel, rear hump, neck and oval base."""
    diag_m = spec['diag'] * 0.0254
    w = diag_m * 16 / math.hypot(16, 9)
    h = diag_m * 9 / math.hypot(16, 9)
    cy = 0.2 + h / 2
    panel = rounded_slab(f'{name}_panel', w + 0.016, h + 0.03, 0.018, 0.004, (0, cy, 0), pal['plastic_black'], bevel=0.0015)
    hump = rounded_slab(f'{name}_hump', w * 0.55, h * 0.55, 0.035, 0.03, (0, cy - 0.02, -0.025), pal['plastic_black'], bevel=0.004)
    neck = box(f'{name}_neck', (0.05, cy - 0.03, 0.025), (0, (cy - 0.03) / 2 + 0.012, -0.06), pal['steel_satin'], bevel=0.004)
    base = rounded_slab(f'{name}_base', 0.26, 0.2, 0.012, 0.09, (0, 0.006, -0.03), pal['steel_satin'], bevel=0.003)
    base.rotation_euler = (0, 0, 0)
    base.rotation_euler = (0, 0, 0)
    base.data.transform(lib.Matrix.Rotation(math.pi / 2, 4, 'X'))
    body = join(f'{name}_body', [panel, hump, neck, base])
    screen = plane(f'screen_{name}', (w, h), (0, cy + 0.004, 0.0095), normal='z', mat=pal['screen_blue'], col='live')
    return group(name, [body, screen], (spec['x'], DESK_TOP, spec['z']), spec['yaw']), (w, h, cy)


def _empty(name, at=(0, 0, 0), rx=0.0, parent_obj=None):
    e = bpy.data.objects.new(name, None)
    lib.collection('baked').objects.link(e)
    e.location = P(*at)
    e.rotation_euler = (rx, 0, 0)
    if parent_obj is not None:
        e.parent = parent_obj
    return e


def laptop(pal):
    """The laptop on a folding aluminium riser, in the corner where the
    vertical monitor used to be. The lid pivots on a real hinge at the base's
    back edge (open 110°), and the screen sits on the lid's inner face.

    Rotations about x are identical in three.js and Blender (x is shared),
    so the hinge angles below read the same in both."""
    lw, ld = 0.358, 0.252            # 15.6" chassis
    bt, lt = 0.022, 0.007            # base and lid thickness
    tilt = 0.21                      # riser angle: back edge higher
    open_ = math.radians(110)

    # riser: foot plate on the desk, two side legs, tilted top plate
    foot = box('lstand_foot', (0.26, 0.006, 0.2), (0, 0.003, 0), pal['alu_silver'], bevel=0.002)
    legs = []
    for sx in (-1, 1):
        leg = profile_extrude(f'lstand_leg_{sx}', [(-0.09, 0.0), (0.09, 0.0), (0.09, 0.05), (-0.09, 0.11)], 0.008,
                              mat=pal['alu_silver'], bevel=0.0015)
        leg.location = P(sx * 0.12, 0.004, 0)
        legs.append(leg)
    stand_top = _empty('lstand_top', (0, 0.09, 0), rx=tilt)
    plate = box('lstand_plate', (0.29, 0.005, 0.24), (0, 0.0025, 0), pal['alu_silver'], bevel=0.002)
    plate.parent = stand_top
    lip = box('lstand_lip', (0.29, 0.02, 0.006), (0, 0.012, 0.12), pal['alu_silver'], bevel=0.002)
    lip.parent = stand_top

    # laptop base, resting on the plate
    root = _empty('laptop_root', (0, 0.005, 0.005), parent_obj=stand_top)
    base = rounded_slab('laptop_base', lw, ld, bt, 0.012, (0, bt / 2, 0), pal['plastic_black'], bevel=0.002)
    base.data.transform(lib.Matrix.Rotation(math.pi / 2, 4, 'X'))
    base.parent = root
    deck = box('laptop_deck', (lw - 0.03, 0.0008, ld * 0.55), (0, bt + 0.0004, -ld * 0.12), pal['bezel_black'])
    deck.parent = root
    pad = box('laptop_pad', (0.11, 0.0006, 0.07), (0, bt + 0.0003, ld * 0.3), pal['plastic_gloss'])
    pad.parent = root

    # hinge barrel along the back edge, and the lid pivoting on it
    barrel = cylinder('laptop_hinge', 0.006, lw - 0.06, (0, bt, -ld / 2 + 0.004), pal['plastic_black'], axis='x', verts=20)
    barrel.parent = root
    hinge = _empty('laptop_hinge_axis', (0, bt, -ld / 2 + 0.004), rx=-open_, parent_obj=root)
    lid = rounded_slab('laptop_lid', lw, ld, lt, 0.01, (0, lt / 2, ld / 2), pal['plastic_black'], bevel=0.0015)
    lid.data.transform(lib.Matrix.Rotation(math.pi / 2, 4, 'X'))
    lid.parent = hinge
    bezel = box('laptop_bezel', (lw - 0.012, 0.0006, ld - 0.012), (0, -0.0003, ld / 2), pal['bezel_black'])
    bezel.parent = hinge
    # the screen faces the lid's inside (-y when closed): toward the user once open
    screen = plane('screen_laptop', (lw - 0.024, ld - 0.04), (0, -0.0008, ld / 2 + 0.006), normal='-y',
                   mat=pal['screen_cool'], col='live')
    screen.parent = hinge

    g = group('laptop', [foot] + legs + [stand_top], (LAPTOP['x'], DESK_TOP, LAPTOP['z']), LAPTOP['yaw'])
    hitbox('laptop', (0.42, 0.45, 0.4), (LAPTOP['x'], DESK_TOP + 0.22, LAPTOP['z']), LAPTOP['yaw'])

    # anchor from the screen's real placement
    bpy.context.view_layer.update()
    mw = screen.matrix_world
    normal = (mw.to_3x3() @ Vector((0, 0, 1))).normalized()     # plane +Z in Blender
    c = mw.translation
    anchor('laptop', (c.x, c.z, -c.y), look=(round(normal.x, 5), round(normal.z, 5), round(-normal.y, 5)),
           width=lw - 0.024, height=ld - 0.04)
    return g


def main_keyboard(pal):
    kb = rounded_slab('kb_case', 0.44, 0.14, 0.03, 0.008, (0, 0.015, 0), pal['plastic_black'], bevel=0.002)
    kb.data.transform(lib.Matrix.Rotation(math.pi / 2, 4, 'X'))
    keys = []
    pitch = 0.019
    for r in range(6):
        n = 15 if r < 5 else 8
        for i in range(n):
            w = 1.0 if (r < 5) else (1.25 if i != 3 else 6.25)
            x = -0.2 + (i + 0.5) * pitch + (0 if r < 5 else i * 0.002)
            keys.append(box(f'mk_{r}_{i}', (pitch * 0.82 * w, 0.009, pitch * 0.82), (x if r < 5 else -0.2 + sum([1.25] * i) * pitch + pitch * 0.6, 0.034, -0.055 + r * pitch), pal['plastic_black'], bevel=0.0015))
    under = box('glow_keyboard', (0.42, 0.002, 0.12), (0, 0.031, 0), pal['underglow'], col='live')
    keys_j = join('kb_keys', keys)
    g = group('keyboard_main', [kb, keys_j, under], (KEYBOARD_MAIN['x'], DESK_TOP, KEYBOARD_MAIN['z']), KEYBOARD_MAIN['yaw'])
    mouse = rounded_slab('mouse', 0.065, 0.12, 0.035, 0.03, (MOUSE['x'], DESK_TOP + 0.018, MOUSE['z']), pal['plastic_black'], bevel=0.008)
    mouse.data.transform(lib.Matrix.Rotation(math.pi / 2, 4, 'X'))
    return g


def _pixel_image(name, rows):
    """A 16x16 image from rows of hex colours, top row first."""
    n = len(rows)
    img = bpy.data.images.new(name, n, n, alpha=False)
    px = []
    for row in reversed(rows):  # Blender images start at the bottom
        for c in row:
            px += _srgb(c) + [1.0]
    img.pixels = px
    img.pack()
    return img


def _wood(x, y, base, seam, seams=(4, 8, 12)):
    """Oak planks: horizontal seams, staggered butt joints, a little grain."""
    h = (x * 73 + y * 151 + x * y * 7) % 11
    if y in seams or (y // 4) % 2 == 0 and x == 7 or (y // 4) % 2 == 1 and x == 12:
        return seam
    return base[h % len(base)]


# a small palette for the crafting table, loosely after the game's
PLANK = ['#b8935a', '#a8844e', '#bf9b62', '#a17e49']
SEAM = '#735533'
FRAME = '#5c3f23'
IRON = ['#9b9b9b', '#c4c4c4', '#6d6d6d']
HANDLE = '#6b4a2a'


def _table_top():
    rows = []
    for y in range(16):
        row = []
        for x in range(16):
            if x in (0, 15) or y in (0, 15):
                row.append(FRAME)
            elif 2 <= x <= 13 and 2 <= y <= 13 and (x in (2, 6, 9, 13) or y in (2, 6, 9, 13)):
                row.append(SEAM)
            else:
                row.append(_wood(x, y, PLANK, SEAM, seams=()))
        rows.append(row)
    return rows


def _table_side(tools):
    rows = []
    for y in range(16):
        row = []
        for x in range(16):
            if y < 3:
                row.append(FRAME if y != 1 else SEAM)
            elif x in (0, 15):
                row.append(FRAME)
            else:
                row.append(_wood(x, y, PLANK, SEAM, seams=(7, 11)))
        rows.append(row)
    if tools:
        # a saw on the left: blade with a darker toothed edge, wooden grip
        for y in range(5, 13):
            edge = 5 - (y - 5) // 3          # the blade narrows to the tip
            for x in range(2, edge + 1):
                rows[y][x] = IRON[1] if x < edge else (IRON[2] if y % 2 else IRON[0])
        for y in range(3, 5):
            for x in range(2, 5):
                rows[y][x] = HANDLE
        # a hammer on the right: iron head across, handle down
        for x in range(9, 14):
            rows[5][x] = IRON[0]
            rows[6][x] = IRON[2]
        for y in range(7, 14):
            rows[y][11] = HANDLE
    return rows


def crafting_table(pal):
    """A Minecraft crafting table, the size of a desk ornament, on the hutch
    top: plank sides with the saw and hammer on the front, the 3x3 grid on
    top. Pixel textures sampled nearest, so the texels stay square."""
    import materials as M
    s = 0.2
    mats = {}
    for key, rows in (('top', _table_top()), ('front', _table_side(True)), ('side', _table_side(False))):
        mat = M.image_material(f'craft_{key}', _pixel_image(f'craft_{key}_img', rows), 0.85)
        for node in mat.node_tree.nodes:
            if node.type == 'TEX_IMAGE':
                node.interpolation = 'Closest'
        mats[key] = mat
    mesh = bpy.data.meshes.new('crafting_table')
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=s)
    uv = bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:
        n = f.normal
        if abs(n.z) > 0.5:
            axes, f.material_index = (lambda c: (c.x, c.y)), 0
        elif n.x > 0.5:
            axes, f.material_index = (lambda c: (c.y, c.z)), 1   # front, faces +x (the room)
        elif n.x < -0.5:
            axes, f.material_index = (lambda c: (-c.y, c.z)), 2
        else:
            axes, f.material_index = ((lambda c: (-c.x, c.z)) if n.y > 0 else (lambda c: (c.x, c.z))), 2
        for loop in f.loops:
            u, v = axes(loop.vert.co)
            loop[uv].uv = (u / s + 0.5, v / s + 0.5)
    bm.to_mesh(mesh)
    bm.free()
    obj = lib.new_object('crafting_table', mesh)
    for key in ('top', 'front', 'side'):
        obj.data.materials.append(mats[key])
    obj.location = P(ROOM['left_x'] + 0.13, HUTCH['top_y'] + 0.01 + s / 2, -1.3)
    obj.rotation_euler = (0, 0, 0.18)
    return obj


def _flag_image(name, w, h, painter):
    img = bpy.data.images.new(name, w, h, alpha=False)
    px = [0.0] * (w * h * 4)
    for y in range(h):
        for x in range(w):
            r, g, b = painter(x / w, 1 - y / h)
            i = (y * w + x) * 4
            px[i:i + 4] = (r, g, b, 1.0)
    img.pixels = px
    img.pack()
    return img


def _srgb(h):
    h = h.lstrip('#')
    return [((int(h[i:i + 2], 16) / 255 + 0.055) / 1.055) ** 2.4 for i in (0, 2, 4)]


def blue_cross(u, v):
    """White field, blue Nordic cross offset toward the hoist (18:11)."""
    # the flag's blue, lifted a little: AgX desaturates dark blues in a dim bake
    white, blue = _srgb('#f4f2ec'), _srgb('#2c5fb4')
    in_v = 5 / 18 <= u <= 8 / 18
    in_h = 4 / 11 <= v <= 7 / 11
    return blue if (in_v or in_h) else white


def progress_pride(u, v):
    """Progress Pride: six stripes, and at the hoist a chevron pointing
    toward the fly. Its bands, innermost first: white, pink, light blue,
    brown, black; the black band's outer edges start at the hoist corners."""
    stripes = ['#e40303', '#ff8c00', '#ffed00', '#008026', '#004dff', '#750787']
    chevrons = ['#ffffff', '#ffafc8', '#74d7ee', '#613915', '#000000']
    slope = 0.7                  # how far (in u) the tip leads the corners
    band = slope * 0.5 / len(chevrons)
    d = u + abs(v - 0.5) * slope  # constant along each chevron edge
    if d < band * len(chevrons):
        return _srgb(chevrons[int(d / band)])
    return _srgb(stripes[min(5, int(v * 6))])


def cloth(name, w, h, at, image, normal='z', folds=5, amp=0.02, droop=0.0):
    """A flag tacked to the wall: the top edge is pinned flat against it,
    and soft vertical folds open toward the hem. Folds only bulge outward
    (never into the wall), so the fabric sits on the plaster."""
    import materials as M
    obj = plane(name, (w, h), at, normal=normal, subdiv=40)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    uv = bm.loops.layers.uv.verify()
    for v in bm.verts:
        u = v.co.x / w + 0.5
        t = 0.5 - v.co.y / h
        # pinned along the top edge: folds open up toward the hem
        fold = 0.5 + 0.5 * math.sin(u * folds * math.tau)
        v.co.z += amp * fold * t ** 0.8 + droop * math.sin(u * math.pi) * t
    for f in bm.faces:
        for loop in f.loops:
            loop[uv].uv = (loop.vert.co.x / w + 0.5, loop.vert.co.y / h + 0.5)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.materials.append(M.image_material(f'{name}_mat', image, 0.9))
    obj.data.shade_smooth()
    sol = obj.modifiers.new('solidify', 'SOLIDIFY')
    sol.thickness = 0.002
    return obj


def flags(pal):
    """The blue-cross flag is tacked flat to the back wall at its corners
    and top centre; the pride flag is a desk flag on a stick, clipped to the
    hutch's front end post."""
    fb = FLAG_BLUE
    blue = _flag_image('flag_blue_img', 540, 330, blue_cross)
    cloth('flag_blue', fb['w'], fb['h'], (fb['x'], fb['y'], fb['z'] + 0.002), blue, 'z', folds=4, amp=0.012)
    pins = []
    for i, (px, py) in enumerate(((-0.5, 0.5), (0.0, 0.5), (0.5, 0.5), (-0.5, -0.5), (0.5, -0.5))):
        # corner pins sit just inside the fabric edge
        x = fb['x'] + px * (fb['w'] - 0.03)
        y = fb['y'] + py * (fb['h'] - 0.03)
        pins.append(cylinder(f'flag_pin_{i}', 0.0045, 0.006, (x, y, fb['z'] + 0.01), pal['mic_silver'], axis='z', verts=16, bevel=0.001))
    join('flag_pins', pins)

    pride = _flag_image('flag_pride_img', 300, 190, progress_pride)
    f = cloth('flag_pride', 0.3, 0.19, (0.155, 0.1, 0.0), pride, 'z', folds=2, amp=0.01)
    stick = cylinder('pride_stick', 0.004, 0.42, (0, 0.0, 0), pal['plastic_black'], verts=12)
    # a spring clip holding the stick against the post
    clip = box('pride_clip', (0.018, 0.03, 0.03), (0, -0.1, -0.013), pal['plastic_black'], bevel=0.003)
    # flies out over the desk (+x), angled a little toward the room
    return group('flag_pride_g', [f, stick, clip], (FLAG_PRIDE['x'], FLAG_PRIDE['y'], FLAG_PRIDE['z']), -0.35)


def whiteboard(pal):
    wb = WHITEBOARD
    frame = frame_panel('whiteboard_frame', (wb['w'] + 0.05, wb['h'] + 0.05), (wb['w'], wb['h']), 0.004, 0.002, 0.02, (0, 0, 0), pal['whiteboard_frame'], bevel=0.002)
    back = box('whiteboard_back', (wb['w'], wb['h'], 0.008), (0, 0, 0.004), pal['plastic_white'])
    tray = box('whiteboard_tray', (wb['w'] * 0.5, 0.012, 0.05), (0, -wb['h'] / 2 - 0.03, 0.03), pal['whiteboard_frame'], bevel=0.002)
    body = join('whiteboard_body', [frame, back, tray])
    surface = plane('whiteboard_surface', (wb['w'], wb['h']), (0, 0, 0.0095), normal='z', mat=pal['board'], col='live')
    g = group('whiteboard', [body, surface], (wb['x'], wb['y'], wb['z']), math.pi / 2)
    hitbox('whiteboard', (0.1, wb['h'] + 0.1, wb['w'] + 0.1), (wb['x'] + 0.05, wb['y'], wb['z']))
    anchor('whiteboard', (wb['x'] + 0.012, wb['y'], wb['z']), look=(1, 0, 0), width=wb['w'], height=wb['h'])
    return g


def build(pal):
    vt100(pal)
    vt100_keyboard(pal)
    # cord from the keyboard's back to under the case front (world space)
    kb_back = P(VT100_KB['x'] - 0.1, DESK_TOP + 0.02, VT100_KB['z'] + 0.16)
    case_front = P(VT100['x'] + 0.23, DESK_TOP + 0.02, VT100['z'] + 0.17)
    mid1 = P(VT100_KB['x'] - 0.16, DESK_TOP + 0.012, VT100_KB['z'] + 0.24)
    mid2 = P(VT100['x'] + 0.28, DESK_TOP + 0.012, VT100['z'] + 0.24)
    _coil('vt_cord', [kb_back, mid1, mid2, case_front], 34, 0.0065, 0.0019, pal['abs_beige'])

    _, mid = monitor(pal, 'monitor_mid', MONITOR_MID)
    _, big = monitor(pal, 'monitor_big', MONITOR_BIG)
    for name, spec, dims in (('mid', MONITOR_MID, mid), ('big', MONITOR_BIG, big)):
        w, h, cy = dims
        sin, cos = math.sin(spec['yaw']), math.cos(spec['yaw'])
        anchor(f'monitor_{name}', (spec['x'] + sin * 0.01, DESK_TOP + cy, spec['z'] + cos * 0.01), look=(sin, 0, cos), width=w, height=h)
    laptop(pal)
    main_keyboard(pal)
    crafting_table(pal)
    whiteboard(pal)
    flags(pal)
