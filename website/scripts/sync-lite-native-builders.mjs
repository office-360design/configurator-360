// Read-only extraction of coupled production render functions. Prints a patch;
// never modifies source configurators. Review on source updates before applying.
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
const root=new URL('../../',import.meta.url);
function source(path){const text=fs.readFileSync(new URL(path,root),'utf8'),ast=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),functions=new Map();function visit(node){if(ts.isFunctionDeclaration(node)&&node.name)functions.set(node.name.text,node.getText(ast));ts.forEachChild(node,visit);}visit(ast);return {text,fn:name=>{if(!functions.has(name))throw Error(name);return functions.get(name);}};}
const tiles=source('tiles-configurator/js/viewer.js');
let rebuild=tiles.fn('rebuild').split("    if (s.shape === 'rectangle')")[0]+'\n  }';
rebuild=rebuild.replace(/const nextBounds = areaGeometry\(s\),\s*changed = [^;]+;/,'const nextBounds = areaGeometry(s);');
rebuild=rebuild.replace('    state = s;','');
const tileSource=`// Extracted from tiles-configurator/js/viewer.js at 05329b7.
// Original stone, fragment, curb and house rendering; website owns the renderer.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { stoneAppearance } from '../../../../tiles-configurator/js/stoneAppearance.js';
import { houseGeometry } from '../../../../tiles-configurator/js/house.js';
import { clipRect,polygonArea } from '../../../../tiles-configurator/js/area.js';
import { COLORS,TILES,CURBS,curbLayout,areaGeometry,normalize,layout } from '../../../../tiles-configurator/js/model.js';
export function previewState(input){return normalize({...input,length:Math.min(4,Math.max(1,Number(input.length))),width:Math.min(3,Math.max(1,Number(input.width))),shape:'rectangle',houseEnabled:input.houseEnabled==='yes',houseLength:Number(input.houseLength)||1.5,houseWidth:Number(input.houseWidth)||1,houseHeight:1.2,houseX:.5,houseZ:.5,houseWingWidth:.6,houseWingDepth:.5,houseRotation:Number(input.houseRotation)||0,color:({'#969a98':'grey','#a65343':'red','#414748':'charcoal'})[input.colour]||'grey',curb:'garden',edges:input.curbs==='yes'?[true,true,true,true]:[false,false,false,false]});}
export function buildModel(input){
  const s=previewState(input),parts=layout(s),group=new THREE.Group(),dimensions=new THREE.Group();
  let bounds;
  const box=new THREE.BoxGeometry(1,1,1),dummy=new THREE.Object3D();
  // Same LCG bytes as the original CanvasTexture, without a DOM dependency.
  const pixels=new Uint8Array(128*128*4);let seed=17;
  for(let i=0;i<pixels.length;i+=4){seed=(1664525*seed+1013904223)>>>0;const v=170+(seed%65);pixels.set([v,v,v,255],i);}
  const texture=new THREE.DataTexture(pixels,128,128);texture.needsUpdate=true;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.flipY=true;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;
  const material=new THREE.MeshStandardMaterial({roughness:.95,bumpMap:texture,bumpScale:.0015});
  const clear=g=>g.clear();
  ${tiles.fn('drawPieces')}
  ${tiles.fn('prism')}
  ${tiles.fn('drawPolygons')}
  ${rebuild}
  rebuild(s,parts);
  return {group,metrics:{area:parts.reduce((sum,p)=>sum+(p.area??p.l*p.w),0),pieces:parts.length},cleanup:()=>{box.dispose();material.dispose();texture.dispose();}};
}
`;
const box=source('cardbox-configurator/js/app.js');
const names=['makeBaseBox','round','clamp','uniqueSorted','faceKey','buildUnionGrid','collectBoundaryTiles','mergeTiles','faceNormal','faceCenter','isVerticalFace','isTopFace','isBottomFace','makeSurfaceMesh','boundsForBoxes','packagingLine','packagingTopMesh','packagingBottomMesh','packagingAddTopLine','packagingRenderClosureVisuals','toolTopDisplayY','toolBottomDisplayY','closurePivot','closureQuaternion','captureToolBaseTransform','transformToolRenderable'];
names.splice(names.indexOf('makeSurfaceMesh'),1,'makeColoredSurfaceMesh');
names.push('packagingDefaultLayers','packagingDefaultFeatures','ensurePackagingState','packagingPaperColor','packagingOuterColor','packagingInnerColor','ensureDecorationState','surfaceColorSlot','surfaceColorBucket','defaultSurfaceColor','resolvedSurfaceColor','packagingFaceMatchesPlacement','packagingRoundedRectPath','packagingFeatureHoles','applyFeaturesAndSurfaceColours');
let functions=names.map(box.fn).join('\n');
functions=functions.replace(/ {2}if\(selectedFaceSnapshot[^\n]+\n/,'');
const boxAst=ts.createSourceFile('app.js',box.text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const constants=[];
for(const statement of boxAst.statements)if(ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations)if(['PACKAGING_BOX_TYPES','PACKAGING_FLUTES','PACKAGING_PAPERS','PACKAGING_CATALOG_SCHEMA_VERSION'].includes(declaration.name.getText(boxAst)))constants.push('const '+declaration.getText(boxAst)+';');
const boxSource=`// Exact surface/closure functions extracted from cardbox-configurator/js/app.js
// at 05329b7. Uses the final inside/outside surface pipeline, not legacy makeSurfaceMesh.
import * as THREE from 'three';
const EPSILON=1e-6,LID_LIFT_MM=300,CARDBOX_TOOL_LID_ANGLE=Math.PI*.58;
${constants.join('\n')}
export function buildModel(input){
  const type=Object.hasOwn(PACKAGING_BOX_TYPES,input.style)?input.style:'standard';
  const def=PACKAGING_BOX_TYPES[type];
  const w=Math.min(800,Math.max(200,Number(input.width)||def.dims[0])),d=Math.min(600,Math.max(150,Number(input.depth)||def.dims[1])),h=Math.min(500,Math.max(50,Number(input.height)||def.dims[2]));
  const DEFAULT_COLOR=input.colour||'#b88959';
  const state={boxes:[makeBaseBox(w,d,h)],boxType:type,closures:{top:def.topOptions.includes(input.top)?input.top:def.top,bottom:def.bottomOptions.includes(input.bottom)?input.bottom:def.bottom}};
  ensurePackagingState();ensureDecorationState();
  // Existing website swatches select original production outer papers.
  state.board.layers[0].paper=input.colour==='#f1efe7'?'white-top-testliner':input.colour==='#a87342'?'kraftliner':'testliner-natural';
  if(['TFT','AFT','AFA'].includes(input.paper)){state.board.preset=input.paper;state.board.layers=packagingDefaultLayers('CO3',input.paper);}
  const group=new THREE.Group(),packagingClosureGroup=new THREE.Group(),packagingFeatureGroup=new THREE.Group();
  const currentBoxes=()=>state.boxes,isLidLiftActive=()=>false,clearGroup=g=>g.clear();
  const descriptors=mergeTiles(collectBoundaryTiles(buildUnionGrid(state.boxes)));
  const surfaceMeshes=[];
  for(const face of descriptors){
    const outer=makeColoredSurfaceMesh(face,1),inner=makeColoredSurfaceMesh(face,-1);
    const edges=new THREE.LineSegments(new THREE.EdgesGeometry(outer.geometry),new THREE.LineBasicMaterial({color:0x755335,transparent:true,opacity:.38,depthTest:true}));
    outer.add(edges);surfaceMeshes.push(outer,inner);
  }
  group.add(...surfaceMeshes,packagingClosureGroup,packagingFeatureGroup);
  applyFeaturesAndSurfaceColours();packagingRenderClosureVisuals();
  surfaceMeshes.forEach(mesh=>{if(mesh.userData.top)mesh.visible=state.closures.top!=='open';if(mesh.userData.bottom)mesh.visible=state.closures.bottom!=='open';});
  const progress=Math.min(1,Math.max(0,Number(input.open)/100));
  for(const mesh of surfaceMeshes)if(mesh.userData.top)transformToolRenderable(mesh,'top',progress);
  for(const object of packagingClosureGroup.children){object.geometry.computeBoundingBox();if(object.geometry.boundingBox.min.y>=h)transformToolRenderable(object,'top',progress);}
  group.scale.setScalar(.001);
  return {group,metrics:{litres:w*d*h/1e6}};
  ${functions}
}
`;
let patch='*** Begin Patch\n';
// Tiny renderer-free catalogue: original defaults, translations and SVG icons.
let copyDeclaration;
for(const statement of boxAst.statements)if(ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations)if(declaration.name.getText(boxAst)==='PACKAGING_COPY')copyDeclaration='const '+declaration.getText(boxAst)+';';
const native=vm.runInNewContext(constants.join('\n')+'\n'+copyDeclaration+'\n'+box.fn('packagingTypeKey')+'\n({types:PACKAGING_BOX_TYPES,copy:PACKAGING_COPY,key:packagingTypeKey})');
native.copy={en:native.copy['en-US'],ro:native.copy['ro-RO'],de:native.copy['de-DE']};
const html=fs.readFileSync(new URL('cardbox-configurator/index.html',root),'utf8');
const catalog=Object.entries(native.types).map(([id,def])=>{const button=html.match(new RegExp('data-box-type="'+id+'"[^>]*>([\\s\\S]*?)</button>'))[1];return {id,...def,labels:Object.fromEntries(['en','ro','de'].map(locale=>[locale,native.copy[locale][native.key(id)]])),icon:button.match(/<svg[\s\S]*?<\/svg>/)[0]};});
const metadata=JSON.stringify({styles:catalog,copy:Object.fromEntries(['en','ro','de'].map(locale=>[locale,Object.fromEntries(Object.entries(native.copy[locale]).filter(([key])=>key.startsWith('closure.')||key.startsWith('board.')))]))},null,2)+'\n';
const metadataPath=new URL('../lib/cardbox-catalog.json',import.meta.url).pathname;
if(fs.existsSync(metadataPath))patch+='*** Update File: '+metadataPath+'\n@@\n'+fs.readFileSync(metadataPath,'utf8').trimEnd().split('\n').map(l=>'-'+l).join('\n')+'\n'+metadata.trimEnd().split('\n').map(l=>'+'+l).join('\n')+'\n';
else patch+='*** Add File: '+metadataPath+'\n'+metadata.trimEnd().split('\n').map(l=>'+'+l).join('\n')+'\n';
for(const [file,content] of [['tiles.js',tileSource],['cardbox.js',boxSource]]){
 const path=new URL('../lib/scenes/lite/'+file,import.meta.url).pathname,old=fs.readFileSync(path,'utf8');
 patch+='*** Update File: '+path+'\n@@\n'+old.trimEnd().split('\n').map(l=>'-'+l).join('\n')+'\n'+content.trimEnd().split('\n').map(l=>'+'+l).join('\n')+'\n';
}
process.stdout.write(patch+'*** End Patch\n');
