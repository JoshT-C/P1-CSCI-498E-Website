"""
Build the room.

    npm run art:preview                    # layout check: a Cycles render from the doorway
    npm run art:build                      # bake the lightmaps, export the GLB + anchors

Runs inside Blender (flatpak org.blender.Blender); see scripts/art.sh.
Arguments after `--`:
    --preview PATH      render a check image and stop
    --view NAME         preview camera: doorway | desk | rack | corner
    --out DIR           bake + export into DIR
    --size N            lightmap atlas size (default 4096)
    --samples N         bake samples (default 1024)
"""
import argparse
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

import desk  # noqa: E402
import gear  # noqa: E402
import lab  # noqa: E402
import lib  # noqa: E402
import materials  # noqa: E402
import shell  # noqa: E402
from layout import DOORWAY, FLOPPY_CUBBY, HUTCH, ROOM  # noqa: E402


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--preview')
    ap.add_argument('--view', default='doorway')
    ap.add_argument('--out')
    ap.add_argument('--size', type=int, default=4096)
    ap.add_argument('--samples', type=int, default=1024)
    ap.add_argument('--cpu', action='store_true', help='render on the CPU (the GPU is busy serving a model)')
    return ap.parse_args(argv)


def world():
    """Near-black with a trace of blue: what leaks under the door at night.
    Everything else in the room is lit by its own screens and LEDs."""
    w = bpy.data.worlds.new('night')
    w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.012, 0.016, 0.028, 1)
    bg.inputs['Strength'].default_value = 1.0
    bpy.context.scene.world = w

    # Hall light through the half-open door behind the camera: a warm, very
    # dim spill that gives the walls a shape without lighting the room.
    door = bpy.data.lights.new('hall_spill', 'AREA')
    door.shape = 'RECTANGLE'
    door.size, door.size_y = 0.8, 2.0
    door.energy = 14.0
    door.color = (1.0, 0.78, 0.55)
    obj = bpy.data.objects.new('hall_spill', door)
    lib.collection('helpers').objects.link(obj)
    obj.location = lib.P(1.7, 1.05, ROOM['front_z'] - 0.05)
    obj.rotation_euler = (math.pi / 2, 0, math.radians(10))


def gpu(scene, samples, cpu=False):
    scene.render.engine = 'CYCLES'
    if cpu:
        scene.cycles.device = 'CPU'
    else:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'OPTIX'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = d.type == 'OPTIX'
        scene.cycles.device = 'GPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 6
    scene.cycles.diffuse_bounces = 4
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'None'
    # match the exposure the atlases are saved at (export.EXPOSURE_EV)
    scene.view_settings.exposure = 1.3


VIEWS = {
    'doorway': ((DOORWAY['x'], DOORWAY['y'], DOORWAY['z']), (-1.2, 0.9, -1.35), 50),
    'desk': ((-0.9, 1.25, -0.6), (-1.7, 0.95, -1.12), 45),
    'rack': ((-0.55, 0.55, -1.0), (-1.8, 0.35, -1.3), 55),
    'corner': ((0.4, 1.3, 0.2), (-1.4, 0.95, -1.6), 55),
    'rack_close': ((-0.95, 0.42, -0.9), (-1.75, 0.36, -1.02), 50),
    'rack_side': ((-1.1, 0.5, -0.35), (-1.75, 0.36, -1.05), 50),
    'laptop': ((-0.7, 1.15, -0.9), (-1.14, 0.95, -1.64), 45),
    'flag': ((0.2, 1.6, -0.6), (-0.2, 1.8, -2.0), 55),
    'hutch': ((-0.9, 1.4, -0.8), (-1.85, 1.35, -0.9), 55),
    'wb': ((0.2, 1.5, 0.3), (-2.0, 1.5, -0.1), 50),
}


def preview(path, view, cpu=False):
    scene = bpy.context.scene
    gpu(scene, 64 if cpu else 256, cpu)
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1000
    eye, look, fov = VIEWS[view]
    cam_data = bpy.data.cameras.new('preview')
    cam_data.sensor_fit = 'VERTICAL'
    cam_data.angle = math.radians(fov)
    cam = bpy.data.objects.new('preview', cam_data)
    scene.collection.objects.link(cam)
    cam.location = lib.P(*eye)
    direction = lib.P(*look) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    a = args()
    lib.clear_scene()
    world()
    pal = materials.palette()
    for atlas, module in (('room', shell), ('desk', desk), ('desk', gear), ('lab', lab)):
        before = set(bpy.data.objects.keys())
        module.build(pal)
        for name in set(bpy.data.objects.keys()) - before:
            bpy.data.objects[name]['atlas'] = atlas
    # The floppies live at runtime (their labels are the site's canvas);
    # the room only records where they stand.
    lib.anchor('floppies', (ROOM['left_x'] + HUTCH['depth'], FLOPPY_CUBBY['y'] + 0.12, FLOPPY_CUBBY['z']), look=(1, 0, 0),
               width=0.34, height=HUTCH['top_y'] - HUTCH['shelf_y'])
    lib.hitbox('floppies', (0.28, 0.34, 0.34), (FLOPPY_CUBBY['x'] + 0.02, FLOPPY_CUBBY['y'] + 0.17, FLOPPY_CUBBY['z']))
    lib.anchor('doorway', (DOORWAY['x'], DOORWAY['y'], DOORWAY['z']))
    # the room's inner bounds, so the runtime and its tests can check poses
    lib.anchor('room_min', (ROOM['left_x'], 0.0, ROOM['back_z']))
    lib.anchor('room_max', (ROOM['right_x'], ROOM['height'], ROOM['front_z']))

    if a.preview:
        preview(a.preview, a.view, a.cpu)
        return
    if a.out:
        # Blender's working directory inside the Flatpak is not the repo:
        # relative paths mean relative to the repo root.
        repo = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
        out = a.out if os.path.isabs(a.out) else os.path.join(repo, a.out)
        import bake
        import export
        gpu(bpy.context.scene, a.samples, a.cpu)
        atlases = bake.bake_all(a.size, a.samples)
        export.export(out, atlases)


main()
