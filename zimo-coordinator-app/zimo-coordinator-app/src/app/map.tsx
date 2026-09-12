import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text } from '@/components/ui/typography';
import { WebView } from 'react-native-webview';
import { Stack, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { farmsApi, mapApi } from '@/services/api';
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

  ── WHY LEAFLET IN A WEBVIEW AND NOT A NATIVE MAP ────────────────────────

  `react-native-maps` draws through Google Maps on Android, which needs an
  API key and a billing account. Without one the canvas is a plain grey
  rectangle — no error, no tiles, nothing saying why.

  OpenStreetMap needs neither, and it is already the platform's map: the
  Logistics routes screen draws the same tiles from the same setting. One
  operator repointing `logistics.map_tile_url` moves every client at once,
  which is the whole reason the URL is fetched rather than compiled in.

  ── A FARM WITH NO POINT IS SAID, NOT HIDDEN ─────────────────────────────

  Coordinates come from the farm profile, written when somebody stood on
  it. A registration nobody has visited has none — and it is listed below
  the map rather than dropped, because a farm missing from a map reads as
  a farm that does not exist, and this is exactly the caseload where the
  unvisited ones are the work.
*/

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

/** Green for done, amber for in flight, red for flagged, grey for untouched. */
function pinColour(status: string): string {
  if (status === 'verified') return '#0D7A3D';
  if (status === 'reviewing' || status === 'in_progress') return '#F4B400';
  if (status === 'flagged' || status === 'identity_review') return '#EF4444';
  return '#8896A7';
}

type Located = FarmRegistration & { coordinates: { lat: number; lng: number } };

interface Pin {
  lat: number;
  lng: number;
  colour: string;
  title: string;
  subtitle: string;
}

/**
 * The whole map, as one self-contained page.
 *
 * Built as a string and handed to the WebView rather than loaded from a
 * URL: everything but the tiles has to work with no network of its own,
 * and a page fetched from somewhere would be one more thing to be offline.
 *
 * Everything interpolated goes through JSON.stringify — a farm named with
 * an apostrophe would otherwise close the string it sits in and take the
 * rest of the script with it.
 */
function leafletPage(
  pins: Pin[],
  me: { lat: number; lng: number } | null,
  tileUrl: string,
  attribution: string
): string {
  const centre = me ?? pins[0] ?? { lat: 9.082, lng: 8.6753 };

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: #F5F7FA; }
    .leaflet-container { font-family: system-ui, sans-serif; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var pins = ${JSON.stringify(pins)};
    var me = ${JSON.stringify(me)};

    var map = L.map('map').setView([${centre.lat}, ${centre.lng}], 12);

    L.tileLayer(${JSON.stringify(tileUrl)}, {
      attribution: ${JSON.stringify(attribution)},
      maxZoom: 19
    }).addTo(map);

    var bounds = [];

    pins.forEach(function (pin) {
      L.circleMarker([pin.lat, pin.lng], {
        radius: 9,
        color: '#ffffff',
        weight: 2,
        fillColor: pin.colour,
        fillOpacity: 1
      })
        .addTo(map)
        .bindPopup('<strong>' + pin.title + '</strong><br/>' + pin.subtitle);

      bounds.push([pin.lat, pin.lng]);
    });

    if (me) {
      L.circleMarker([me.lat, me.lng], {
        radius: 7,
        color: '#ffffff',
        weight: 2,
        fillColor: '#1d4ed8',
        fillOpacity: 1
      })
        .addTo(map)
        .bindPopup('You are here');

      bounds.push([me.lat, me.lng]);
    }

    /* Fit to everything there is to see, but never zoom so far into a
       single point that the map looks like it failed to load. */
    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 15 });
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 14);
    }
  </script>
</body>
</html>`;
}

export default function FarmMapScreen() {
  const router = useRouter();
  const { currentLocation, isLocating, locateMe } = useGPS();
  const [selected, setSelected] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['farms'],
    queryFn: () => farmsApi.allPages({ limit: 100 }),
    select: (res) => res.data.data,
  });

  /*
    Which tiles to draw, from the platform. Its own fallback is the public
    OpenStreetMap server, so a failure here still produces a map.
  */
  const mapConfigQuery = useQuery({
    queryKey: ['map-config'],
    queryFn: () => mapApi.config(),
    select: (res) => res.data.data,
    staleTime: 1000 * 60 * 60,
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

  const pins: Pin[] = useMemo(
    () =>
      located.map((farm) => ({
        lat: farm.coordinates.lat,
        lng: farm.coordinates.lng,
        colour: pinColour(farm.status),
        title: farm.farmName,
        subtitle: farm.name,
      })),
    [located]
  );

  const tiles = mapConfigQuery.data;
  const hasSomethingToShow = pins.length > 0 || currentLocation !== null;
  const canDraw = hasSomethingToShow && tiles !== undefined && tiles.configured;

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

      {canDraw && tiles ? (
        <View style={{ height: 320 }}>
          <WebView
            originWhitelist={['*']}
            source={{ html: leafletPage(pins, currentLocation, tiles.tileUrl, tiles.attribution) }}
            style={{ flex: 1, backgroundColor: '#F5F7FA' }}
            javaScriptEnabled
            domStorageEnabled
            /* The agent's own position is drawn from the GPS this app
               already holds, so the page never needs the browser's. */
            geolocationEnabled={false}
          />
        </View>
      ) : (
        <Card className="m-4">
          <Text className="font-bold text-text mb-1">
            {mapConfigQuery.isLoading
              ? 'Loading the map…'
              : !hasSomethingToShow
                ? 'Nowhere to draw yet'
                : 'No map is configured'}
          </Text>
          <Text className="text-text-3 text-sm">
            {mapConfigQuery.isLoading
              ? 'Fetching which tiles to draw.'
              : !hasSomethingToShow
                ? isLocating
                  ? 'Finding you…'
                  : 'None of your farms has been located yet, and this phone has not given a position. A farm gets its point when somebody stands on it and walks the boundary.'
                : 'An administrator has turned the map off. The distances below are still correct.'}
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
            onPress={() => {
              setSelected(farm.appId);
              router.push(`/farm/${farm.appId}`);
            }}
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
