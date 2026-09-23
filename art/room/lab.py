"""The homelab corner under the left wing: the open-frame rack and what the
photos show in it, the NZXT tower beside it, and the Thelio Mira under the
right wing. Everything unbranded — same shapes, ports, LEDs and badge
positions, no marks.

Rack contents, top to bottom:
  1U  24-port PoE switch (grey), port LEDs, two SFP cages
  1U  24-keystone patch panel, white label strip, short patch leads
  --  shelf: 10G SFP switch + the white gateway with its blue display
  --  shelf: silver mini PC (label tape: SERVER DO NOT TOUCH) + two black
      mini PCs with ring-lit power buttons
  --  shelf: the MS-02 Ultra on its side, grille out
  --  floor: 4-bay drive enclosure + tower UPS
"""
import math

import bpy

import lib
from lib import P, anchor, box, cylinder, group, hitbox, join, rounded_slab
from layout import NZXT, RACK, THELIO

U = 0.04445
RW = 0.54          # outer width
IW = 0.482         # between the rails (19")
RD = 0.44          # depth
RH = 0.71          # height (≈15U with base and top)


def _label_tape(pal, name, text, w, at):
    """Label-maker tape stuck on a front face (facing +z before the group
    turns it). The runtime prints `label` onto it; the bake sees a strip."""
    tape = lib.plane(name, (w, 0.012), at, normal='z', mat=pal['plastic_white'], col='live')
    tape['label'] = text
    return tape


def rack_frame(pal):
    parts = []
    post = 0.03
    for sx in (-1, 1):
        for sz in (-1, 1):
            parts.append(box(f'rk_post_{sx}{sz}', (post, RH, post), (sx * (RW / 2 - post / 2), RH / 2, sz * (RD / 2 - post / 2)), pal['steel'], bevel=0.002))
    # front rack rails with the unit holes
    for sx in (-1, 1):
        rail = box(f'rk_rail_{sx}', (0.018, RH - 0.06, 0.004), (sx * (IW / 2 + 0.009), RH / 2, RD / 2 + 0.002), pal['steel'], bevel=0.001)
        parts.append(rail)
        for i in range(int((RH - 0.08) / U) * 3):
            parts.append(box(f'rk_hole_{sx}_{i}', (0.0065, 0.0065, 0.001), (sx * (IW / 2 + 0.009), 0.045 + i * U / 3, RD / 2 + 0.0045), pal['port']))
    # top frame with a front lip; base frame
    parts.append(box('rk_top', (RW, 0.02, RD), (0, RH - 0.01, 0), pal['steel'], bevel=0.003))
    parts.append(box('rk_top_lip', (RW, 0.045, 0.012), (0, RH - 0.035, RD / 2 - 0.006), pal['steel'], bevel=0.003))
    for sz in (-1, 1):
        parts.append(box(f'rk_base_{sz}', (RW, 0.03, 0.04), (0, 0.015, sz * (RD / 2 - 0.02)), pal['steel'], bevel=0.003))
    return join('rack_frame', parts)


def shelf(pal, name, y):
    return box(name, (IW, 0.006, RD - 0.06), (0, y, 0.0), pal['steel'], bevel=0.0015)


def poe_switch(pal, y):
    """1U grey switch: 24 RJ45 in two blocks, console + USB on the left, SFP on the right."""
    parts = [box('sw_body', (IW + 0.02, U - 0.002, 0.3), (0, y, RD / 2 - 0.15), pal['switch_grey'], bevel=0.002)]
    fz = RD / 2 + 0.0005
    leds = []
    for block in range(2):
        for r in range(2):
            for c in range(6):
                x = -0.02 + block * 0.1 + c * 0.0155
                parts.append(box(f'sw_port_{block}{r}{c}', (0.012, 0.01, 0.002), (x, y - 0.006 + r * 0.013, fz), pal['port']))
                if r == 0:
                    leds.append(box(f'sw_led_{block}{c}', (0.004, 0.0018, 0.001), (x, y + 0.0165, fz + 0.001), pal['led_amber'] if (block + c) % 3 else pal['led_green'], col='live'))
    for i in range(2):
        parts.append(box(f'sw_sfp_{i}', (0.014, 0.012, 0.002), (0.19 + i * 0.022, y, fz), pal['port_metal']))
        parts.append(box(f'sw_usb_{i}', (0.012, 0.005, 0.002), (-0.19 + i * 0.016, y + 0.004, fz), pal['port']))
    body = join('switch_24', parts)
    for i, l in enumerate(leds):
        l.name = f'led_switch_{i}'
    return [body] + leds


