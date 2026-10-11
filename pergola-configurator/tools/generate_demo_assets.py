from pathlib import Path
import math
import numpy as np
import trimesh

ROOT = Path(__file__).resolve().parent.parent
MODELS = ROOT / 'public' / 'assets' / 'models'
ENV = MODELS / 'environment'
ACC = MODELS / 'accessories'
ENV.mkdir(parents=True, exist_ok=True)
ACC.mkdir(parents=True, exist_ok=True)


def mat(name, color, metallic=0.0, roughness=0.7, emissive=None):
    kwargs = dict(name=name, baseColorFactor=list(color), metallicFactor=metallic, roughnessFactor=roughness)
    if emissive:
        kwargs['emissiveFactor'] = list(emissive)
    return trimesh.visual.material.PBRMaterial(**kwargs)

MATS = {
    'wall': mat('wall', (0.78, 0.81, 0.82, 1), 0, 0.9),
    'roof': mat('roof', (0.25, 0.29, 0.31, 1), 0.25, 0.72),
    'glass': mat('glass', (0.38, 0.65, 0.78, 0.42), 0.0, 0.12),
    'dark': mat('dark', (0.035, 0.045, 0.05, 1), 0.55, 0.35),
    'metal': mat('metal', (0.55, 0.59, 0.61, 1), 0.78, 0.28),
    'white': mat('white', (0.86, 0.87, 0.85, 1), 0.08, 0.62),
    'black': mat('black', (0.015, 0.018, 0.02, 1), 0.45, 0.35),
    'orange': mat('element', (0.95, 0.33, 0.055, 1), 0.12, 0.28, (0.55, 0.08, 0.01)),
    'lens': mat('lens', (0.95, 0.92, 0.72, 1), 0.0, 0.08, (0.8, 0.55, 0.15)),
    'trunk': mat('trunk', (0.28, 0.18, 0.1, 1), 0, 0.95),
    'leaf1': mat('foliage', (0.16, 0.34, 0.12, 1), 0, 0.95),
    'leaf2': mat('foliage_light', (0.26, 0.46, 0.15, 1), 0, 0.95),
    'blue': mat('blue', (0.02, 0.37, 0.69, 1), 0.25, 0.38),
}


def add(scene, mesh, name, material, transform=None):
    mesh = mesh.copy()
    if transform is not None:
        mesh.apply_transform(transform)
    mesh.visual.material = material
    scene.add_geometry(mesh, geom_name=name, node_name=name)


def T(x=0, y=0, z=0):
    m = np.eye(4)
    m[:3, 3] = [x, y, z]
    return m


def R(axis, angle):
    return trimesh.transformations.rotation_matrix(angle, axis)


def box(scene, name, size, center, material, rotation=None):
    mesh = trimesh.creation.box(extents=size)
    transform = T(*center)
    if rotation:
        transform = transform @ R(rotation[0], rotation[1])
    add(scene, mesh, name, material, transform)


def cylinder(scene, name, radius, height, center, material, axis=(0, 1, 0), sections=18):
    mesh = trimesh.creation.cylinder(radius=radius, height=height, sections=sections)
    align = trimesh.geometry.align_vectors([0, 0, 1], axis)
    transform = T(*center) @ align
    add(scene, mesh, name, material, transform)


def rod_between(scene, name, start, end, radius, material, sections=12):
    start = np.array(start, dtype=float)
    end = np.array(end, dtype=float)
    vector = end - start
    length = np.linalg.norm(vector)
    if length <= 1e-8:
        return
    center = (start + end) / 2
    cylinder(scene, name, radius, length, center, material, axis=vector / length, sections=sections)


