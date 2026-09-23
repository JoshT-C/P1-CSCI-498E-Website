"""
The room, as photographed and then rearranged:

  * an L-desk in the back-left corner — the left wing runs along the left
    wall under a hutch, the right wing along the back wall;
  * left wing: the VT100 (where the retro monitor stood) and its keyboard;
  * corner: the laptop on its stand (where the vertical monitor was);
  * right wing: the new larger monitor (where the laptop stand was) and
    the big monitor at the far end, the black keyboard and mouse in front;
  * under the left wing: the NavePoint rack (where the Dell server was),
    the NZXT tower beside it;
  * under the right wing, far end: the Thelio Mira (where the bin was);
  * hutch cubby: the floppies; left wall above the hutch: the whiteboard;
  * back wall above the right wing: the blue-cross flag; the pride flag on
    the hutch's end post.

three.js convention, metres. The camera enters from the front-right.
"""

ROOM = dict(left_x=-2.0, back_z=-2.0, right_x=2.3, front_z=2.4, height=2.5)

DESK_TOP = 0.75
DESK_T = 0.028

# Left wing: along the left wall, deeper than the right wing so the VT100
# and its keyboard both fit in front of the hutch.
LEFT_WING = dict(x0=ROOM['left_x'], x1=ROOM['left_x'] + 0.76, z0=ROOM['back_z'], z1=-0.55)
RIGHT_WING = dict(x0=LEFT_WING['x1'], x1=0.75, z0=ROOM['back_z'], z1=ROOM['back_z'] + 0.64)

HUTCH = dict(depth=0.26, shelf_y=1.21, top_y=1.56, z0=LEFT_WING['z0'] + 0.02, z1=LEFT_WING['z1'] - 0.02)

# The VT100 faces +x (the user sits with their back to the room's centre).
VT100 = dict(x=ROOM['left_x'] + 0.33, z=-1.12, yaw=1.5707963)
VT100_KB = dict(x=ROOM['left_x'] + 0.66, z=-1.12, yaw=1.5707963)

LAPTOP = dict(x=LEFT_WING['x1'] + 0.1, z=ROOM['back_z'] + 0.36, yaw=0.62)
MONITOR_MID = dict(x=-0.62, z=ROOM['back_z'] + 0.2, yaw=-0.08, diag=27)
MONITOR_BIG = dict(x=0.24, z=ROOM['back_z'] + 0.24, yaw=-0.32, diag=32)
KEYBOARD_MAIN = dict(x=-0.4, z=ROOM['back_z'] + 0.5, yaw=-0.05)
MOUSE = dict(x=0.02, z=ROOM['back_z'] + 0.5)

# Under the left wing, fronts facing +x into the room.
RACK = dict(x=ROOM['left_x'] + 0.3, z=-1.02, yaw=1.5707963, width=0.54, depth=0.44, height=0.71)
# Beside the rack, deeper under the corner (the inner leg stands between).
NZXT = dict(x=ROOM['left_x'] + 0.28, z=-1.66, yaw=1.5707963)
THELIO = dict(x=0.42, z=ROOM['back_z'] + 0.3, yaw=0.0)

# Left wall above the side shelf, clear of the hutch and its headphones.
WHITEBOARD = dict(x=ROOM['left_x'] + 0.012, y=1.6, z=-0.05, w=1.0, h=0.6)
# The cubby between the dividers at z -0.98 and -0.64; a two-step riser
# stands the disks in two rows of three.
FLOPPY_CUBBY = dict(x=ROOM['left_x'] + 0.13, y=HUTCH['shelf_y'] + 0.009, z=-0.81, riser_h=0.06, riser_d=0.1)
FLAG_BLUE = dict(x=-0.2, y=1.8, z=ROOM['back_z'] + 0.01, w=1.35, h=0.84)
# Clipped to the hutch's corner post, flying out over the desk (clear of
# the whiteboard and the cubbies).
FLAG_PRIDE = dict(x=ROOM['left_x'] + HUTCH['depth'] + 0.01, y=1.36, z=HUTCH['z0'] + 0.012)
SIDE_SHELF = dict(x=ROOM['left_x'] + 0.22, z=-0.2)

# The camera's doorway.
DOORWAY = dict(x=1.55, y=1.55, z=1.75)