def patch_panel(pal, y):
    parts = [box('pp_body', (IW + 0.02, U - 0.004, 0.04), (0, y, RD / 2 - 0.02), pal['steel'], bevel=0.0015)]
    fz = RD / 2 + 0.0005
    for i in range(24):
        x = -0.21 + i * 0.0183
        parts.append(box(f'pp_jack_{i}', (0.013, 0.012, 0.002), (x, y - 0.004, fz), pal['port']))
        parts.append(box(f'pp_lbl_{i}', (0.013, 0.006, 0.001), (x, y + 0.011, fz), pal['plastic_white']))
    body = join('patch_panel', parts)
    # translucent-yellow patch leads from the first eight jacks down to the
    # 10G switch's cages on the network shelf — they end at the cages
    # (y of the shelf + cage centre), never below the shelf
    leads = []
    for i in range(8):
        x = -0.21 + i * 0.0183
        cage_x = -0.2 + i * 0.019
        cage_y = SHELF_Y['net'] + 0.003 + 0.014
        cage_z = RD / 2 - 0.029
        pts = [P(x, y - 0.004, fz + 0.005), P(x, y - 0.018, fz + 0.035), P(cage_x, cage_y + 0.02, cage_z + 0.04), P(cage_x, cage_y, cage_z + 0.004)]
        curve = bpy.data.curves.new(f'lead_{i}', 'CURVE')
        curve.dimensions = '3D'
        curve.bevel_depth = 0.0028
        curve.bevel_resolution = 2
        sp = curve.splines.new('BEZIER')
        sp.bezier_points.add(len(pts) - 1)
        for bp, p in zip(sp.bezier_points, pts):
            bp.co = p
            bp.handle_left_type = bp.handle_right_type = 'AUTO'
        obj = bpy.data.objects.new(f'lead_{i}', curve)
        lib.collection('baked').objects.link(obj)
        obj.data.materials.append(pal['cable_yellow'])
        bpy.ops.object.select_all(action='DESELECT')
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.convert(target='MESH')
        leads.append(obj)
    return [body, join('patch_leads', leads)]


def shelf_network(pal, y):
    """10G SFP switch (black, green link lights) + the white gateway."""
    sw = box('tenG_body', (0.2, 0.028, 0.14), (-0.13, y + 0.014, RD / 2 - 0.1), pal['plastic_black'], bevel=0.003)
    cages = [box(f'tenG_sfp_{i}', (0.014, 0.011, 0.002), (-0.2 + i * 0.019, y + 0.014, RD / 2 - 0.029), pal['port_metal']) for i in range(8)]
    leds = [box(f'led_tenG_{i}', (0.003, 0.003, 0.001), (-0.2 + i * 0.019, y + 0.024, RD / 2 - 0.028), pal['led_green'], col='live') for i in range(4)]
    gw = rounded_slab('gateway_body', 0.2, 0.045, 0.14, 0.012, (0.11, y + 0.0225, RD / 2 - 0.09), pal['plastic_white'], bevel=0.004)
    gw_lcd = rounded_slab('gateway_lcd', 0.032, 0.012, 0.002, 0.005, (0.11, y + 0.024, RD / 2 - 0.019), pal['led_blue'], col='live')
    gw_lcd.name = 'led_gateway'
    return [join('tenG', [sw] + cages), gw, gw_lcd] + leds


def shelf_minis(pal, y):
    out = []
    silver = rounded_slab('mini_silver', 0.13, 0.05, 0.13, 0.006, (-0.165, y + 0.025, RD / 2 - 0.08), pal['alu_silver'], bevel=0.003)
    out.append(silver)
    out.append(box('led_mini_silver', (0.005, 0.005, 0.001), (-0.2, y + 0.022, RD / 2 - 0.0145), pal['led_blue'], col='live'))
    out.append(_label_tape(pal, 'tape_do_not_touch', 'SERVER DO NOT TOUCH', 0.1, (-0.165, y + 0.041, RD / 2 - 0.0145)))
    for k, x in enumerate((-0.01, 0.145)):
        body = rounded_slab(f'mini_black_{k}', 0.13, 0.05, 0.13, 0.008, (x, y + 0.025, RD / 2 - 0.08), pal['plastic_black'], bevel=0.003)
        ring = cylinder(f'led_mini_ring_{k}', 0.006, 0.002, (x - 0.035, y + 0.025, RD / 2 - 0.0145), pal['led_white'], axis='z', verts=24, col='live')
        usb = [box(f'mini_usb_{k}_{j}', (0.009, 0.004, 0.001), (x + 0.01 + j * 0.013, y + 0.025, RD / 2 - 0.0148), pal['port']) for j in range(3)]
        out.append(join(f'mini_black_{k}', [body] + usb))
        out.append(ring)
    return out


