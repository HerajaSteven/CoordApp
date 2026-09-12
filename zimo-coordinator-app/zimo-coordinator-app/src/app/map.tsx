import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text } from '@/components/ui/typography';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import Constants from 'expo-constants';
import { Stack, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { farmsApi } from '@/services/api';
import { useGPS } from '@/features/gps/useGPS';
import { Card, LoadingSpinner, ErrorMessage, StatusBadge, HeaderBackButton } from '@/components/ui';
import type { FarmRegistration } from '@/types';

/*
  ── WHAT THIS IS FOR ─────────────────────────────────────────────────────

  A coordinator holds a caseload spread across a local government, and the
  question that orders their day is which farm is NEAREST — to verify, to
  inspect, or to look at something flagged. A list sorted by when a farm
  was registered cannot answer that, and opening each farm to read its
  coordinates is a call per farm before the first decision.

  ── A FARM WITH NO POINT IS SAID, NOT HIDDEN ─────────────────────────────

  Coordinates come from the farm profile, written when somebody stood on
  it. A registration nobody has visited has none — and it is listed below
  the map rather than dropped, because a farm missing from a map reads as
  a farm that does not exist, and this is exactly the caseload where the
  unvisited ones are the work.
*/

/**
 * Whether a drawn map can be shown at all.
 *
 * ── WHY THE SCREEN DOES NOT DEPEND ON IT ─────────────────────────────────
 *
 * `react-native-maps` draws through Google Maps on Android, which needs an
 * API key and a billing account. Without one the canvas renders as a plain
 * grey rectangle — no error, no tiles, nothing to say why.
 *
 * But the question this screen exists to answer is "which of my farms is
 * nearest", and that is arithmetic on coordinates the app already has. So
 * the DISTANCES are the screen, and the drawn map is the illustration: with
 * a key it appears above the list, without one the list still answers the
 * question and says plainly why there is no picture.
 */
const MAPS_KEY: string | undefined =
  (Constants.expoConfig?.android as { config?: { googleMaps?: { apiKey?: string } } } | undefined)
    ?.config?.googleMaps?.apiKey;

const CAN_DRAW_A_MAP = typeof MAPS_KEY === 'string' && MAPS_KEY.length > 0;

/** Metres between two points on the earth. */
function metresBetween(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): number {
  const EARTH_RADIUS_M = 6371000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/** "820 m" or "4.3 km" — never six decimal places of a kilometre. */
function readableDistance(metres: number): string {
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(1)} km`;
}

/** Green for done, amber for in flight, grey for not started. */
function pinColour(status: string): string {
  if (status === 'verified') return '#0D7A3D';
  if (status === 'reviewing' || status === 'in_progress') return '#F4B400';
  if (status === 'flagged' || status === 'identity_review') return '#EF4444';
  return '#8896A7';
}

type Located = FarmRegistration & { coordinates: { lat: number; lng: number } };

export default function FarmMapScreen() {
  const router = useRouter();
  const { currentLocation, isLocating, locateMe } = useGPS();
  const [selected, setSelected] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['farms'],
    queryFn: () => farmsApi.allPages({ limit: 100 }),
    select: (res) => res.data.data,
  });

  useEffect(() => {
    void locateMe();
  }, []);

  const farms = data?.items ?? [];

  const located = useMemo(
    () => farms.filter((farm): farm is Located => Boolean(farm.coordinates)),
    [farms]
  );

  const unlocated = useMemo(() => farms.filter((farm) => !farm.coordinates), [farms]);

  /* Nearest first — the order the day is actually worked in. */
  const byDistance = useMemo(() => {
    if (!currentLocation) return located;

    return [...located].sort(
      (a, b) =>
        metresBetween(currentLocation, a.coordinates) -
        metresBetween(currentLocation, b.coordinates)
    );
  }, [located, currentLocation]);

  /*
    Centred on the agent where the phone knows, otherwise on the farms
    themselves — a map opening on the middle of the ocean because no
    location was available yet is worse than one opening on the caseload.
  */
  const region = useMemo(() => {
    const anchor = currentLocation ?? located[0]?.coordinates ?? null;
    if (!anchor) return null;

    return {
      latitude: anchor.lat,
      longitude: anchor.lng,
      latitudeDelta: 0.15,
      longitudeDelta: 0.15,
    };
  }, [currentLocation, located]);

  if (isLoading) return <LoadingSpinner />;

  if (isError) {
    return (
      <View className="flex-1 bg-bg">
        <Stack.Screen options={{ title: 'Farm Map', headerShown: true }} />
        <ErrorMessage message="Could not load your farms." onRetry={refetch} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen
        options={{
          title: 'Farm Map',
          headerShown: true,
          headerLeft: () => <HeaderBackButton fallbackHref="/(tabs)" />,
        }}
      />

      {region && CAN_DRAW_A_MAP ? (
        <MapView
          provider={PROVIDER_DEFAULT}
          style={{ height: 320 }}
          initialRegion={region}
          showsUserLocation
          showsMyLocationButton
        >
          {located.map((farm) => (
            <Marker
              key={farm.appId}
              coordinate={{ latitude: farm.coordinates.lat, longitude: farm.coordinates.lng }}
              pinColor={pinColour(farm.status)}
              title={farm.farmName}
              description={farm.name}
              onPress={() => setSelected(farm.appId)}
            />
          ))}
        </MapView>
      ) : (
        <Card className="m-4">
          <Text className="font-bold text-text mb-1">
            {CAN_DRAW_A_MAP ? 'Nowhere to draw yet' : 'Distances, without the picture'}
          </Text>
          <Text className="text-text-3 text-sm">
            {!CAN_DRAW_A_MAP
              ? 'No map provider is configured for this build, so there is no drawn map — the list below is still ordered by how far each farm is from you.'
              : isLocating
                ? 'Finding you…'
                : 'None of your farms has been located yet, and this phone has not given a position. A farm gets its point when somebody stands on it and walks the boundary.'}
          </Text>
        </Card>
      )}

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View className="flex-row items-center justify-between mb-3">
          <Text className="font-bold text-text">
            {currentLocation ? 'Nearest first' : 'Your farms'}
          </Text>
          <TouchableOpacity onPress={() => locateMe()}>
            <Text className="text-green-500 text-sm font-semibold">
              {isLocating ? 'Locating…' : 'Locate me'}
            </Text>
          </TouchableOpacity>
        </View>

        {isLocating && !currentLocation && (
          <Card className="mb-3">
            <ActivityIndicator color="#0D7A3D" />
          </Card>
        )}

        {byDistance.map((farm) => (
          <TouchableOpacity
            key={farm.appId}
            activeOpacity={0.8}
            onPress={() => router.push(`/farm/${farm.appId}`)}
          >
            <Card className={`mb-3 ${selected === farm.appId ? 'border border-green-500' : ''}`}>
              <View className="flex-row items-start justify-between">
                <View className="flex-1 mr-3">
                  <Text className="font-bold text-text" numberOfLines={1}>
                    {farm.farmName}
                  </Text>
                  <Text className="text-xs text-text-3 mt-0.5">
                    {farm.name}
                    {farm.farmLocation ? ` · ${farm.farmLocation}` : ''}
                  </Text>
                  {currentLocation && (
                    <Text className="text-xs text-green-600 font-semibold mt-1">
                      {readableDistance(metresBetween(currentLocation, farm.coordinates))} away
                    </Text>
                  )}
                </View>
                <StatusBadge status={farm.status} />
              </View>
            </Card>
          </TouchableOpacity>
        ))}

        {unlocated.length > 0 && (
          <View className="mt-4">
            <Text className="font-bold text-text mb-1">Not located yet</Text>
            <Text className="text-text-3 text-xs mb-3">
              No boundary has been walked on {unlocated.length === 1 ? 'this one' : 'these'}, so
              there is no point to put on the map. They are still yours to visit.
            </Text>

            {unlocated.map((farm) => (
              <TouchableOpacity
                key={farm.appId}
                activeOpacity={0.8}
                onPress={() => router.push(`/farm/${farm.appId}`)}
              >
                <Card className="mb-3">
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1 mr-3">
                      <Text className="font-bold text-text" numberOfLines={1}>
                        {farm.farmName}
                      </Text>
                      <Text className="text-xs text-text-3 mt-0.5">
                        {farm.name}
                        {farm.lga ? ` · ${farm.lga}` : ''}
                      </Text>
                    </View>
                    <StatusBadge status={farm.status} />
                  </View>
                </Card>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {farms.length === 0 && (
          <Card>
            <Text className="text-text-3 text-center py-4">No farms assigned yet.</Text>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}
