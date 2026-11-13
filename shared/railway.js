import { TRAIN_SPEED } from './race.js';

export const RAIL_FIRST_START = 360;
export const RAIL_PERIOD = 850;
export const RAIL_LENGTH = 300;

export function railSection(index, laneCount = 5, seed = 0) {
  const start = RAIL_FIRST_START + index * RAIL_PERIOD;
  let hash = Math.imul((seed | 0) ^ Math.imul(index + 1, 0x45d9f3b), 0x45d9f3b);
  hash = (hash ^ hash >>> 16) >>> 0;
  const firstLane = (5 - laneCount) / 2;
  const lane = firstLane + (Math.floor(laneCount / 2) + index * 2) % laneCount;
  const turn = lane === firstLane ? 1 : lane === firstLane + laneCount - 1 ? -1 : hash % 2 ? 1 : -1;
  return { index, start, end: start + RAIL_LENGTH, triggerAt: start - 120,
    lane, targetLane: lane + turn, turn, curveStart: start + 55, curveEnd: start + 145 };
}

export function inRailZone(distance) {
  const index = Math.max(0, Math.floor((distance - RAIL_FIRST_START + 155) / RAIL_PERIOD));
  const section = railSection(index);
  return distance >= section.triggerAt - 35 && distance <= section.start + 225;
}

export function trainForSection(index, laneCount = 5, seed = 0) {
  const section = railSection(index, laneCount, seed);
  return { type: 'TRAIN', at: section.start + 210, lane: section.lane,
    section: index, railStart: section.start, railEnd: section.end,
    targetLane: section.targetLane, turn: section.turn, curveStart: section.curveStart, curveEnd: section.curveEnd,
    velocity: TRAIN_SPEED, count: 1, height: 0, variant: 0 };
}
