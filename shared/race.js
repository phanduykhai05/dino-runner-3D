export const MAX_PLAYERS = 5;
export const RESPAWN_DELAY_MS = 3000;
export const RESPAWN_SHIELD_MS = 1000;
export const LANE_WIDTH = 6.4;
export const INITIAL_SPEED = 1.6;
export const MAX_SPEED = 4.4;
export const CONTAINER_SIZE = Object.freeze({ width: 4, height: 5.2, depth: 11 });
export const SKINS = ['dark_rex', 'green_rex', 'triceratops', 'brachiosaurus', 'stegosaurus'];
export const LANE_COLORS = ['#467a54', '#427e9f', '#b58132', '#865b8b', '#ae6653'];
export const laneX = lane => (2 - lane) * LANE_WIDTH;
export const speedAt = distance => Math.min(MAX_SPEED, INITIAL_SPEED + Math.max(0, distance) * .0008);
export const scoreAt = distance => Math.floor(distance * 0.267857);

export function applyInput(player, input) {
  if (!player.alive) return;
  if (input.move === -1 || input.move === 1) {
    player.lane = Math.max(player.laneMin ?? 0, Math.min(player.laneMax ?? 4, (player.lane ?? 2) + input.move));
  }
  if (typeof input.duck === 'boolean') {
    if (input.duck && !player.duckHeld && player.y > 0.02) player.vy -= 1.2;
    player.duckHeld = input.duck;
  }
  if (input.jump === true && player.y <= 0.02) {
    player.vy = 13.8;
    player.duckHeld = false;
  }
  player.duck = player.y <= 0.02 && player.vy <= 0 && player.duckHeld;
}

export function stepLateral(player, dt) {
  const target = laneX(player.lane ?? 2);
  player.x ??= target;
  const limit = LANE_WIDTH / .22 * dt;
  player.x += Math.max(-limit, Math.min(limit, target - player.x));
}

export function stepPlayer(player, dt, speed) {
  if (!player.alive) return;
  stepLateral(player, dt);
  if (player.y > 0 || player.vy > 0) {
    player.vy -= 28 * dt;
    player.y = Math.max(0, player.y + player.vy * dt);
    if (player.y === 0) player.vy = 0;
  }
  player.duck = player.y <= 0.02 && player.vy <= 0 && player.duckHeld;
  const travel = speed * 14 * dt;
  player.scoreDistance = (player.scoreDistance ?? player.distance) + travel;
  player.distance += travel;
}

export function playerBounds(player) {
  if (player.duck) return { minY: player.y + 0.45, maxY: player.y + 1.75, minZ: -1, maxZ: 1.6 };
  if (player.y > 0.02 || player.vy > 0) return { minY: player.y + 0.8, maxY: player.y + 3.1, minZ: -1.05, maxZ: 1.05 };
  return { minY: player.y + 0.425, maxY: player.y + 2.975, minZ: -1.1, maxZ: 1.1 };
}

export function obstacleBounds(obstacle) {
  if (obstacle.type === 'CONTAINER') return {
    minY: .04, maxY: CONTAINER_SIZE.height - .04,
    halfX: CONTAINER_SIZE.width / 2 - .04, halfZ: CONTAINER_SIZE.depth / 2 - .04,
  };
  if (obstacle.type === 'PTERODACTYL') {
    const y = [1.25, 2.15, 3.35][obstacle.height];
    return { minY: y - 0.21, maxY: y + 0.21, halfZ: 0.6, halfX: .3 };
  }
  const height = obstacle.type === 'CACTUS_LARGE' ? 1.85 : 1.35;
  const large = obstacle.type === 'CACTUS_LARGE';
  return { minY: 0.09, maxY: height * (obstacle.count > 1 ? 1.08 : 1) - 0.09,
    halfZ: large ? 0.16 : 0.11, halfX: (large ? 0.77 : 0.58) + (obstacle.count - 1) * (large ? 0.49 : 0.4) - 0.09 };
}

export function hitsObstacle(player, obstacle) {
  const p = playerBounds(player), o = obstacleBounds(obstacle);
  if (Number.isInteger(obstacle.lane)) {
    const x = player.x ?? laneX(player.lane ?? 2);
    if (Math.abs(x - laneX(obstacle.lane)) > o.halfX + (player.duck ? .55 : .5)) return false;
  }
  const z = obstacle.at - player.distance;
  return z + o.halfZ >= p.minZ && z - o.halfZ <= p.maxZ && o.maxY >= p.minY && o.minY <= p.maxY;
}

export function rankPlayers(players) {
  return [...players].sort((a, b) => Number(b.participating) - Number(a.participating)
    || (b.scoreDistance ?? b.distance) - (a.scoreDistance ?? a.distance) || Number(b.alive) - Number(a.alive)
    || (a.homeLane ?? a.lane) - (b.homeLane ?? b.lane))
    .map((player, index) => ({ ...player, rank: index + 1, score: scoreAt(player.scoreDistance ?? player.distance) }));
}
