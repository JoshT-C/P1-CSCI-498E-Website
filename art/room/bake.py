"""
Lightmap bake.

Static objects are split into atlases by how closely they are ever seen:
  room — walls, floor, ceiling, trim   (large, soft: half resolution)
  desk — furniture and everything on it
  lab  — the rack, the towers, the side shelf
Each atlas gets its own lightmap UV layer, packed across all its objects at
a uniform texel density, and one Cycles COMBINED bake (diffuse direct +
indirect + colour + emission, no glossy: the view-dependent part is left
to the runtime). The result is the object's final look — albedo and light
together — so the runtime draws it unlit.
"""
import bpy

ATLAS_SCALE = {'room': 0.5, 'desk': 1.0, 'lab': 1.0}
LIGHTMAP_UV = 'lightmap'


def _objects(atlas):
    return [o for o in bpy.data.collections['baked'].all_objects if o.type == 'MESH' and o.get('atlas') == atlas]


def _prepare(objs):
    """Apply modifiers, make mesh data single-user, add the lightmap UV."""
    for o in objs:
        if o.data.users > 1:
            o.data = o.data.copy()
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        bpy.context.view_layer.objects.active = o
        for m in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)
        # Every object gets a 'UVMap' layer (empty if it had none): join()
        # merges UV layers by name, and only a layer every object shares is
        # guaranteed to survive — the flags' image mapping lives in it.
        if 'UVMap' not in o.data.uv_layers:
            if len(o.data.uv_layers):
                o.data.uv_layers[0].name = 'UVMap'
            else:
                o.data.uv_layers.new(name='UVMap')
        uv = o.data.uv_layers.get(LIGHTMAP_UV) or o.data.uv_layers.new(name=LIGHTMAP_UV)
        # active = what the unwrap/bake writes; the render UV (flags' image
        # mapping) stays as it was.
        o.data.uv_layers.active = uv
        o.select_set(True)


def _unwrap(objs):
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.002, area_weight=0.0, scale_to_bounds=False)
    # One pack across every selected object: uniform texel density.
    bpy.ops.uv.pack_islands(udim_source='CLOSEST_UDIM', rotate=True, scale=True, margin_method='FRACTION', margin=0.002, shape_method='CONCAVE')
    bpy.ops.object.mode_set(mode='OBJECT')


def _merge(name, objs):
    """One mesh per atlas. Cycles re-syncs the whole scene for every object
    in a multi-object bake, so 39 objects cost 39 scene builds; one merged
    mesh costs one. UV layers merge by name, so the lightmap survives."""
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.join()
    merged = bpy.context.view_layer.objects.active
    merged.name = f'baked_{name}'
    merged.data.name = f'baked_{name}'
    merged.data.uv_layers.active = merged.data.uv_layers[LIGHTMAP_UV]
    return merged


def _target(objs, image):
    """Point every material on these objects at `image` as the bake target.
    Materials are shared between atlases, so this is redone per atlas."""
    for o in objs:
        for slot in o.material_slots:
            mat = slot.material
            if mat is None or not mat.use_nodes:
                continue
            nt = mat.node_tree
            node = nt.nodes.get('bake_target') or nt.nodes.new('ShaderNodeTexImage')
            node.name = 'bake_target'
            node.image = image
            node.select = True
            nt.nodes.active = node


def bake_all(size, samples):
    scene = bpy.context.scene
    scene.cycles.samples = samples
    bake = scene.render.bake
    bake.use_pass_direct = True
    bake.use_pass_indirect = True
    bake.use_pass_diffuse = True
    bake.use_pass_emit = True
    bake.use_pass_glossy = False
    bake.use_pass_transmission = False
    bake.margin = 16
    bake.margin_type = 'EXTEND'
    bake.use_clear = True

    atlases = {}
    for name, scale in ATLAS_SCALE.items():
        objs = _objects(name)
        if not objs:
            continue
        px = int(size * scale)
        _prepare(objs)
        _unwrap(objs)
        count = len(objs)
        merged = _merge(name, objs)
        img = bpy.data.images.new(f'atlas_{name}', px, px, alpha=False, float_buffer=True)
        _target([merged], img)
        bpy.ops.object.select_all(action='DESELECT')
        merged.select_set(True)
        bpy.context.view_layer.objects.active = merged
        print(f'[bake] {name}: {count} objects merged, {px}px, {samples} samples', flush=True)
        bpy.ops.object.bake(type='COMBINED')
        atlases[name] = (img, merged)
    return atlases
