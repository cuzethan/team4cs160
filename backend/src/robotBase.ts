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
