"use client";

import { useEffect } from "react";

export function SmoothScroll() {
  useEffect(() => {
    // Native scrolling is substantially more predictable on touch screens and avoids
    // the desktop showcase pinning choreography fighting the mobile control deck.
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      window.matchMedia("(max-width: 720px), (pointer: coarse)").matches
    ) return;
    let cancelled = false;
    let cleanup = () => {};
    Promise.all([import("lenis"), import("gsap"), import("gsap/ScrollTrigger")]).then(([lenisModule, gsapModule, triggerModule]) => {
      if (cancelled) return;
      const Lenis = lenisModule.default;
      const gsap = gsapModule.gsap;
      const ScrollTrigger = triggerModule.ScrollTrigger;
      gsap.registerPlugin(ScrollTrigger);
      const lenis = new Lenis({ duration: 1.08, smoothWheel: true, touchMultiplier: 1.15 });
      const update = (time: number) => lenis.raf(time * 1000);
      gsap.ticker.add(update);
      gsap.ticker.lagSmoothing(0);
      lenis.on("scroll", ScrollTrigger.update);
      document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((element) => {
        gsap.fromTo(element, { y: 48, opacity: 0 }, {
          y: 0, opacity: 1, duration: 1.1, ease: "power3.out",
          scrollTrigger: { trigger: element, start: "top 88%", once: true },
        });
      });
      document.querySelectorAll<HTMLElement>(".spatial-showcase").forEach((section) => {
        const sticky = section.querySelector<HTMLElement>(".showcase-sticky");
        if (!sticky) return;
        gsap.set(sticky, { transformOrigin: "50% 52%" });
        ScrollTrigger.create({
          trigger: section,
          start: "top 100%",
          end: "bottom 0%",
          onUpdate: ({ progress }) => {
            const enter = gsap.utils.clamp(0, 1, progress / 0.18);
            const exit = gsap.utils.clamp(0, 1, (1 - progress) / 0.2);
            const visibility = Math.min(enter, exit);
            gsap.set(sticky, {
              autoAlpha: visibility,
              scale: 1 - (1 - enter) * 0.045 + (1 - exit) * 0.045,
              y: (1 - enter) * 32 - (1 - exit) * 28,
              pointerEvents: visibility > 0.92 ? "auto" : "none",
            });
          },
        });
      });
      cleanup = () => { gsap.ticker.remove(update); lenis.destroy(); ScrollTrigger.getAll().forEach((item) => item.kill()); };
    });
    return () => { cancelled = true; cleanup(); };
  }, []);
  return null;
}
