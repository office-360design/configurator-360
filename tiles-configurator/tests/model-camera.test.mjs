import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixtures/model-results.mjs';
import {validateModelCamera,modelCameraMatrices,imageToGround,groundToImage,assertPhotoMatches} from '../js/modelCamera.js';
const near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const mul=(m,v)=>[0,1,2,3].map(r=>m.slice(r*4,r*4+4).reduce((s,a,i)=>s+a*v[i],0));
for(const pitch of [-5,12,32,57,90]) for(const roll of [-20,0,23])
 test(`metric projection round-trip, proper rotation, all viewport sizes: pitch ${pitch}, roll ${roll}`,()=>{
  const c=validateModelCamera(fixture({pitch,roll,skew:3.7}).geometry);
  for(const [width,height] of [[1200,800],[375,812],[812,375],[540,900]]) {
   const viewport={width,height}, scale=Math.min((width-48)/c.image.width,(height-48)/c.image.height),
    rect={left:(width-scale*c.image.width)/2,top:(height-scale*c.image.height)/2,width:scale*c.image.width,height:scale*c.image.height};
   for(const origin of [{x:0,z:0},{x:5,z:-3}]) {
    const m=modelCameraMatrices(c,viewport,rect,origin,-.16), v=m.view;
    const det=v[0]*(v[5]*v[10]-v[6]*v[9])-v[1]*(v[4]*v[10]-v[6]*v[8])+v[2]*(v[4]*v[9]-v[5]*v[8]);near(det,1);
    // Camera position = -R^T t. Scene Y must be ABOVE the ground, not reflected below it.
    near(-(v[1]*v[3]+v[5]*v[7]+v[9]*v[11]),-.16+c.h);
    let valid=0;
    for(let y=30;y<c.image.height;y+=17) for(let x=10;x<c.image.width;x+=29) {
     const p=imageToGround(c,x+.5,y+.5);if(!p)continue;valid++;
     const q=groundToImage(c,p);near(q.x,x+.5);near(q.y,y+.5);
     const view=mul(v,[p.x-origin.x,-.16,p.z-origin.z,1]), clip=mul(m.projection,view);
     near((clip[0]/clip[3]+1)*width/2,rect.left+(x+.5)/c.image.width*rect.width);
     near((1-clip[1]/clip[3])*height/2,rect.top+(y+.5)/c.image.height*rect.height);
     // Validate raised objects too, independently in the CV frame.
     const raised=mul(m.projection,mul(v,[p.x-origin.x,.34,p.z-origin.z,1]));
     const cv=c.P0.map((a,i)=>a+c.e1[i]*p.x-c.e2[i]*p.z-c.n[i]*.5);
     if(cv[2]>.01){
      near((raised[0]/raised[3]+1)*width/2,rect.left+(c.K[0]*cv[0]+c.K[1]*cv[1]+c.K[2]*cv[2])/cv[2]/c.image.width*rect.width);
      near((1-raised[1]/raised[3])*height/2,rect.top+(c.K[4]*cv[1]+c.K[5]*cv[2])/cv[2]/c.image.height*rect.height);
     }
    }
    assert.ok(valid>0);
   }
  }
 });
for(const [label,mutate] of [
 ['no metric scale',g=>g.model.metric_scale_head=false],['guessed field of view',g=>g.model.fov_input=70],
 ['reflected basis',g=>g.ground_plane.axis_x_camera=g.ground_plane.axis_x_camera.map(v=>-v)],
 ['nonorthogonal basis',g=>g.ground_plane.axis_x_camera[0]+=.1],['height mismatch',g=>g.camera.height_m++],
 ['homography mismatch',g=>g.homography_ground_m_to_image_px[0][0]++],['inverse mismatch',g=>g.homography_image_px_to_ground_m[0][1]++],
 ['bad focal',g=>g.camera.intrinsics_px[0][0]=0],['infinite focal',g=>g.camera.intrinsics_px[0][0]=Infinity],
 ['unsupported K row',g=>g.camera.intrinsics_px[2][0]=.3],['no image id',g=>delete g.image_id],
 ['invalid size',g=>g.image.width=1101],['bad normal',g=>g.ground_plane.normal_camera[0]=NaN],
 ['origin off plane',g=>g.ground_plane.origin_camera_m[1]++],['reference-only source',g=>g.camera.source='reference_rectangle']])
 test(`reject invalid camera: ${label}`,()=>{const g=fixture().geometry;mutate(g);assert.throws(()=>validateModelCamera(g));});
test('resized original photo is accepted; crop/orientation mismatch is rejected',()=>{
 const c=validateModelCamera(fixture().geometry);assertPhotoMatches(c,{width:4000,height:3000});
 assert.throws(()=>assertPhotoMatches(c,{width:3000,height:4000}));assert.throws(()=>assertPhotoMatches(c,null));
});
test('ground projection rejects horizon, behind-camera, and range limits',()=>{
 const c=validateModelCamera(fixture({pitch:0,roll:0}).geometry);
 assert.equal(imageToGround(c,80,0),null);assert.equal(imageToGround(c,80,c.K[5]),null);
 assert.equal(imageToGround(c,80,110,{maxRange:.1}),null);
});
