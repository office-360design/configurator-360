// Defer taps until release so the first finger of a pinch cannot add geometry.
export function setupEditorTouch(editor) {
  const svg = editor.svg;
  const touches = new Map();
  let pending = null;
  let gesture = null;
  let navigating = false;
  const midpoint = points => ({
    clientX: (points[0].clientX + points[1].clientX) / 2,
    clientY: (points[0].clientY + points[1].clientY) / 2,
  });
  const distance = points => Math.hypot(points[0].clientX - points[1].clientX, points[0].clientY - points[1].clientY);
  const consume = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  const reset = () => {
    editor.endDrag(null, true);
    touches.clear();
    pending = gesture = null;
    navigating = false;
  };
  svg.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch') return;
    consume(event);
    touches.set(event.pointerId, event);
    svg.setPointerCapture(event.pointerId);
    if (touches.size === 1 && !navigating) pending = event;
    if (touches.size === 2) {
      navigating = true;
      pending = null;
      editor.endDrag(null, true);
      for (const id of touches.keys()) svg.setPointerCapture(id);
      const points = [...touches.values()];
      gesture = { anchor: editor.rawPointer(midpoint(points)), distance: Math.max(1, distance(points)), span: editor.span };
    }
  }, true);
  svg.addEventListener('pointermove', event => {
    if (event.pointerType !== 'touch' || !touches.has(event.pointerId)) return;
    consume(event);
    touches.set(event.pointerId, event);
    if (navigating) {
      if (touches.size !== 2 || !gesture) return;
      const points = [...touches.values()];
      const mid = midpoint(points);
      const local = new DOMPoint(mid.clientX, mid.clientY).matrixTransform(svg.getScreenCTM().inverse());
      editor.span = Math.max(4, Math.min(220, gesture.span * gesture.distance / Math.max(1, distance(points))));
      const scale = 550 / editor.span;
      editor.center = { x: gesture.anchor.x - (local.x - 400) / scale, z: gesture.anchor.z - (local.y - 300) / scale };
      editor.render();
      return;
    }
    if (pending && Math.hypot(event.clientX - pending.clientX, event.clientY - pending.clientY) >= 5 &&
        (editor.panEnabled || (editor.mode === 'select' && !editor.dormer && !editor.meet &&
          (!editor.windowTool.active || pending.target.dataset.roofWindow !== undefined)))) {
      editor.click(pending);
      pending = null;
    }
    if (editor.drag) editor.movePoint(event);
  }, true);
  for (const type of ['pointerup', 'pointercancel']) svg.addEventListener(type, event => {
    if (event.pointerType !== 'touch' || !touches.has(event.pointerId)) return;
    consume(event);
    if (!navigating && type === 'pointerup' && pending) editor.click(pending);
    editor.endDrag(event, type === 'pointercancel');
    touches.delete(event.pointerId);
    pending = null;
    if (touches.size < 2) gesture = null;
    if (!touches.size) navigating = false;
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
  }, true);
  editor.dialog.addEventListener('close', reset);
  window.addEventListener('blur', reset);
}
