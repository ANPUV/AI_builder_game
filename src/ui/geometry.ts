import { recipe } from '../data';
import type { LinkShape, Machine } from '../engine/types';
import { inputPorts, outputPorts } from '../engine/factory';

export const NODE_W = 196;
export const HEADER_H = 36;
export const ROW_H = 24;
export const FOOTER_H = 34;

export interface Point {
  x: number;
  y: number;
}

export function portRows(m: Machine): number {
  return Math.max(1, inputPorts(m).length, outputPorts(m).length);
}

export function nodeHeight(m: Machine): number {
  return HEADER_H + portRows(m) * ROW_H + FOOTER_H;
}

const rowCenterY = (index: number): number => HEADER_H + index * ROW_H + ROW_H / 2;

export function inputPortPos(m: Machine, itemId: string): Point {
  const index = Math.max(0, inputPorts(m).indexOf(itemId));
  return { x: m.x, y: m.y + rowCenterY(index) };
}

export function outputPortPos(m: Machine, itemId: string): Point {
  const index = Math.max(0, outputPorts(m).indexOf(itemId));
  return { x: m.x + NODE_W, y: m.y + rowCenterY(index) };
}

/** Where a link should attach on the destination. */
export function inboundPos(m: Machine, itemId: string): Point {
  return inputPortPos(m, itemId);
}

export function linkPath(from: Point, to: Point, shape: LinkShape = 'curve'): string {
  if (shape === 'straight') return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;

  if (shape === 'elbow') {
    // Leave each port horizontally before turning, so the corner never lands
    // on the node edge and the belt reads as leaving the port it belongs to.
    const stub = 22;
    const ax = from.x + stub;
    const bx = to.x - stub;
    const mid = Math.abs(bx - ax) < 1 ? ax : (ax + bx) / 2;
    return (
      `M ${from.x} ${from.y} L ${ax} ${from.y} L ${mid} ${from.y} ` +
      `L ${mid} ${to.y} L ${bx} ${to.y} L ${to.x} ${to.y}`
    );
  }

  const dx = Math.min(160, Math.max(45, Math.abs(to.x - from.x) * 0.5));
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
}

/** Fraction 0..1 of the current craft cycle, for the node progress bar. */
export function craftProgress(m: Machine): number {
  const r = recipe(m.recipeId);
  if (!r || !m.crafting) return 0;
  return Math.min(1, m.progress / r.seconds);
}
