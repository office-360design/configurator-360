"use client";

import { useEffect, useRef, useState } from "react";

export type PricingSolidShape = "d4" | "d6" | "d8" | "d10" | "d12" | "d20";

const faceWord = (value: string) => value.trim().split(/[ /+]/)[0].replace(/[^\p{L}\p{N}-]/gu, "");

export function PricingSolid({ shape, items, description, descriptions, label, onSelect }: { shape: PricingSolidShape; items: readonly string[]; description: string; descriptions?: readonly string[]; label: string; onSelect?: (index: number) => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const selectRef = useRef<(index: number) => void>(() => undefined);
  const [active, setActive] = useState(0);
  const itemLabels = items.join("\u001f");
  const onSelectRef = useRef(onSelect);
  useEffect(()=>{onSelectRef.current=onSelect;},[onSelect]);

  useEffect(() => {
    const container = stage.current;
    if (!container || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const labels = itemLabels.split("\u001f");
    let disposed = false;
    let destroy = () => undefined;
    const observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting || disposed) return;
      observer.disconnect();
      const THREE = await import("three");
      if (disposed) return;

      const trapezohedronEdges: number[] = [];
      const trapezohedron = () => {
        const ringOffset=.14;
        const ring = Array.from({ length: 10 }, (_, index) => new THREE.Vector3(Math.cos(index * Math.PI / 5) * 1.12, index % 2 ? -ringOffset : ringOffset, Math.sin(index * Math.PI / 5) * 1.12));
        const top = new THREE.Vector3(0, 1.34, 0), bottom = new THREE.Vector3(0, -1.34, 0), values: number[] = [];
        const tri = (a: InstanceType<typeof THREE.Vector3>, b: InstanceType<typeof THREE.Vector3>, c: InstanceType<typeof THREE.Vector3>) => values.push(a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z);
        const edge=(a:InstanceType<typeof THREE.Vector3>,b:InstanceType<typeof THREE.Vector3>)=>trapezohedronEdges.push(a.x,a.y,a.z,b.x,b.y,b.z);
        for (let i=0;i<5;i++){const even=i*2,odd=even+1,next=(even+2)%10;tri(top,ring[even],ring[odd]);tri(top,ring[odd],ring[next]);edge(top,ring[even]);edge(ring[even],ring[odd]);edge(ring[odd],ring[next]);edge(ring[next],top);}
        for (let i=0;i<5;i++){const odd=i*2+1,even=(odd+1)%10,next=(odd+2)%10;tri(bottom,ring[odd],ring[even]);tri(bottom,ring[even],ring[next]);edge(bottom,ring[odd]);edge(ring[odd],ring[even]);edge(ring[even],ring[next]);edge(ring[next],bottom);}
        const result = new THREE.BufferGeometry(); result.setAttribute("position",new THREE.Float32BufferAttribute(values,3)); return result;
      };
      const source = shape === "d4" ? new THREE.TetrahedronGeometry(1.45) : shape === "d6" ? new THREE.BoxGeometry(2.05,2.05,2.05) : shape === "d8" ? new THREE.OctahedronGeometry(1.48) : shape === "d10" ? trapezohedron() : shape === "d12" ? new THREE.DodecahedronGeometry(1.35) : new THREE.IcosahedronGeometry(1.43);
      const geometry = source.index ? source.toNonIndexed() : source; if (geometry !== source) source.dispose();
      const scene = new THREE.Scene(); const camera = new THREE.OrthographicCamera(-2,2,2,-2,.1,20); camera.position.z=6;
      const renderer = new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:"low-power"}); renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.setClearColor(0,0); container.prepend(renderer.domElement);const styles=getComputedStyle(document.documentElement),siteSans=getComputedStyle(document.body).fontFamily||"Arial, sans-serif",siteMono=styles.getPropertyValue("--font-geist-mono").trim()||"monospace";
      const neutral = new THREE.MeshBasicMaterial({color:0xf0f3f1,side:THREE.DoubleSide,depthWrite:true});
      const selected = new THREE.MeshBasicMaterial({color:0xe9f2f7,side:THREE.DoubleSide,depthWrite:true});
      const edgeGeometry=shape==="d10"?new THREE.BufferGeometry():new THREE.EdgesGeometry(geometry,20);if(shape==="d10")edgeGeometry.setAttribute("position",new THREE.Float32BufferAttribute(trapezohedronEdges,3));
      const mesh = new THREE.Mesh(geometry,[neutral,selected]); const edges = new THREE.LineSegments(edgeGeometry,new THREE.LineBasicMaterial({color:0x0877c9})); const group=new THREE.Group(); group.add(mesh,edges); scene.add(group);
      const triangleCount=geometry.attributes.position.count/3, perFace=Math.max(1,Math.floor(triangleCount/labels.length));
      const washCanvas=document.createElement("canvas");washCanvas.width=128;washCanvas.height=128;const washContext=washCanvas.getContext("2d");if(washContext){const wash=washContext.createLinearGradient(0,0,128,128);wash.addColorStop(0,"rgba(8,119,201,.3)");wash.addColorStop(.48,"rgba(8,119,201,.08)");wash.addColorStop(1,"rgba(255,255,255,0)");washContext.fillStyle=wash;washContext.fillRect(0,0,128,128);}const washTexture=new THREE.CanvasTexture(washCanvas);washTexture.colorSpace=THREE.SRGBColorSpace;
      const labelTextures: InstanceType<typeof THREE.CanvasTexture>[]=[],labelPanels: InstanceType<typeof THREE.Mesh>[]=[],faceWashes: InstanceType<typeof THREE.MeshBasicMaterial>[]=[],insetGeometries: InstanceType<typeof THREE.BufferGeometry>[]=[],faceNormals: InstanceType<typeof THREE.Vector3>[]=[],faceUps: InstanceType<typeof THREE.Vector3>[]=[];
      const insetMaterial=new THREE.LineBasicMaterial({color:0x78a9c8,transparent:true,opacity:.72});
      const position=geometry.attributes.position;
      for(let face=0;face<labels.length;face++){
        const start=face*perFace*3,end=Math.min(position.count,start+perFace*3);const center=new THREE.Vector3(),unique=new Map<string,InstanceType<typeof THREE.Vector3>>();for(let vertex=start;vertex<end;vertex++){const point=new THREE.Vector3(position.getX(vertex),position.getY(vertex),position.getZ(vertex));center.add(point);unique.set(`${point.x.toFixed(4)}:${point.y.toFixed(4)}:${point.z.toFixed(4)}`,point);}center.divideScalar(Math.max(1,end-start));const a=new THREE.Vector3(position.getX(start),position.getY(start),position.getZ(start)),b=new THREE.Vector3(position.getX(start+1),position.getY(start+1),position.getZ(start+1)),c=new THREE.Vector3(position.getX(start+2),position.getY(start+2),position.getZ(start+2)),normal=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)).normalize();if(normal.dot(center)<0)normal.negate();
        const faceUp=Math.abs(normal.y)>.9?new THREE.Vector3(0,0,1):new THREE.Vector3(0,1,0);faceUp.addScaledVector(normal,-faceUp.dot(normal)).normalize();const axisV=faceUp,axisU=new THREE.Vector3().crossVectors(axisV,normal).normalize(),faceRotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(axisU,axisV,normal));faceNormals.push(normal.clone());faceUps.push(faceUp.clone());const local=[...unique.values()].map(point=>({point,x:new THREE.Vector3().subVectors(point,center).dot(axisU),y:new THREE.Vector3().subVectors(point,center).dot(axisV)}));const ordered=local.slice().sort((left,right)=>Math.atan2(left.y,left.x)-Math.atan2(right.y,right.x));const minX=Math.min(...local.map(item=>item.x)),maxX=Math.max(...local.map(item=>item.x)),minY=Math.min(...local.map(item=>item.y)),maxY=Math.max(...local.map(item=>item.y)),faceWidth=maxX-minX,faceHeight=maxY-minY,faceScale=Math.min(faceWidth,faceHeight);
        const washShape=new THREE.Shape();ordered.forEach((item,index)=>index?washShape.lineTo(item.x,item.y):washShape.moveTo(item.x,item.y));washShape.closePath();const washMaterial=new THREE.MeshBasicMaterial({map:washTexture,transparent:true,opacity:face===0?1:.38,side:THREE.FrontSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});const washPanel=new THREE.Mesh(new THREE.ShapeGeometry(washShape),washMaterial);washPanel.position.copy(center).addScaledVector(normal,.007);washPanel.quaternion.copy(faceRotation);faceWashes.push(washMaterial);labelPanels.push(washPanel);group.add(washPanel);
        const makeTextPanel=(text:string,color:string,font:string,panelWidth:number,panelHeight:number,location:InstanceType<typeof THREE.Vector3>)=>{const canvas=document.createElement("canvas");canvas.width=512;canvas.height=144;const context=canvas.getContext("2d");if(!context)return;context.scale(2,2);context.clearRect(0,0,256,72);context.fillStyle=color;context.textAlign="center";context.textBaseline="middle";context.font=font;context.fillText(text,128,39,246);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());labelTextures.push(texture);const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.FrontSide,depthTest:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});const panel=new THREE.Mesh(new THREE.PlaneGeometry(panelWidth,panelHeight),material);panel.position.copy(location).addScaledVector(normal,.018);panel.quaternion.copy(faceRotation);labelPanels.push(panel);group.add(panel);};
        const centralLabel=faceWord(labels[face]).toUpperCase().slice(0,12),centralFont=centralLabel.length>7?30:centralLabel.length>5?36:42;
        makeTextPanel(centralLabel,"#101719",`600 ${centralFont}px ${siteSans}`,Math.min(faceWidth*.72,1.28),Math.min(faceHeight*.29,.4),center);
        const halfWidth=Math.max(faceWidth/2,.0001),halfHeight=Math.max(faceHeight/2,.0001);let markerPair:{number:typeof local[number],dot:typeof local[number],score:number}|undefined;for(const number of local){for(const dot of local){if(number===dot||number.y<=dot.y)continue;const numberX=number.x/halfWidth,numberY=number.y/halfHeight,dotX=dot.x/halfWidth,dotY=dot.y/halfHeight,score=(numberX-numberY)+(dotX+dotY);if(!markerPair||score<markerPair.score)markerPair={number,dot,score};}}if(!markerPair){markerPair={number:local[0],dot:local[Math.min(1,local.length-1)],score:0};}const numberPosition=new THREE.Vector3().lerpVectors(markerPair.number.point,center,.19),dotPosition=new THREE.Vector3().lerpVectors(markerPair.dot.point,center,.19),numberHeight=Math.max(faceScale*.115,.09);
        makeTextPanel(String(face+1).padStart(2,"0"),"#0877c9",`600 31px ${siteMono}`,numberHeight*3.55,numberHeight,numberPosition);
        const dotMaterial=new THREE.MeshBasicMaterial({color:0x0877c9,side:THREE.DoubleSide});const dot=new THREE.Mesh(new THREE.CircleGeometry(Math.max(faceScale*.018,.012),18),dotMaterial);dot.position.copy(dotPosition).addScaledVector(normal,.02);dot.quaternion.copy(faceRotation);labelPanels.push(dot);group.add(dot);
        const insetPoints=ordered.map(item=>new THREE.Vector3().lerpVectors(center,item.point,.91).addScaledVector(normal,.014));const insetGeometry=new THREE.BufferGeometry().setFromPoints(insetPoints);insetGeometries.push(insetGeometry);group.add(new THREE.LineLoop(insetGeometry,insetMaterial));
      }
      const highlight=(index:number)=>{geometry.clearGroups();for(let triangle=0;triangle<triangleCount;triangle++)geometry.addGroup(triangle*3,3,Math.min(labels.length-1,Math.floor(triangle/perFace))===index?1:0);faceWashes.forEach((material,face)=>material.opacity=face===index?1:.38);};
      const targetQuaternion=new THREE.Quaternion(),desiredNormal=new THREE.Vector3(.42,.25,.87).normalize(),desiredUp=new THREE.Vector3(0,1,0).projectOnPlane(desiredNormal).normalize();const orientFace=(index:number)=>{const align=new THREE.Quaternion().setFromUnitVectors(faceNormals[index],desiredNormal),alignedUp=faceUps[index].clone().applyQuaternion(align).projectOnPlane(desiredNormal).normalize(),twist=Math.atan2(desiredNormal.dot(alignedUp.clone().cross(desiredUp)),alignedUp.dot(desiredUp));targetQuaternion.copy(new THREE.Quaternion().setFromAxisAngle(desiredNormal,twist).multiply(align));};
      let drag=false,moved=false,x=0,y=0,raf=0,width=1,height=1;
      selectRef.current=(index)=>{setActive(index);onSelectRef.current?.(index);highlight(index);orientFace(index);}; highlight(0);orientFace(0);group.quaternion.copy(targetQuaternion);
      const resize=()=>{width=container.clientWidth;height=container.clientHeight;renderer.setSize(width,height,false);const aspect=width/Math.max(height,1),viewHeight=3.75;camera.left=-viewHeight*aspect/2;camera.right=viewHeight*aspect/2;camera.top=viewHeight/2;camera.bottom=-viewHeight/2;camera.updateProjectionMatrix();}; const ro=new ResizeObserver(resize);ro.observe(container);resize();
      const down=(event:PointerEvent)=>{drag=true;moved=false;x=event.clientX;y=event.clientY;renderer.domElement.setPointerCapture(event.pointerId);};
      const move=(event:PointerEvent)=>{if(!drag)return;const dx=event.clientX-x,dy=event.clientY-y;moved||=Math.abs(dx)+Math.abs(dy)>3;const yaw=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),dx*.009),pitch=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),dy*.009);targetQuaternion.premultiply(yaw).premultiply(pitch);x=event.clientX;y=event.clientY;};
      const up=(event:PointerEvent)=>{drag=false;if(moved)return;const ray=new THREE.Raycaster(),pointer=new THREE.Vector2(event.offsetX/width*2-1,-event.offsetY/height*2+1);ray.setFromCamera(pointer,camera);const hit=ray.intersectObject(mesh)[0];if(hit?.faceIndex!=null)selectRef.current(Math.min(labels.length-1,Math.floor(hit.faceIndex/perFace)));};
      renderer.domElement.addEventListener("pointerdown",down);renderer.domElement.addEventListener("pointermove",move);renderer.domElement.addEventListener("pointerup",up);
      const animate=()=>{group.quaternion.slerp(targetQuaternion,.08);renderer.render(scene,camera);raf=requestAnimationFrame(animate);};animate();
      destroy=()=>{cancelAnimationFrame(raf);ro.disconnect();renderer.domElement.removeEventListener("pointerdown",down);renderer.domElement.removeEventListener("pointermove",move);renderer.domElement.removeEventListener("pointerup",up);geometry.dispose();edges.geometry.dispose();neutral.dispose();selected.dispose();insetMaterial.dispose();insetGeometries.forEach(item=>item.dispose());(edges.material as InstanceType<typeof THREE.LineBasicMaterial>).dispose();labelPanels.forEach(panel=>{panel.geometry.dispose();(panel.material as InstanceType<typeof THREE.MeshBasicMaterial>).dispose();});labelTextures.forEach(texture=>texture.dispose());washTexture.dispose();renderer.dispose();renderer.domElement.remove();};
    },{rootMargin:"220px"}); observer.observe(container);
    return()=>{disposed=true;observer.disconnect();destroy();};
  },[shape,itemLabels]);

  return <div className="product-feature-system pricing-solid" aria-label={label}>
    <div className="product-cube-stage pricing-solid-stage" ref={stage}/>
    <div className={`product-feature-tabs pricing-solid-tabs pricing-solid-tabs-${items.length}`}>{items.map((item,index)=><button type="button" className={active===index?"active":""} aria-label={item} aria-pressed={active===index} onClick={()=>selectRef.current(index)} key={item}><span>{String(index+1).padStart(2,"0")}</span>{faceWord(item)}</button>)}</div>
    <p className="product-feature-description pricing-solid-description"><b>{items[active]}</b>{descriptions?.[active] ?? description}</p>
  </div>;
}
