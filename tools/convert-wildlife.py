"""Run: blender --background --disable-autoexec SOURCE.blend --python tools/convert-wildlife.py -- stag|doe OUTPUT_DIRECTORY"""
import bpy,sys,json
from pathlib import Path
from mathutils import Vector
kind=sys.argv[sys.argv.index('--')+1]
for o in list(bpy.data.objects):
 if o.type not in {'MESH','ARMATURE'} or o.name.startswith('Plane'):bpy.data.objects.remove(o,do_unlink=True)
for m in bpy.data.materials:
 m.use_nodes=True;m.node_tree.nodes.clear()
 out=m.node_tree.nodes.new('ShaderNodeOutputMaterial');shader=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled');m.node_tree.links.new(shader.outputs['BSDF'],out.inputs['Surface'])
 shader.inputs['Roughness'].default_value=.9
 name=m.name.lower()
 diffuse=normal=None
 if name=='body':diffuse='body' if kind=='stag' else 'doe-body';normal='deer-body-normal.png' if kind=='stag' else None
 elif name=='head':diffuse='head' if kind=='stag' else 'doe-head';normal='deer-head-normal.png' if kind=='stag' else None
 elif name=='antlers':diffuse='deer-antlers.png';normal='deer-antlers-normal.png'
 elif name=='eye':shader.inputs['Base Color'].default_value=(.015,.009,.006,1);shader.inputs['Roughness'].default_value=.16
 if diffuse:
  image=bpy.data.images[diffuse];image.colorspace_settings.name='sRGB'
  tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;m.node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color'])
 if normal:
  image=bpy.data.images[normal];image.colorspace_settings.name='Non-Color'
  tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image
  n=m.node_tree.nodes.new('ShaderNodeNormalMap');n.inputs['Strength'].default_value=.65
  m.node_tree.links.new(tex.outputs['Color'],n.inputs['Color']);m.node_tree.links.new(n.outputs['Normal'],shader.inputs['Normal'])
for obj in bpy.data.objects:
 if obj.type=='MESH':
  for face in obj.data.polygons:face.use_smooth=True
arm=next(o for o in bpy.data.objects if o.type=='ARMATURE');arm.animation_data.action=None
keep={'Idle.000':'Idle','Eat.001':'Graze','LookAround.000':'LookAround','Run':'Run'}
selected=[(bpy.data.actions.get(k),v) for k,v in keep.items()]
for action in list(bpy.data.actions):
 if action not in [a for a,_ in selected]:bpy.data.actions.remove(action)
for action,name in selected:
 if not action:continue
 action.name=name
 track=arm.animation_data.nla_tracks.new();track.name=name
 strip=track.strips.new(name,0,action);strip.name=name
 if action.slots:strip.action_slot=action.slots[0]
 track.mute=True
# Reference pose for stable exported geometry and browser normalization.
arm.animation_data.action=selected[0][0]
if selected[0][0].slots:arm.animation_data.action_slot=selected[0][0].slots[0]
bpy.context.scene.frame_set(0);bpy.context.view_layer.update()
print('CONVERT',kind,[(o.name,len(o.data.polygons))for o in bpy.data.objects if o.type=='MESH'])
out=str(Path(sys.argv[sys.argv.index('--')+2])/(kind+'.glb'))
bpy.ops.export_scene.gltf(filepath=out,export_format='GLB',export_animations=True,export_animation_mode='NLA_TRACKS',export_bake_animation=True,export_force_sampling=True,export_frame_range=False,export_optimize_animation_size=True,export_cameras=False,export_lights=False)
print('EXPORTED',out)
