"use client";

import { useEffect } from 'react';
import { trackWebsiteEvent } from '../lib/website-analytics.js';

const SCRIPT_URL = 'https://cdn.swiftcallback.com/scb.js?key=RtWCjzUgCRz6v8UBCNKzc1MhWMHqOePBX';

export function SwiftCallback() {
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let idle: number | undefined;
    const load = () => {
      if (cancelled || document.querySelector('script[data-swift-callback]')) return;
      const script = document.createElement('script');
      script.src = SCRIPT_URL; script.async = true; script.charset = 'UTF-8';
      script.dataset.swiftCallback = 'true';
      document.head.appendChild(script);
    };
    // Never gate the contact service on Analytics consent. Its own consent and
    // backend remain untouched. Move its payload off the initial render path.
    const afterLoad = () => {
      if (cancelled) return;
      const requestIdle = window.requestIdleCallback;
      if (requestIdle) idle = requestIdle.call(window, load, {timeout: 1500});
      else timer = setTimeout(load, 300);
    };
    if (document.readyState === 'complete') afterLoad();
    else window.addEventListener('load', afterLoad, {once: true});
    // A visitor who interacts before load does not have to wait for idle.
    document.addEventListener('pointerdown', load, {once: true, passive: true});
    document.addEventListener('keydown', load, {once: true});
    const intent = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('.swift-widget-button')) {
        trackWebsiteEvent('contact_intent', {method: 'callback'});
      }
    };
    document.addEventListener('click', intent);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (idle !== undefined) window.cancelIdleCallback?.(idle);
      window.removeEventListener('load', afterLoad);
      document.removeEventListener('pointerdown', load);
      document.removeEventListener('keydown', load);
      document.removeEventListener('click', intent);
    };
  }, []);
  return null;
}
