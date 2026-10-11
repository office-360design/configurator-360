"use client";

import { type Dispatch, type PointerEventHandler, type SetStateAction, useRef } from "react";

export function useMobileDeckSwipe(setCollapsed: Dispatch<SetStateAction<boolean>>) {
  const startY = useRef<number | null>(null);

  const onPointerDown: PointerEventHandler<HTMLElement> = (event) => {
    if (event.pointerType !== "touch") return;
    startY.current = event.clientY;
  };

  const onPointerUp: PointerEventHandler<HTMLElement> = (event) => {
    if (startY.current === null) return;
    const travel = event.clientY - startY.current;
    startY.current = null;
    if (Math.abs(travel) < 28) return;
    setCollapsed(travel > 0);
  };

  const onPointerCancel: PointerEventHandler<HTMLElement> = () => {
    startY.current = null;
  };

  return { onPointerDown, onPointerUp, onPointerCancel };
}
