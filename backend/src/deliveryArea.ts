import type { GeocodedLocation } from "./geocoder.js";
import type { RobotBaseLocation } from "./robotBase.js";

const EARTH_RADIUS_MILES = 3_958.8;

export function distanceInMiles(from: GeocodedLocation, to: RobotBaseLocation) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const haversine = Math.min(1, Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(longitudeDelta / 2) ** 2);
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}
