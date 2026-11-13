import { INITIAL_SPEED, MAX_SPEED, speedAt, CONTAINER_SIZE } from './race.js';

export const difficultyAt = distance => (speedAt(distance) - INITIAL_SPEED) / (MAX_SPEED - INITIAL_SPEED);

export function obstacleRow(at, laneCount, random = Math.random) {
  const difficulty = difficultyAt(at);
  const lanes = Array.from({ length: laneCount }, (_, i) => i + (5 - laneCount) / 2);
  for (let i = lanes.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
  }
  const minimum = laneCount === 5 ? 2 : 1;
  const blocked = Math.min(laneCount - 1, minimum + Math.floor((laneCount - 1 - minimum) * difficulty + random()));
  return lanes.slice(0, blocked).map((lane, index) => {
    const container = at >= 110 && ((at < 175 && index === 0) || random() < .22 + difficulty * .35);
    const bird = !container && at > 200 && random() < .24 + difficulty * .18;
    return { at, lane, type: container ? 'CONTAINER' : bird ? 'PTERODACTYL' : random() < .45 ? 'CACTUS_LARGE' : 'CACTUS_SMALL',
      count: container || bird ? 1 : 1 + Math.floor(random() * 3),
      height: bird ? Math.floor(random() * 3) : 0, variant: Math.floor(random() * 4) };
  });
}

export function rowGapAt(distance, random = Math.random) {
  const difficulty = difficultyAt(distance);
  const seconds = 2.55 - difficulty * .95 + random() * .25;
  // Keep time for four lane changes after the rear of a container has passed.
  return speedAt(distance) * 14 * seconds + CONTAINER_SIZE.depth + 5;
}
