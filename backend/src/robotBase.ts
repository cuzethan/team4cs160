const DEFAULT_BASE = { latitude: 37.3382, longitude: -121.8863 };

function configuredCoordinate(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be a number between ${min} and ${max}.`);
  }
  return value;
}

/** Shared configured depot/base location for robot seeding, geocoding bias and resets. */
export function getRobotBaseLocation() {
  return {
    latitude: configuredCoordinate("ROBOT_BASE_LATITUDE", DEFAULT_BASE.latitude, -90, 90),
    longitude: configuredCoordinate("ROBOT_BASE_LONGITUDE", DEFAULT_BASE.longitude, -180, 180),
  };
}

export type RobotBaseLocation = { latitude: number; longitude: number };

export function configureRobotBaseLocation(base: RobotBaseLocation) {
  process.env.ROBOT_BASE_LATITUDE = String(base.latitude);
  process.env.ROBOT_BASE_LONGITUDE = String(base.longitude);
}

/** Treat a robot within roughly 15 meters of the depot as being home. */
export function isAtRobotBaseLocation(latitude: number | null, longitude: number | null, base = getRobotBaseLocation()) {
  if (latitude === null || longitude === null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  const earthRadiusMeters = 6_371_000;
  const radians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = radians(base.latitude - latitude);
  const longitudeDelta = radians(base.longitude - longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(latitude)) * Math.cos(radians(base.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) <= 15;
}
