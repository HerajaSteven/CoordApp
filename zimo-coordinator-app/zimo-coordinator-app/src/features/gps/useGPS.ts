import { useState, useRef, useCallback } from 'react';
import * as Location from 'expo-location';
import { Alert } from 'react-native';

export interface LocationPoint {
  lat: number;
  lng: number;
  accuracyMeters: number;
  timestamp: Date;
}

export function useGPS() {
  const [currentLocation, setCurrentLocation] = useState<LocationPoint | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isWalking, setIsWalking] = useState(false);
  const [walkPoints, setWalkPoints] = useState<LocationPoint[]>([]);
  const watchSub = useRef<Location.LocationSubscription | null>(null);

  const requestPermission = async (): Promise<boolean> => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Location Permission Required',
        'Please enable location access in Settings to use GPS features.',
        [{ text: 'OK' }]
      );
      return false;
    }
    return true;
  };

  const locateMe = useCallback(async (): Promise<LocationPoint | null> => {
    const ok = await requestPermission();
    if (!ok) return null;

    setIsLocating(true);
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const point: LocationPoint = {
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        accuracyMeters: loc.coords.accuracy ?? 0,
        timestamp: new Date(loc.timestamp),
      };
      setCurrentLocation(point);
      return point;
    } catch {
      Alert.alert('GPS Error', 'Could not get your location. Please try again.');
      return null;
    } finally {
      setIsLocating(false);
    }
  }, []);

  const startBoundaryWalk = useCallback(async () => {
    const ok = await requestPermission();
    if (!ok) return;
    setWalkPoints([]);
    setIsWalking(true);
    watchSub.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
      (loc) => {
        const point: LocationPoint = {
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          accuracyMeters: loc.coords.accuracy ?? 0,
          timestamp: new Date(loc.timestamp),
        };
        setWalkPoints((prev) => [...prev, point]);
      }
    );
  }, []);

  const stopBoundaryWalk = useCallback(() => {
    watchSub.current?.remove();
    watchSub.current = null;
    setIsWalking(false);
  }, []);

  const resetWalk = useCallback(() => {
    stopBoundaryWalk();
    setWalkPoints([]);
  }, [stopBoundaryWalk]);

  return {
    currentLocation,
    isLocating,
    isWalking,
    walkPoints,
    locateMe,
    startBoundaryWalk,
    stopBoundaryWalk,
    resetWalk,
  };
}