def ms02_ultra(pal, y):
    """Minisforum MS-02 Ultra, lying on its side: slate anodised aluminium,
    rounded long edges, diagonal-slat front grille with a port strip,
    honeycomb perforation bands on the (now upward) side panel."""
    L, T, D = 0.30, 0.14, 0.28          # upright height becomes length along x
    cx = -0.07
    body = rounded_slab('ms02_body', L, T, D, 0.018, (cx, y + T / 2, RD / 2 - 0.03 - D / 2), pal['alu_slate'], seg=10, bevel=0.002)
    fz = RD / 2 - 0.03 + 0.0006
    parts = [body]
    # front: port strip at one end, diagonal slats over the rest
    for j in range(5):
        parts.append(box(f'ms02_port_{j}', (0.004, 0.012 if j < 2 else 0.007, 0.001), (cx - L / 2 + 0.03 + j * 0.018, y + T / 2, fz), pal['port']))
    slats = []
    for i in range(26):
        s = box(f'ms02_slat_{i}', (0.0035, T * 1.15, 0.002), (cx - L / 2 + 0.09 + i * 0.0078, y + T / 2, fz), pal['mesh_grille'])
        s.rotation_euler = (0, 0.55, 0)
        slats.append(s)
    front = join('ms02_front', parts + slats)
    # side perforation (top face now): honeycomb as a dotted patch
    # on the port strip end, clear of the slats
    tape = _label_tape(pal, 'tape_rtxpro', 'rtxpro · ms-02 ultra', 0.075, (cx - L / 2 + 0.05, y + T - 0.022, fz + 0.001))
    perf = box('ms02_perf', (L * 0.55, 0.0008, D * 0.35), (cx + 0.02, y + T + 0.0004, RD / 2 - 0.03 - D * 0.35), pal['perforated'])
    return [front, perf, tape]


def shelf_bottom(pal):
    das = rounded_slab('das_body', 0.16, 0.2, 0.22, 0.01, (-0.13, 0.038 + 0.1, RD / 2 - 0.12), pal['plastic_black'], bevel=0.003)
    bays = [box(f'das_bay_{i}', (0.13, 0.036, 0.002), (-0.13, 0.066 + i * 0.043, RD / 2 - 0.0095), pal['bezel_black']) for i in range(4)]
    leds = [box(f'led_das_{i}', (0.003, 0.003, 0.001), (-0.07, 0.066 + i * 0.043, RD / 2 - 0.008), pal['led_blue'] if i != 2 else pal['led_red'], col='live') for i in range(4)]
    ups = rounded_slab('ups_body', 0.12, 0.26, 0.34, 0.008, (0.14, 0.038 + 0.13, RD / 2 - 0.17), pal['plastic_black'], bevel=0.004)
    ups_panel = box('ups_panel', (0.08, 0.1, 0.002), (0.14, 0.038 + 0.19, RD / 2 + 0.0005), pal['bezel_black'])
    ups_led = cylinder('led_ups', 0.005, 0.002, (0.14, 0.038 + 0.23, RD / 2 + 0.002), pal['led_white'], axis='z', verts=20, col='live')
    return [join('das', [das] + bays), join('ups', [ups, ups_panel]), ups_led] + leds


# Shelf heights (plate centres), top to bottom. Each gap is the tallest
# item below it plus a few millimetres, so nothing clips a shelf:
#   switch + patch panel   0.601 - 0.690
#   network shelf  0.537   gateway 45 mm
#   minis shelf    0.470   mini PCs 50 mm
#   MS-02 shelf    0.310   MS-02 on its side, 140 mm
#   floor plate    0.035   UPS 260 mm, drive enclosure 200 mm
SHELF_Y = dict(net=0.537, minis=0.470, ms02=0.310, floor=0.035)


