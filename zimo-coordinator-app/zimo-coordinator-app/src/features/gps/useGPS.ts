import { useState, useRef, useCallback, useEffect } from 'react';
import * as Location from 'expo-location';
import { Alert } from 'react-native';
import { useOfflineStore } from '@/store/offline.store';

export interface LocationPoint {
  lat: number;
  lng: number;
  accuracyMeters: number;
  timestamp: Date;

  /**
   * The edge from the PREVIOUS fix to this one could not be walked.
   *
   * A boundary is often not walkable — the edge is bush, or fenced, or
   * under water — and the coordinator has to leave the perimeter, cross
   * inside the farm, and rejoin the edge further along. Recording that
   * detour takes a bite out of the polygon and understates the farm;
   * pausing instead leaves a straight line across the gap, which is the
   * better approximation of the boundary.
   *
   * What was missing is the reason. A straight edge with nothing attached
   * to it is indistinguishable, to anyone reading the record later, from
   * a coordinator who simply cut the corner. This says it was deliberate
   * and says why.
   */
  bridged?: boolean;
  bridgeReason?: string;
}

export function useGPS(appId?: string) {
  const [currentLocation, setCurrentLocation] = useState<LocationPoint | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isWalking, setIsWalking] = useState(false);
  const [walkPoints, setWalkPoints] = useState<LocationPoint[]>(() => {
    const saved = appId ? useOfflineStore.getState().boundaryDrafts[appId]?.points ?? [] : [];
    return saved.map((point) => ({ ...point, timestamp: new Date(point.timestamp) }));
  });
  const walkPointsRef = useRef(walkPoints);

  /*
    Set when the coordinator says the next stretch of edge cannot be
    walked. It rides here until recording resumes, and is stamped on the
    first fix taken on the far side — the one whose incoming segment is
    the straight line across the gap.
  */
  const pendingBridge = useRef<string | null>(null);
  const watchSub = useRef<Location.LocationSubscription | null>(null);

  const restoreBoundaryWalk = useCallback((points: LocationPoint[]) => {
    walkPointsRef.current = points;
    setWalkPoints(points);
    if (appId) useOfflineStore.getState().saveBoundaryDraft(appId, points);
  }, [appId]);

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

  const startBoundaryWalk = useCallback(async (resumeSavedWalk = false) => {
    const ok = await requestPermission();
    if (!ok) return;
    if (!resumeSavedWalk) restoreBoundaryWalk([]);
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

        /*
          The first fix after an unwalkable stretch carries the reason,
          and only the first — the gap is one segment, not everything
          recorded afterwards.
        */
        if (pendingBridge.current !== null && walkPointsRef.current.length > 0) {
          point.bridged = true;
          point.bridgeReason = pendingBridge.current;
          pendingBridge.current = null;
        }

        restoreBoundaryWalk([...walkPointsRef.current, point]);
      }
    );
  }, [restoreBoundaryWalk]);

  const stopBoundaryWalk = useCallback(() => {
    watchSub.current?.remove();
    watchSub.current = null;
    setIsWalking(false);
  }, []);

  /*
    THE RECEIVER IS RELEASED WHEN THE SCREEN GOES AWAY.

    Nothing removed this subscription except the Stop button. So a
    coordinator who started a walk and then left the screen — back to the
    farm list, forward to another step, anywhere — left the watch running,
    and it carried on appending fixes to the saved draft. Including the
    drive home. The next person to open that walk would find the farm's
    perimeter with forty kilometres of road attached to it.

    The points are deliberately kept. They are the walk, they are already
    on the device, and the only thing ending here is the recording.
  */
  useEffect(() => {
    return () => {
      watchSub.current?.remove();
      watchSub.current = null;
    };
  }, []);

  /**
   * The edge ahead cannot be walked: stop recording and remember why.
   *
   * Recording stops rather than continuing, because the walk around the
   * obstruction goes through the farm and recording it would pull the
   * boundary inward. Nothing is captured until the coordinator rejoins
   * the edge and resumes, and the segment across the gap is then a
   * straight line with this reason attached to it.
   */
  const markEdgeUnwalkable = useCallback((reason: string) => {
    pendingBridge.current = reason;
    watchSub.current?.remove();
    watchSub.current = null;
    setIsWalking(false);
  }, []);

  const resetWalk = useCallback(() => {
    stopBoundaryWalk();
    restoreBoundaryWalk([]);
    if (appId) useOfflineStore.getState().clearBoundaryDraft(appId);
  }, [appId, restoreBoundaryWalk, stopBoundaryWalk]);

  return {
    currentLocation,
    isLocating,
    isWalking,
    walkPoints,
    locateMe,
    startBoundaryWalk,
    stopBoundaryWalk,
    markEdgeUnwalkable,
    restoreBoundaryWalk,
    resetWalk,
  };
}
