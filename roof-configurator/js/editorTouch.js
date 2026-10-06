// Defer taps until release so the first finger of a pinch cannot add geometry.
export function setupEditorTouch(editor) {
  const svg = editor.svg;
  const touches = new Map();
  let pending = null;
  let gesture = null;
  let navigating = false;
  let frame = null;
  const midpoint = points => ({
    clientX: (points[0].clientX + points[1].clientX) / 2,
    clientY: (points[0].clientY + points[1].clientY) / 2,
  });
  const distance = points => Math.hypot(points[0].clientX - points[1].clientX, points[0].clientY - points[1].clientY);
  const consume = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  const reset = () => {
    editor.endDrag(null, true);
    cancelAnimationFrame(frame);
    frame = null;
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
      gesture = { midpoint: midpoint(points), mode: null, anchor: editor.rawPointer(midpoint(points)), distance: Math.max(1, distance(points)), span: editor.span };
    }
  }, true);
  function updateGesture() {
    frame = null;
    if (!gesture || touches.size !== 2) return;
    const points = [...touches.values()];
    const mid = midpoint(points);
    const separation = Math.max(1, distance(points));
    const travel = Math.hypot(mid.clientX - gesture.midpoint.clientX, mid.clientY - gesture.midpoint.clientY);
    const spread = Math.abs(separation - gesture.distance);
    // Lock the intent until the fingers lift: small spacing changes during a
    // drag must not turn it into a zoom, nor should pinch wobble move the plan.
    if (!gesture.mode) {
      if (spread >= 10 && spread > travel * 1.2) gesture.mode = 'zoom';
      else if (travel >= 6) gesture.mode = 'pan';
      else return;
    }
    const target = gesture.mode === 'pan' ? mid : gesture.midpoint;
    const local = new DOMPoint(target.clientX, target.clientY).matrixTransform(svg.getScreenCTM().inverse());
    editor.span = gesture.mode === 'pan' ? gesture.span :
      Math.max(4, Math.min(220, gesture.span * gesture.distance / separation));
    const scale = 550 / editor.span;
    editor.center = { x: gesture.anchor.x - (local.x - 400) / scale, z: gesture.anchor.z - (local.y - 300) / scale };
    editor.render();
  }
  svg.addEventListener('pointermove', event => {
    if (event.pointerType !== 'touch' || !touches.has(event.pointerId)) return;
    consume(event);
    touches.set(event.pointerId, event);
    if (navigating) {
      if (touches.size !== 2 || !gesture) return;
      // Both pointer updates arrive separately. Render their latest positions
      // together, never a new position paired with the other finger's old one.
      if (frame === null) frame = requestAnimationFrame(updateGesture);
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
    if (frame !== null) { cancelAnimationFrame(frame); updateGesture(); }
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