def rack(pal):
    objs = [rack_frame(pal)]
    objs += poe_switch(pal, 0.69 - U / 2)
    objs += patch_panel(pal, 0.69 - U - U / 2)
    for name, y in SHELF_Y.items():
        objs.append(shelf(pal, f'shelf_{name}', y))
    objs += shelf_network(pal, SHELF_Y['net'] + 0.003)
    objs += shelf_minis(pal, SHELF_Y['minis'] + 0.003)
    objs += ms02_ultra(pal, SHELF_Y['ms02'] + 0.003)
    objs += shelf_bottom(pal)
    g = group('rack', objs, (RACK['x'], 0, RACK['z']), RACK['yaw'])
    hitbox('rack', (RD + 0.05, RH, RW + 0.4), (RACK['x'], RH / 2, RACK['z'] + 0.15))
    anchor('rack', (RACK['x'] + RD / 2, RH / 2, RACK['z'] + 0.12), look=(1, 0, 0), width=RW + 0.3, height=RH)
    return g


def nzxt(pal):
    """NZXT mid tower (the Arc B60 box): mesh front panel, side vent with the
    RGB glow showing through."""
    w, h, d = 0.227, 0.46, 0.44
    body = rounded_slab('nzxt_body', w, h, d, 0.006, (0, h / 2 + 0.01, 0), pal['plastic_black'], bevel=0.003)
    front = box('nzxt_mesh', (w - 0.03, h - 0.06, 0.002), (0, h / 2 + 0.01, d / 2 + 0.001), pal['perforated'])
    feet = [box(f'nzxt_foot_{i}', (0.03, 0.01, 0.1), (sx * 0.08, 0.005, sz * 0.15), pal['rubber']) for i, (sx, sz) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1)))]
    power = cylinder('led_nzxt_power', 0.004, 0.002, (w / 2 - 0.02, h + 0.011, d / 2 - 0.03), pal['led_white'], verts=16, col='live')
    tape = _label_tape(pal, 'tape_arcb60', 'arcb60 · arc b60', 0.12, (0, 0.06, d / 2 + 0.0035))
    return group('nzxt', [join('nzxt', [body, front] + feet), power, tape], (NZXT['x'], 0, NZXT['z']), NZXT['yaw'])


def thelio(pal):
    """Thelio Mira R4: matte black box, a walnut strip down the front-right
    edge, a vent grid low on the left side, power button top right."""
    w, h, d = 0.235, 0.44, 0.44
    body = rounded_slab('thelio_body', w, h, d, 0.01, (0, h / 2 + 0.008, 0), pal['plastic_black'], bevel=0.004)
    strip = box('thelio_walnut', (0.045, h - 0.004, 0.004), (w / 2 - 0.0225, h / 2 + 0.008, d / 2 + 0.002), pal['walnut'], bevel=0.0015)
    vent = box('thelio_vent', (0.002, 0.16, 0.2), (-w / 2 - 0.0005, 0.12, d / 2 - 0.14), pal['perforated'])
    feet = [box(f'thelio_foot_{i}', (0.03, 0.008, 0.06), (sx * 0.08, 0.004, sz * 0.16), pal['rubber']) for i, (sx, sz) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1)))]
    power = cylinder('led_thelio_power', 0.006, 0.003, (w / 2 - 0.07, h + 0.009, d / 2 - 0.04), pal['led_white'], verts=20, col='live')
    tape = _label_tape(pal, 'tape_thelio', 'thelio · rtx 5090', 0.12, (-0.03, 0.05, d / 2 + 0.0015))
    g = group('thelio', [join('thelio', [body, strip, vent] + feet), power, tape], (THELIO['x'], 0, THELIO['z']), THELIO['yaw'])
    return g


def _glow(name, color, watts, at, radius=0.03):
    """The soft halo an LED throws on nearby surfaces — in the photos the
    ring buttons and the gateway light up the whole shelf blue."""
    light = bpy.data.lights.new(name, 'POINT')
    light.color = color
    light.energy = watts
    light.shadow_soft_size = radius
    obj = bpy.data.objects.new(name, light)
    lib.collection('helpers').objects.link(obj)
    obj.location = P(*at)
    return obj


def build(pal):
    rack(pal)
    # rack-local points to world: the rack is yawed +90° (front faces +x)
    fx = RACK['x'] + RD / 2 + 0.03
    _glow('glow_minis', (0.35, 0.5, 1.0), 0.35, (fx, SHELF_Y['minis'] + 0.03, RACK['z'] - 0.02))
    _glow('glow_gateway', (0.3, 0.45, 1.0), 0.25, (fx, SHELF_Y['net'] + 0.03, RACK['z'] - 0.11))
    _glow('glow_das', (0.3, 0.45, 1.0), 0.15, (fx, 0.14, RACK['z'] + 0.07))
    _glow('glow_switch', (0.6, 0.8, 0.5), 0.08, (fx, RH - 0.06, RACK['z']))
    nzxt(pal)
    thelio(pal)
