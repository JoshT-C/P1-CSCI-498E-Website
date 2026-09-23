"""The room around the desk: floor, walls, ceiling, trim, and the few wall
fixtures the photos show (a floor register, the outlet with the smart-plug
timer beside the rack)."""
import math

import bpy

from layout import LEFT_WING, ROOM, SIDE_SHELF
from lib import box, plane, add_bevel, join

import materials as M


def build(pal):
    L, B, R, F, H = ROOM['left_x'], ROOM['back_z'], ROOM['right_x'], ROOM['front_z'], ROOM['height']
    w = R - L
    d = F - B
    cx = (L + R) / 2
    cz = (B + F) / 2

    plane('floor', (w, d), (cx, 0, cz), normal='y', mat=pal['floor'], subdiv=8).rotation_euler = (0, 0, 0)
    plane('ceiling', (w, d), (cx, H, cz), normal='-y', mat=pal['plaster'], subdiv=4)
    plane('wall_left', (d, H), (L, H / 2, cz), normal='x', mat=pal['plaster'], subdiv=6)
    plane('wall_back', (w, H), (cx, H / 2, B), normal='z', mat=pal['plaster'], subdiv=6)
    plane('wall_right', (d, H), (R, H / 2, cz), normal='-x', mat=pal['plaster'], subdiv=4)
    plane('wall_front', (w, H), (cx, H / 2, F), normal='-z', mat=pal['plaster'], subdiv=4)

    # Skirting: the photos show a tall, slightly rounded white baseboard.
    bb_h, bb_t = 0.085, 0.012
    parts = [
        box('bb_left', (bb_t, bb_h, d), (L + bb_t / 2, bb_h / 2, cz), bevel=0.003),
        box('bb_back', (w, bb_h, bb_t), (cx, bb_h / 2, B + bb_t / 2), bevel=0.003),
        box('bb_right', (bb_t, bb_h, d), (R - bb_t / 2, bb_h / 2, cz), bevel=0.003),
        box('bb_front', (w, bb_h, bb_t), (cx, bb_h / 2, F - bb_t / 2), bevel=0.003),
    ]
    for p in parts:
        p.data.materials.append(pal['baseboard'])
    join('baseboards', parts)

    # Floor register by the left wall, just clear of the side shelf.
    reg_z = SIDE_SHELF['z'] + 0.55
    slats = [box(f'reg_slat_{i}', (0.012, 0.004, 0.24), (L + 0.1 + i * 0.016, 0.004, reg_z), pal['vent']) for i in range(8)]
    frame = box('reg_frame', (0.15, 0.004, 0.3), (L + 0.155, 0.002, reg_z), pal['vent'], bevel=0.002)
    reg = join('floor_register', [frame] + slats)
    reg.data.materials.clear()
    reg.data.materials.append(pal['vent'])

    # Outlet on the left wall with the plug-in timer from the rack photo.
    oz = LEFT_WING['z1'] + 0.08
    plate = box('outlet_plate', (0.006, 0.12, 0.075), (L + 0.003, 0.32, oz), pal['baseboard'], bevel=0.002)
    timer = box('timer_body', (0.04, 0.11, 0.07), (L + 0.026, 0.33, oz), pal['plastic_white'], bevel=0.006)
    lcd = box('timer_lcd', (0.002, 0.028, 0.045), (L + 0.047, 0.36, oz), pal['bezel_black'])
    join('wall_timer', [plate, timer, lcd])