def export(scene, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(scene.export(file_type='glb'))
    print(path.relative_to(ROOT), path.stat().st_size)


def house():
    s = trimesh.Scene()
    body_width = 9.6
    body_height = 4.35
    body_depth = 4.15
    front_z = body_depth / 2 + 0.035

    box(s, 'house_body', (body_width, body_height, body_depth), (0, body_height / 2, 0), MATS['wall'])

    # One continuous gable-roof mesh avoids the gap and ridge ditch created by
    # intersecting two separately rotated boxes.
    roof_width = 10.05
    roof_half_depth = 2.4
    eave_y = body_height - 0.015
    ridge_y = 5.95
    x0, x1 = -roof_width / 2, roof_width / 2
    vertices = np.array([
        [x0, eave_y, -roof_half_depth],
        [x0, ridge_y, 0],
        [x0, eave_y, roof_half_depth],
        [x1, eave_y, -roof_half_depth],
        [x1, ridge_y, 0],
        [x1, eave_y, roof_half_depth],
    ], dtype=float)
    faces = np.array([
        [0, 1, 2],
        [3, 5, 4],
        [0, 3, 4], [0, 4, 1],
        [1, 4, 5], [1, 5, 2],
        [0, 2, 5], [0, 5, 3],
    ], dtype=int)
    roof = trimesh.Trimesh(vertices=vertices, faces=faces, process=False)
    add(s, roof, 'house_roof', MATS['roof'], np.eye(4))

    # Door and windows sit directly on the front wall. Their horizontal
    # positions deliberately do not overlap.
    door_x = -3.95
    box(s, 'door', (1.15, 2.2, 0.07), (door_x, 1.10, front_z), MATS['dark'])
    cylinder(s, 'door_handle', 0.04, 0.10, (door_x + 0.36, 1.1, front_z + 0.065), MATS['metal'], axis=(0,0,1), sections=16)

    for i, x in enumerate([-2.35, -0.55, 1.25, 3.05]):
        box(s, f'window_{i}', (1.28, 1.5, 0.045), (x, 2.35, front_z), MATS['glass'])
        box(s, f'window_left_{i}', (0.04, 1.58, 0.065), (x - 0.66, 2.35, front_z + 0.03), MATS['dark'])
        box(s, f'window_right_{i}', (0.04, 1.58, 0.065), (x + 0.66, 2.35, front_z + 0.03), MATS['dark'])
        box(s, f'window_top_{i}', (1.36, 0.04, 0.065), (x, 3.12, front_z + 0.03), MATS['dark'])
        box(s, f'window_bottom_{i}', (1.36, 0.04, 0.065), (x, 1.58, front_z + 0.03), MATS['dark'])

    export(s, ENV / 'house.glb')


def tree():
    s = trimesh.Scene()
    cylinder(s, 'trunk', 0.22, 2.8, (0, 1.4, 0), MATS['trunk'], sections=9)
    branches = [
        ((0, 1.6, 0), (0.8, 2.6, 0.25)),
        ((0, 1.9, 0), (-0.75, 2.85, -0.15)),
        ((0, 2.05, 0), (0.2, 3.15, -0.65)),
        ((0, 1.7, 0), (-0.25, 2.6, 0.75)),
    ]
    for i, (a,b) in enumerate(branches):
        rod_between(s, f'branch_{i}', a, b, 0.07, MATS['trunk'], 9)
    foliage_specs = [
        ((0,3.25,0), 1.28, 'leaf1'),
        ((0.85,3.15,0.22), 0.92, 'leaf2'),
        ((-0.82,3.35,-0.1), 0.98, 'leaf1'),
        ((0.1,3.55,-0.78), 0.88, 'leaf2'),
        ((-0.15,3.42,0.83), 0.9, 'leaf1'),
    ]
    for i,(center,radius,key) in enumerate(foliage_specs):
        mesh = trimesh.creation.icosphere(subdivisions=1, radius=radius)
        add(s, mesh, f'foliage_{i}', MATS[key], T(*center))
    export(s, ENV / 'tree.glb')


def spotlight():
    s = trimesh.Scene()
    cylinder(s, 'spot_body', 0.07, 0.05, (0, 0.005, 0), MATS['dark'], sections=24)
    cylinder(s, 'spot_trim', 0.078, 0.012, (0, -0.026, 0), MATS['metal'], sections=24)
    cylinder(s, 'spot_lens', 0.054, 0.009, (0, -0.037, 0), MATS['lens'], sections=24)
    export(s, ACC / 'spotlight.glb')


def heater():
    s = trimesh.Scene()
    box(s, 'heater_body', (0.9, 0.16, 0.14), (0,0,0), MATS['dark'])
    box(s, 'heating_element', (0.72, 0.055, 0.022), (0,-0.006,0.081), MATS['orange'])
    box(s, 'heater_top', (0.95, 0.035, 0.17), (0,0.092,0), MATS['metal'])
    box(s, 'heater_end_left', (0.07,0.18,0.18), (-0.46,0,0), MATS['black'])
    box(s, 'heater_end_right', (0.07,0.18,0.18), (0.46,0,0), MATS['black'])
    export(s, ACC / 'heater.glb')


def rain_sensor():
    s=trimesh.Scene()
    cylinder(s,'rain_base',0.08,0.05,(0,0.025,0),MATS['dark'],sections=24)
    cylinder(s,'rain_cap',0.065,0.035,(0,0.068,0),MATS['white'],sections=24)
    for i,x in enumerate(np.linspace(-0.04,0.04,5)):
        box(s,f'rain_grid_{i}',(0.012,0.018,0.09),(x,0.095,0),MATS['metal'])
    export(s,ACC/'rain-sensor.glb')


def wind_sensor():
    s=trimesh.Scene()
    cylinder(s,'wind_mast',0.018,0.24,(0,0.12,0),MATS['metal'],sections=16)
    cylinder(s,'wind_hub',0.035,0.045,(0,0.255,0),MATS['dark'],sections=20)
    for i,angle in enumerate([0,2*math.pi/3,4*math.pi/3]):
        start=(0,0.27,0)
        end=(math.cos(angle)*0.095,0.27,math.sin(angle)*0.095)
        rod_between(s,f'wind_arm_{i}',start,end,0.007,MATS['metal'],10)
        cylinder(s,f'wind_cup_{i}',0.035,0.04,(math.cos(angle)*0.12,0.27,math.sin(angle)*0.12),MATS['dark'],axis=(0,1,0),sections=16)
    box(s,'wind_mount',(0.1,0.025,0.1),(0,0.0125,0),MATS['dark'])
    export(s,ACC/'wind-sensor.glb')


def speaker():
    s=trimesh.Scene()
    box(s,'speaker_shell',(0.17,0.24,0.12),(0,0,0),MATS['dark'])
    box(s,'speaker_grille',(0.145,0.205,0.012),(0,0,0.066),MATS['metal'])
    cylinder(s,'speaker_driver_top',0.045,0.014,(0,0.055,0.078),MATS['black'],axis=(0,0,1),sections=24)
    cylinder(s,'speaker_driver_bottom',0.058,0.014,(0,-0.045,0.078),MATS['black'],axis=(0,0,1),sections=24)
    box(s,'speaker_bracket',(0.13,0.035,0.05),(0,0,-0.085),MATS['metal'])
    export(s,ACC/'speaker.glb')


def outlet(path, outlet_type):
    s=trimesh.Scene()
    box(s,'outlet_back',(0.12,0.16,0.018),(0,0,-0.009),MATS['dark'])
    box(s,'outlet_face',(0.112,0.152,0.027),(0,0,0.012),MATS['white'])
    if outlet_type=='eu':
        cylinder(s,'outlet_hole_left',0.012,0.012,(-0.026,0.012,0.032),MATS['black'],axis=(0,0,1),sections=20)
        cylinder(s,'outlet_hole_right',0.012,0.012,(0.026,0.012,0.032),MATS['black'],axis=(0,0,1),sections=20)
        box(s,'outlet_ground_top',(0.018,0.011,0.012),(0,0.048,0.032),MATS['metal'])
        box(s,'outlet_ground_bottom',(0.018,0.011,0.012),(0,-0.025,0.032),MATS['metal'])
    else:
        box(s,'outlet_slot_left',(0.012,0.044,0.012),(-0.026,0.012,0.032),MATS['black'])
        box(s,'outlet_slot_right',(0.012,0.044,0.012),(0.026,0.012,0.032),MATS['black'])
        cylinder(s,'outlet_ground',0.011,0.012,(0,-0.04,0.032),MATS['black'],axis=(0,0,1),sections=20)
    export(s,path)


def wall_switch():
    s=trimesh.Scene()
    box(s,'switch_back',(0.09,0.145,0.022),(0,0,-0.011),MATS['dark'])
    box(s,'switch_face',(0.082,0.136,0.025),(0,0,0.012),MATS['white'])
    box(s,'switch_up',(0.047,0.043,0.012),(0,0.026,0.032),MATS['blue'])
    box(s,'switch_down',(0.047,0.043,0.012),(0,-0.026,0.032),MATS['blue'])
    export(s,ACC/'wall-switch.glb')


def hand_crank():
    s=trimesh.Scene()
    box(s,'crank_gearbox',(0.1,0.14,0.07),(0,0.31,0),MATS['dark'])
    cylinder(s,'crank_eye',0.026,0.04,(0,0.24,0.05),MATS['metal'],axis=(0,0,1),sections=20)
    rod_between(s,'crank_rod',(0,0.24,0.055),(0,-0.38,0.055),0.012,MATS['metal'],12)
    rod_between(s,'crank_elbow',(0,-0.38,0.055),(0.115,-0.47,0.055),0.012,MATS['metal'],12)
    cylinder(s,'crank_grip',0.022,0.16,(0.17,-0.515,0.055),MATS['dark'],axis=(0.75,-0.66,0),sections=14)
    export(s,ACC/'hand-crank.glb')


def main():
    house(); tree(); spotlight(); heater(); rain_sensor(); wind_sensor(); speaker()
    outlet(ACC/'outlet-eu.glb','eu'); outlet(ACC/'outlet-us.glb','us')
    wall_switch(); hand_crank()

if __name__=='__main__':
    main()
