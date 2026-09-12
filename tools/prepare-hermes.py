"""blender --background --disable-autoexec --python tools/prepare-hermes.py -- SOURCE.stl OUTPUT.glb
SMK KAS1161 public-domain scan; source and license are recorded in ASSETS.md.
Exports a four-unit standing sculpture. The renderer uses the shared 5.0 scale.
"""
import bpy, bmesh, sys, math, json
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
source, destination=sys.argv[sys.argv.index('--')+1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.stl_import(filepath=source)
o=bpy.context.object;o.name='Belvedere Hermes — SMK KAS1161'
lo=Vector(tuple(min(v.co[i] for v in o.data.vertices) for i in range(3)))
hi=Vector(tuple(max(v.co[i] for v in o.data.vertices) for i in range(3)))
center=(lo+hi)/2; factor=4/(hi.z-lo.z)
for v in o.data.vertices:v.co=(v.co-center)*factor
# Remove the modern display plinth, leaving an archaeological ankle fracture.
bm=bmesh.new();bm.from_mesh(o.data)
bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.00001,
 plane_co=(0,0,-1.68),plane_no=(0,0,1),clear_inner=True,clear_outer=False)
cut_edges=[e for e in bm.edges if e.is_boundary and all(abs(v.co.z+1.68)<.001 for v in e.verts)]
if cut_edges:bmesh.ops.holes_fill(bm,edges=cut_edges,sides=0)
for v in bm.verts:
 if abs(v.co.z+1.68)<.001:v.co.z+=.008*math.sin(v.co.x*63+v.co.y*41)
bmesh.ops.triangulate(bm,faces=list(bm.faces))
bm.to_mesh(o.data);bm.free()
# Keep enough real detail for the curls, eyelids, lips and drapery at close range.
mod=o.modifiers.new('Web sculpture','DECIMATE');mod.ratio=min(1,100000/len(o.data.polygons))
bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
for p in o.data.polygons:p.use_smooth=True
o.data.update()
bvh=BVHTree.FromPolygons([v.co for v in o.data.vertices],[list(p.vertices) for p in o.data.polygons])
colors=o.data.color_attributes.new(name='Stone cavities',type='BYTE_COLOR',domain='POINT')
# Deterministic geometric occlusion captures the scan's carved recesses without
# baking a light direction or painting false shadows across open surfaces.
samples=[(v.co.copy(),v.normal.normalized()) for v in o.data.vertices]
color_values=[]
print('BAKING',len(samples),flush=True)
for co,n in samples:
 t=n.cross(Vector((0,0,1)))
 if t.length<.01:t=n.cross(Vector((0,1,0)))
 t.normalize();b=n.cross(t);occlusion=0
 for j in range(16):
  u=(j+.5)/16;a=j*2.3999632297;rr=math.sqrt(u)
  d=(t*math.cos(a)*rr+b*math.sin(a)*rr+n*math.sqrt(1-u)).normalized()
  hit,_,_,distance=bvh.ray_cast(co+n*.0015,d,.19)
  if hit is not None:occlusion+=1-distance/.19
 shade=1-.6*occlusion/16
 color_values.extend((shade,shade,shade,1))
colors.data.foreach_set('color',color_values)
mat=bpy.data.materials.new('Excavated marble');mat.use_nodes=True
p=mat.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(.72,.68,.58,1);p.inputs['Roughness'].default_value=.82
vcol=mat.node_tree.nodes.new('ShaderNodeVertexColor');vcol.layer_name=colors.name;mat.node_tree.links.new(vcol.outputs['Color'],p.inputs['Base Color'])
o.data.materials.clear();o.data.materials.append(mat)
Path(destination).parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=destination,export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False)
print('HERMES EXPORT',json.dumps({'triangles':len(o.data.polygons),'vertices':len(o.data.vertices),'size':Path(destination).stat().st_size,'sourceBounds':[list(lo),list(hi)],'normalizedHeight':4}))
