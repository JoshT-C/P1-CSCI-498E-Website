"""The L-desk, its hutch and pegboard, and the small shelf unit beyond the
left wing — dark rustic-wood tops on black square-tube steel, as in the
wide shot."""
import bpy

import lib

from layout import DESK_T, DESK_TOP, FLOPPY_CUBBY, HUTCH, LEFT_WING, RIGHT_WING, ROOM, SIDE_SHELF
from lib import box, join
import materials as M


def _pegboard():
    """Black steel pegboard: a dot grid, done in the shader (400 holes of
    geometry would buy nothing once baked)."""
    mat = bpy.data.materials.new('pegboard')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1 / 0.025, 1 / 0.025, 1 / 0.025)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    vor = nt.nodes.new('ShaderNodeTexVoronoi')
    vor.voronoi_dimensions = '2D'
    vor.inputs['Randomness'].default_value = 0.0
    vor.inputs['Scale'].default_value = 1.0
    nt.links.new(mp.outputs['Vector'], vor.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.16
    ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1)
    ramp.color_ramp.elements[1].position = 0.18
    ramp.color_ramp.elements[1].color = (0.012, 0.012, 0.012, 1)
    nt.links.new(vor.outputs['Distance'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.5
    bsdf.inputs['Metallic'].default_value = 0.5
    return mat


def build(pal):
    top_y = DESK_TOP - DESK_T / 2
    lw, rw = LEFT_WING, RIGHT_WING

    # Tops: two slabs meeting in the corner, a slightly rounded front edge.
    left = box('top_left', (lw['x1'] - lw['x0'], DESK_T, lw['z1'] - lw['z0']),
               ((lw['x0'] + lw['x1']) / 2, top_y, (lw['z0'] + lw['z1']) / 2), pal['desk'], bevel=0.004)
    right = box('top_right', (rw['x1'] - rw['x0'], DESK_T, rw['z1'] - rw['z0']),
                ((rw['x0'] + rw['x1']) / 2, top_y, (rw['z0'] + rw['z1']) / 2), pal['desk'], bevel=0.004)
    join('desk_top', [left, right])

    # Frame: 35 mm square tube legs, a low stretcher and an under-top rail
    # on each wing, as in the photo.
    t = 0.035
    leg_h = DESK_TOP - DESK_T
    legs = []
    spots = [
        (lw['x0'] + 0.05, lw['z1'] - 0.05), (lw['x1'] - 0.05, lw['z1'] - 0.05),
        (lw['x0'] + 0.05, lw['z0'] + 0.05), (rw['x1'] - 0.05, rw['z0'] + 0.05),
        (rw['x1'] - 0.05, rw['z1'] - 0.05), (lw['x1'] - 0.05, rw['z1'] - 0.05),
    ]
    for i, (x, z) in enumerate(spots):
        legs.append(box(f'leg_{i}', (t, leg_h, t), (x, leg_h / 2, z), pal['steel'], bevel=0.002))
    # side stretchers (left wing ends, right wing end)
    legs.append(box('str_lw', (lw['x1'] - lw['x0'] - 0.1, 0.03, 0.02), ((lw['x0'] + lw['x1']) / 2, 0.12, lw['z1'] - 0.05), pal['steel'], bevel=0.002))
    legs.append(box('str_rw', (0.02, 0.03, rw['z1'] - rw['z0'] - 0.1), (rw['x1'] - 0.05, 0.12, (rw['z0'] + rw['z1']) / 2), pal['steel'], bevel=0.002))
    # under-top rails along the walls
    legs.append(box('rail_lw', (0.02, 0.04, lw['z1'] - lw['z0'] - 0.1), (lw['x0'] + 0.05, leg_h - 0.02, (lw['z0'] + lw['z1']) / 2), pal['steel'], bevel=0.002))
    legs.append(box('rail_rw', (rw['x1'] - lw['x0'] - 0.1, 0.04, 0.02), ((lw['x0'] + rw['x1']) / 2, leg_h - 0.02, rw['z0'] + 0.05), pal['steel'], bevel=0.002))
    join('desk_frame', legs)

    # ── hutch over the left wing ───────────────────────────────────────
    hx0 = ROOM['left_x']
    hx1 = hx0 + HUTCH['depth']
    hz0, hz1 = HUTCH['z0'], HUTCH['z1']
    hcx = (hx0 + hx1) / 2
    boards = [
        box('hutch_shelf', (HUTCH['depth'], 0.018, hz1 - hz0), (hcx, HUTCH['shelf_y'], (hz0 + hz1) / 2), pal['desk'], bevel=0.003),
        box('hutch_top', (HUTCH['depth'], 0.018, hz1 - hz0), (hcx, HUTCH['top_y'], (hz0 + hz1) / 2), pal['desk'], bevel=0.003),
    ]
    # cubby dividers between shelf and top
    for i, z in enumerate((hz0 + 0.02, -1.45, -0.98, -0.64, hz1 - 0.02)):
        boards.append(box(f'hutch_div_{i}', (HUTCH['depth'], HUTCH['top_y'] - HUTCH['shelf_y'], 0.016),
                          (hcx, (HUTCH['shelf_y'] + HUTCH['top_y']) / 2, z), pal['desk'], bevel=0.002))
    join('hutch_wood', boards)

    posts = []
    for i, z in enumerate((hz0 + 0.012, hz1 - 0.012)):
        posts.append(box(f'hutch_post_{i}', (0.022, HUTCH['top_y'] - DESK_TOP + 0.01, 0.022),
                         (hx1 - 0.015, (DESK_TOP + HUTCH['top_y']) / 2, z), pal['steel'], bevel=0.002))
        posts.append(box(f'hutch_post_back_{i}', (0.022, HUTCH['top_y'] - DESK_TOP + 0.01, 0.022),
                         (hx0 + 0.015, (DESK_TOP + HUTCH['top_y']) / 2, z), pal['steel'], bevel=0.002))
    join('hutch_frame', posts)

    # floppy riser: a wooden step at the back of the cubby
    fc = FLOPPY_CUBBY
    box('floppy_riser', (fc['riser_d'], fc['riser_h'], 0.3), (hx0 + fc['riser_d'] / 2, fc['y'] + fc['riser_h'] / 2, fc['z']),
        pal['desk'], bevel=0.003)
    lib.anchor('floppy_row0', (hx0 + fc['riser_d'] + 0.05, fc['y'], fc['z']), look=(1, 0, 0))
    lib.anchor('floppy_row1', (hx0 + 0.05, fc['y'] + fc['riser_h'], fc['z']), look=(1, 0, 0))

    peg = box('pegboard', (0.008, HUTCH['shelf_y'] - DESK_TOP - 0.02, hz1 - hz0 - 0.08),
              (hx0 + 0.006, (DESK_TOP + HUTCH['shelf_y']) / 2, (hz0 + hz1) / 2), _pegboard())

    # ── side shelf beyond the left wing, with the stereo amp ───────────
    sx, sz = SIDE_SHELF['x'], SIDE_SHELF['z']
    sw, sd, sh = 0.4, 0.5, 0.82
    sparts = []
    for i, y in enumerate((0.1, 0.46, sh)):
        sparts.append(box(f'side_board_{i}', (sw, 0.018, sd), (sx, y, sz), pal['desk'], bevel=0.003))
    join('side_boards', sparts)
    sposts = []
    for i, (dx, dz) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        sposts.append(box(f'side_post_{i}', (0.02, sh, 0.02), (sx + dx * (sw / 2 - 0.012), sh / 2, sz + dz * (sd / 2 - 0.012)), pal['steel'], bevel=0.002))
    join('side_frame', sposts)

    amp_body = box('amp_body', (0.3, 0.1, 0.36), (sx + 0.02, 0.46 + 0.059, sz), pal['alu_silver'], bevel=0.004)
    amp_face = box('amp_face', (0.006, 0.09, 0.34), (sx + 0.172, 0.46 + 0.059, sz), pal['alu_silver'], bevel=0.002)
    knob = lib.cylinder('amp_knob', 0.022, 0.02, (sx + 0.185, 0.46 + 0.059, sz + 0.07), pal['steel_satin'], axis='x', verts=40, bevel=0.002)
    small = lib.cylinder('amp_knob_s', 0.009, 0.014, (sx + 0.182, 0.46 + 0.045, sz - 0.1), pal['steel_satin'], axis='x', verts=24)
    join('amp', [amp_body, amp_face, knob, small])
    return peg
