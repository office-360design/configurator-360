// Synthetic contract fixtures ONLY. No learned-model accuracy is implied.
import { multiply3, inverse3 } from '../../js/modelCamera.js';
export function binaryRLE(mask) {
  const counts=[]; let value=0,count=0;
  for(const v of mask) { if(v===value) count++; else {counts.push(count);count=1;value=v;} }
  counts.push(count); return {encoding:'binary_rle_zero_first_row_major',counts};
}
export function uint8RLE(values) {
  const out=[],counts=[];
  for(const v of values) { if(v===out.at(-1)) counts[counts.length-1]++; else {out.push(v);counts.push(1);} }
  return {encoding:'uint8_rle_row_major',values:out,counts};
}
const rows=m=>[m.slice(0,3),m.slice(3,6),m.slice(6,9)];
export function fixture({width=160,height=120,pitch=32,roll=8,altitude=2.7,skew=0,fx=width*.9,fy=width*.95,
    cx=width*.43,cy=height*.47,imageId='synthetic-metric-test',mask=null}={}) {
  const W=width,H=height,p=pitch*Math.PI/180,r=roll*Math.PI/180,
    n=[Math.sin(r)*Math.cos(p),Math.cos(r)*Math.cos(p),Math.sin(p)],
    unit=a=>{const l=Math.hypot(...a);return a.map(v=>v/l);},
    e2=unit(Math.abs(Math.cos(p))<1e-8?[0,-1,0]:[-n[2]*n[0],-n[2]*n[1],1-n[2]*n[2]]),
    e1=[n[1]*e2[2]-n[2]*e2[1],n[2]*e2[0]-n[0]*e2[2],n[0]*e2[1]-n[1]*e2[0]],
    P0=n.map(v=>v*altitude),K=[fx,skew,cx,0,fy,cy,0,0,1],
    hom=multiply3(K,[e1[0],e2[0],P0[0],e1[1],e2[1],P0[1],e1[2],e2[2],P0[2]]),
    labels=new Uint8Array(W*H).fill(3),support=new Uint8Array(W*H).fill(1);
  for(let y=Math.floor(H*.62);y<Math.floor(H*.91);y++) for(let x=Math.floor(W*.12);x<Math.floor(W*.67);x++) labels[y*W+x]=10;
  for(let y=Math.floor(H*.70);y<Math.floor(H*.80);y++) for(let x=Math.floor(W*.26);x<Math.floor(W*.38);x++) labels[y*W+x]=5;
  for(let y=Math.floor(H*.70);y<Math.floor(H*.87);y++) for(let x=Math.floor(W*.75);x<Math.floor(W*.89);x++) labels[y*W+x]=6;
  if(mask) for(let i=0;i<labels.length;i++) labels[i]=mask[i]?10:3;
  return {
    segmentation:{schema_version:1,image_id:imageId,image:{width:W,height:H},labels:uint8RLE(labels),
      uncertainty:binaryRLE(new Uint8Array(W*H)),ground_hint:binaryRLE(Uint8Array.from(labels,v=>[4,6,10].includes(v)?1:0)),model:{pipeline:'synthetic-test-only'}},
    geometry:{schema_version:1,image_id:imageId,image:{width:W,height:H},model:{id:'synthetic-test-only',metric_scale_head:true,fov_input:null},
      camera:{source:'metric_model',height_m:altitude,pitch_deg:pitch,roll_deg:roll,hfov_deg:70,intrinsics_px:rows(K),accuracy_verified:false},
      ground_plane:{normal_camera:n,distance_m:altitude,origin_camera_m:P0,axis_x_camera:e1,axis_z_camera:e2},
      homography_ground_m_to_image_px:rows(hom),homography_image_px_to_ground_m:rows(inverse3(hom)),ground_support:binaryRLE(support),
      warnings:['Synthetic fixture; no model inference.']}
  };
}
export function prototypeExport(bundle, masks) {
  const g=bundle.geometry;
  return {...g,schema_version:2,geometry_valid:true,geometry_source:'metric_model',models:{camera_model:g.model},
    image:{...g.image,coordinate_space:'working_image_pixels'},
    masks:{included:true,encoding:'binary_rle_zero_first_row_major',...g.image,paving:binaryRLE(masks).counts,
      selection:binaryRLE(masks).counts,ground_support:g.ground_support.counts}};
}
