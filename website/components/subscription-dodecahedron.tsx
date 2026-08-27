"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export function SubscriptionDodecahedron({ label }: { label: string }) {
  const mount = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(11);

  useEffect(() => {
    const container = mount.current;
    if (!container || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, .1, 20);
    camera.position.set(0, 0, 5.4);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const group = new THREE.Group();
    const geometry = new THREE.DodecahedronGeometry(1.55, 0);
    const shell = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x2f9be8, transparent: true, opacity: .055, depthWrite: false }));
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: 0x2f9be8, transparent: true, opacity: .86 }));
    const inner = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.DodecahedronGeometry(1.12, 0)), new THREE.LineBasicMaterial({ color: 0x73838a, transparent: true, opacity: .28 }));
    group.add(shell, edges, inner); scene.add(group);
    group.rotation.set(-.3, .45, .08);

    let width = 0, height = 0, raf = 0, disposed = false, dragging = false, previousX = 0, previousY = 0;
    const resize = () => { width = container.clientWidth; height = container.clientHeight; renderer.setSize(width, height, false); camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix(); };
    const observer = new ResizeObserver(resize); observer.observe(container); resize();
    const down = (event: PointerEvent) => { dragging = true; previousX = event.clientX; previousY = event.clientY; renderer.domElement.setPointerCapture(event.pointerId); };
    const move = (event: PointerEvent) => { if (!dragging) return; group.rotation.y += (event.clientX - previousX) * .008; group.rotation.x += (event.clientY - previousY) * .008; previousX = event.clientX; previousY = event.clientY; };
    const up = () => { dragging = false; };
    renderer.domElement.addEventListener("pointerdown", down); renderer.domElement.addEventListener("pointermove", move); renderer.domElement.addEventListener("pointerup", up);
    const animate = () => { if (disposed) return; if (!dragging) group.rotation.y += .0025; renderer.render(scene, camera); raf = requestAnimationFrame(animate); }; animate();
    return () => { disposed = true; cancelAnimationFrame(raf); observer.disconnect(); renderer.domElement.removeEventListener("pointerdown", down); renderer.domElement.removeEventListener("pointermove", move); renderer.domElement.removeEventListener("pointerup", up); geometry.dispose(); shell.material.dispose(); edges.geometry.dispose(); edges.material.dispose(); inner.geometry.dispose(); inner.material.dispose(); renderer.dispose(); renderer.domElement.remove(); };
  }, []);

  return <div className="cadence-object" aria-label={label}>
    <div className="dodeca-stage" ref={mount}><span>12</span><small>DRAG / ROTATE</small></div>
    <div className="month-ring" aria-label={label}>{Array.from({ length: 12 }, (_, index) => <button type="button" className={active === index ? "active" : ""} onClick={() => setActive(index)} key={index}><span>{String(index + 1).padStart(2, "0")}</span></button>)}</div>
  </div>;
}
