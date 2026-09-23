"""
Materials, matched to the reference photos.

All procedural: the surface detail (plank grain, knockdown plaster, powder
coat orange-peel, anodised brushing) is shader noise, and gets baked into
the lightmap atlas together with the lighting. Colours are sampled by eye
from the photos, then pulled down a stop — the room is dim.
"""
import bpy

_cache = {}


def _principled(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    return mat, nt, bsdf


def _hex(h, a=1.0):
    h = h.lstrip('#')
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return (*lin, a)


def _coords(nt, space='Object'):
    tc = nt.nodes.new('ShaderNodeTexCoord')
    return tc.outputs[space]


def _bump(nt, bsdf, height_socket, strength, distance=0.002):
    b = nt.nodes.new('ShaderNodeBump')
    b.inputs['Strength'].default_value = strength
    b.inputs['Distance'].default_value = distance
    nt.links.new(height_socket, b.inputs['Height'])
    nt.links.new(b.outputs['Normal'], bsdf.inputs['Normal'])
    return b


def _noise(nt, coords, scale, detail=6.0, rough=0.55):
    n = nt.nodes.new('ShaderNodeTexNoise')
    n.inputs['Scale'].default_value = scale
    n.inputs['Detail'].default_value = detail
    n.inputs['Roughness'].default_value = rough
    nt.links.new(coords, n.inputs['Vector'])
    return n


def _mix_color(nt, fac, a, b):
    m = nt.nodes.new('ShaderNodeMix')
    m.data_type = 'RGBA'
    nt.links.new(fac, m.inputs['Factor'])
    m.inputs['A'].default_value = a
    m.inputs['B'].default_value = b
    return m.outputs['Result']


def solid(name, color, rough=0.5, metal=0.0, grain=0.0, grain_scale=900.0, bump=0.0, coat=0.0):
    """A flat colour with optional fine surface grain (powder coat, ABS
    orange-peel, bead-blasted aluminium)."""
    key = ('solid', name)
    if key in _cache:
        return _cache[key]
    mat, nt, bsdf = _principled(name)
    bsdf.inputs['Base Color'].default_value = _hex(color)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if coat:
        bsdf.inputs['Coat Weight'].default_value = coat
    if grain or bump:
        n = _noise(nt, _coords(nt), grain_scale, 8.0, 0.6)
        if grain:
            lo = tuple(c * (1 - grain) for c in _hex(color)[:3]) + (1,)
            hi = tuple(min(c * (1 + grain), 1) for c in _hex(color)[:3]) + (1,)
            nt.links.new(_mix_color(nt, n.outputs['Fac'], lo, hi), bsdf.inputs['Base Color'])
        if bump:
            _bump(nt, bsdf, n.outputs['Fac'], bump, 0.0006)
    _cache[key] = mat
    return mat


def emissive(name, color, strength):
    key = ('emit', name)
    if key in _cache:
        return _cache[key]
    mat, nt, bsdf = _principled(name)
    bsdf.inputs['Base Color'].default_value = (0, 0, 0, 1)
    bsdf.inputs['Emission Color'].default_value = _hex(color)
    bsdf.inputs['Emission Strength'].default_value = strength
    bsdf.inputs['Roughness'].default_value = 0.3
    _cache[key] = mat
    return mat


def plaster():
    """Knockdown texture, warm beige, as on every wall in the photos: flat
    splats of compound with soft raised edges."""
    key = ('plaster',)
    if key in _cache:
        return _cache[key]
    mat, nt, bsdf = _principled('wall_plaster')
    co = _coords(nt)
    vor = nt.nodes.new('ShaderNodeTexVoronoi')
    vor.feature = 'F1'
    vor.inputs['Scale'].default_value = 26.0
    nt.links.new(co, vor.inputs['Vector'])
    n = _noise(nt, co, 60.0, 4.0, 0.5)
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.18
    ramp.color_ramp.elements[1].position = 0.34
    nt.links.new(vor.outputs['Distance'], ramp.inputs['Fac'])
    add = nt.nodes.new('ShaderNodeMath')
    add.operation = 'MULTIPLY_ADD'
    add.inputs[2].default_value = 0.0
    nt.links.new(ramp.outputs['Color'], add.inputs[0])
    nt.links.new(n.outputs['Fac'], add.inputs[1])
    _bump(nt, bsdf, add.outputs['Value'], 0.55, 0.003)
    base = _mix_color(nt, n.outputs['Fac'], _hex('#b9a88f'), _hex('#c9b99f'))
    nt.links.new(base, bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.92
    _cache[key] = mat
    return mat


def vinyl_plank():
    """Grey-brown wood-look vinyl: 18 cm planks, staggered ends, per-plank
    tone shift, printed grain, and a faint bevel groove between boards."""
    key = ('vinyl',)
    if key in _cache:
        return _cache[key]
    mat, nt, bsdf = _principled('floor_vinyl')
    co = _coords(nt)
    # planks run along x (three) = blender x
    mapping = nt.nodes.new('ShaderNodeMapping')
    # brick units become metres: 1.2 m boards, 18 cm wide
    mapping.inputs['Scale'].default_value = (1 / 1.2, 1 / 0.18, 1.0)
    nt.links.new(co, mapping.inputs['Vector'])
    brick = nt.nodes.new('ShaderNodeTexBrick')
    brick.inputs['Scale'].default_value = 1.0
    brick.inputs['Mortar Size'].default_value = 0.006
    brick.inputs['Brick Width'].default_value = 1.0
    brick.inputs['Row Height'].default_value = 1.0
    brick.offset = 0.37
    brick.offset_frequency = 2
    brick.inputs['Color1'].default_value = (0.24, 0.21, 0.18, 1)
    brick.inputs['Color2'].default_value = (0.38, 0.34, 0.29, 1)
    brick.inputs['Bias'].default_value = 0.0
    brick.inputs['Mortar'].default_value = (0.08, 0.07, 0.06, 1)
    nt.links.new(mapping.outputs['Vector'], brick.inputs['Vector'])
    # grain: stretched noise + wave
    gmap = nt.nodes.new('ShaderNodeMapping')
    gmap.inputs['Scale'].default_value = (0.6, 30.0, 1.0)
    nt.links.new(co, gmap.inputs['Vector'])
    grain = _noise(nt, gmap.outputs['Vector'], 4.0, 10.0, 0.62)
    mul = nt.nodes.new('ShaderNodeMix')
    mul.data_type = 'RGBA'
    mul.blend_type = 'MULTIPLY'
    mul.inputs['Factor'].default_value = 0.55
    nt.links.new(brick.outputs['Color'], mul.inputs['A'])
    gr = _mix_color(nt, grain.outputs['Fac'], (0.55, 0.52, 0.5, 1), (1.25, 1.2, 1.15, 1))
    nt.links.new(gr, mul.inputs['B'])
    nt.links.new(mul.outputs['Result'], bsdf.inputs['Base Color'])
    _bump(nt, bsdf, brick.outputs['Fac'], 0.25, 0.001)
    bsdf.inputs['Roughness'].default_value = 0.55
    _cache[key] = mat
    return mat


def desk_wood():
    """The desk top in the photos: dark rustic laminate, near-black brown
    with warmer grain streaks and a satin sheen."""
    key = ('deskwood',)
    if key in _cache:
        return _cache[key]
    mat, nt, bsdf = _principled('desk_wood')
    co = _coords(nt)
    m = nt.nodes.new('ShaderNodeMapping')
    m.inputs['Scale'].default_value = (0.8, 18.0, 1.0)
    nt.links.new(co, m.inputs['Vector'])
    wave = nt.nodes.new('ShaderNodeTexWave')
    wave.inputs['Scale'].default_value = 3.0
    wave.inputs['Distortion'].default_value = 9.0
    wave.inputs['Detail'].default_value = 6.0
    nt.links.new(m.outputs['Vector'], wave.inputs['Vector'])
    n = _noise(nt, m.outputs['Vector'], 6.0, 8.0, 0.6)
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = _hex('#1c140f')
    ramp.color_ramp.elements[1].color = _hex('#4a3526')
    nt.links.new(wave.outputs['Fac'], ramp.inputs['Fac'])
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'OVERLAY'
    mix.inputs['Factor'].default_value = 0.35
    nt.links.new(ramp.outputs['Color'], mix.inputs['A'])
    nt.links.new(n.outputs['Color'], mix.inputs['B'])
    nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
    _bump(nt, bsdf, wave.outputs['Fac'], 0.08, 0.001)
    bsdf.inputs['Roughness'].default_value = 0.42
    _cache[key] = mat
    return mat


def image_material(name, image, rough=0.8, emission=0.0):
    """A material from a generated image (flags, labels)."""
    key = ('img', name)
    if key in _cache:
        return _cache[key]
    mat, nt, bsdf = _principled(name)
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = image
    # Explicit: after the pre-bake join the lightmap is the active UV layer,
    # and an unmapped image node would sample through it.
    uv = nt.nodes.new('ShaderNodeUVMap')
    uv.uv_map = 'UVMap'
    nt.links.new(uv.outputs['UV'], tex.inputs['Vector'])
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    if emission:
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = emission
    bsdf.inputs['Roughness'].default_value = rough
    _cache[key] = mat
    return mat


def perforated(name='perforated', pitch=0.004, base='#0d0d0e'):
    """Hex-pattern perforated sheet (case fronts, the MS-02 side bands):
    dark holes on a satin metal, as a shader dot field."""
    key = ('perf', name)
    if key in _cache:
        return _cache[key]
    mat, nt, bsdf = _principled(name)
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1 / pitch,) * 3
    nt.links.new(_coords(nt), mp.inputs['Vector'])
    vor = nt.nodes.new('ShaderNodeTexVoronoi')
    vor.inputs['Randomness'].default_value = 0.0
    nt.links.new(mp.outputs['Vector'], vor.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.3
    ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1)
    ramp.color_ramp.elements[1].position = 0.33
    ramp.color_ramp.elements[1].color = _hex(base)
    nt.links.new(vor.outputs['Distance'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.45
    bsdf.inputs['Metallic'].default_value = 0.6
    _cache[key] = mat
    return mat


# ── the palette, by object ──────────────────────────────────────────────
def palette():
    return {
        'plaster': plaster(),
        'floor': vinyl_plank(),
        'desk': desk_wood(),
        'baseboard': solid('baseboard', '#d9d3c6', 0.35),
        'steel': solid('steel_black', '#141414', 0.48, 0.55, grain=0.12, bump=0.12),
        'steel_satin': solid('steel_satin', '#1b1c1d', 0.35, 0.7, grain=0.08),
        'vent': solid('vent_metal', '#8c8a84', 0.5, 0.6),
        'abs_beige': solid('abs_beige', '#cdc2a6', 0.55, grain=0.05, bump=0.18, grain_scale=1400),
        'abs_beige_dark': solid('abs_beige_dark', '#34302a', 0.6, grain=0.05, bump=0.1),
        'key_beige': solid('key_beige', '#d6cbb0', 0.5, grain=0.04),
        'key_brown': solid('key_brown', '#7e715c', 0.55),
        'key_dark': solid('key_dark', '#3a352e', 0.55),
        'plastic_black': solid('plastic_black', '#18181a', 0.55, grain=0.1, bump=0.08),
        'plastic_gloss': solid('plastic_gloss', '#0b0b0c', 0.18, coat=0.4),
        'plastic_white': solid('plastic_white', '#e4e2dc', 0.4, grain=0.03),
        'switch_grey': solid('switch_grey', '#4a4d4f', 0.45, 0.4, grain=0.06),
        'alu_silver': solid('alu_silver', '#b7b8b6', 0.3, 1.0, grain=0.05, bump=0.05, grain_scale=2500),
        'alu_slate': solid('alu_slate', '#343b45', 0.34, 0.9, grain=0.06, bump=0.06, grain_scale=2500),
        'port': solid('port_dark', '#050505', 0.7),
        'port_metal': solid('port_metal', '#8a8a86', 0.3, 1.0),
        'rubber': solid('rubber', '#0a0a0a', 0.85),
        'walnut': desk_wood(),
        'fabric_dark': solid('fabric_dark', '#161616', 0.95, grain=0.15, bump=0.2, grain_scale=3000),
        'mesh_grille': solid('mesh_grille', '#0c0c0c', 0.6, 0.4),
        'bezel_black': solid('bezel_black', '#101010', 0.3, coat=0.2),
        'whiteboard_frame': solid('wb_frame', '#b8bab6', 0.3, 1.0),
        'mic_silver': solid('mic_silver', '#a9aaa8', 0.28, 1.0),
        'perforated': perforated(),
        'cable_yellow': solid('cable_yellow', '#b8a24a', 0.3),
        # light sources (screens glow in the bake; LEDs are tiny emitters)
        'screen_blue': emissive('screen_blue', '#1e3150', 2.2),
        'screen_cool': emissive('screen_cool', '#26344a', 2.0),
        'crt_green': emissive('crt_green', '#2fd07f', 1.4),
        'led_green': emissive('led_green', '#46ff8a', 25.0),
        'led_blue': emissive('led_blue', '#3c6bff', 30.0),
        'led_white': emissive('led_white', '#dfe8ff', 20.0),
        'underglow': emissive('underglow', '#cfd8ff', 0.25),
        'led_amber': emissive('led_amber', '#ffae3c', 20.0),
        'led_red': emissive('led_red', '#ff3b3b', 15.0),
        'glow_red': emissive('glow_red', '#ff2a2a', 0.6),
    }
