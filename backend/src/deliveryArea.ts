import type { GeocodedLocation } from "./geocoder.js";
import type { RobotBaseLocation } from "./robotBase.js";
import { ROBOT_SPEED_METERS_PER_SECOND } from "./robotSpeed.js";

const EARTH_RADIUS_MILES = 3_958.8;

export function distanceInMiles(from: GeocodedLocation, to: RobotBaseLocation) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const haversine = Math.min(1, Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(longitudeDelta / 2) ** 2);
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

const METERS_PER_MILE = 1_609.344;
// Streets are longer than a straight line; this is a typical city detour factor.
const ROAD_DISTANCE_FACTOR = 1.3;
// Time for the order to be packed and handed to a robot.
const DISPATCH_ALLOWANCE_MINUTES = 30;

/**
 * Rough minutes from placing an order to its arrival, for checkout. It uses the
 * straight-line distance from the store; the exact time is set once a robot is assigned.
 */
export function estimateDeliveryMinutes(distanceMiles: number) {
  const travelSeconds = (distanceMiles * METERS_PER_MILE * ROAD_DISTANCE_FACTOR) / ROBOT_SPEED_METERS_PER_SECOND;
  const minutes = DISPATCH_ALLOWANCE_MINUTES + travelSeconds / 60;
  return Math.ceil(minutes / 5) * 5;
}
