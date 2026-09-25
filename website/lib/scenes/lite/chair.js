import * as THREE from 'three';
import { createChairModel } from '../../../../chair-configurator/js/chairGeometry.js';
import { GeometryLibrary } from '../../../../shared-3d/src/geometry/GeometryLibrary.js';
import presets from '../../../public/lite-assets/chair/presets.json' with {type:'json'};

export async function prepare(state) {
  const textures=[];
  const create = async(id,color) => {
    const spec=presets[id],material=new THREE.MeshPhysicalMaterial({color,metalness:spec.metalness,roughness:spec.roughness,envMapIntensity:spec.envMapIntensity,clearcoat:spec.clearcoat||0,clearcoatRoughness:spec.clearcoatRoughness||0,sheen:spec.sheen||0,sheenRoughness:spec.sheenRoughness||1,sheenColor:spec.sheenColor||'#ffffff'});
    for(const [role,slot] of [['color','map'],['normal','normalMap'],['roughness','roughnessMap']]){
      const texture=await new THREE.TextureLoader().loadAsync(`/lite-assets/chair/${spec.texture}-${role}.png`);
      texture.flipY=false;texture.colorSpace=role==='color'?THREE.SRGBColorSpace:THREE.NoColorSpace;
      texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(1/spec.tile[0],1/spec.tile[1]);texture.anisotropy=4;
      textures.push(texture);material[slot]=texture;
    }
    material.normalScale.setScalar(spec.normalStrength*.85);material.needsUpdate=true;
    return material;
  };
  try{return {wood:await create(`wood.furniture.${state.woodType||'oak'}`,state.wood),fabric:await create(`fabric.upholstery.${state.weave}`,state.fabric),textures};}
  catch(error){textures.forEach(texture=>texture.dispose());throw error;}
}

// Production geometry is consumed read-only. Only the website's materials are simplified.
export function buildModel(state,resources) {
  const library = new GeometryLibrary(THREE);
  const woodMaterial = resources?.wood || new THREE.MeshPhysicalMaterial({color:state.wood});
  const fabricMaterial = resources?.fabric || new THREE.MeshPhysicalMaterial({color:state.fabric});
  const result = createChairModel(THREE, library, { woodMaterial, fabricMaterial });
  return {group: result.group, cleanup: () => library.dispose(), metrics: {width: 500, depth: 470, height: 790}};
}
