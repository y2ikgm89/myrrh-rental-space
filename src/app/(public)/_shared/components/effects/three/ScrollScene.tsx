"use client";

import { useRef } from "react";
import type { ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { useScrollRef } from "./ThreeCanvas";
import type { ScrollState } from "../core/types";

export interface ScrollSceneProps {
  readonly children: ReactNode;
  /** scroll progress/velocity/direction を受け取るコールバック */
  readonly onScroll?: (state: ScrollState) => void;
}

/**
 * useFrame 内で scrollRef.current を読み、onScroll コールバックを呼ぶ group ラッパー。
 * R3F children がカスタムアニメーションロジックを実装可能。
 */
export function ScrollScene({ children, onScroll }: ScrollSceneProps) {
  const scrollRef = useScrollRef();
  const groupRef = useRef<Group>(null);

  useFrame(() => {
    if (onScroll) {
      onScroll(scrollRef.current);
    }
  });

  return <group ref={groupRef}>{children}</group>;
}
