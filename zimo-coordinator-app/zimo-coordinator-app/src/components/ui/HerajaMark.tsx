import React from 'react';
import { View, Image } from 'react-native';
import { Text } from './typography';

/*
  ── THE PLATFORM BEHIND THE PRODUCT ──────────────────────────────────────

  Zimo Field Coordinator is one app on Heraja. A coordinator signing in on
  a phone somebody handed them at a cooperative office has no other way of
  knowing whose system holds the evidence they are about to record, and
  "who is this" is a fair question from a person being asked to photograph
  a farmer's identity document.

  ── SIZED BY WIDTH, NEVER BY BOTH ────────────────────────────────────────

  The wordmark is 2828x819 — a 3.45:1 letterbox. Giving it a width AND a
  height is how a logo gets squashed, and a stretched wordmark is the one
  distortion a reader always notices. Height is derived from the real
  aspect ratio so it cannot be got wrong from a call site.
*/
const ASPECT = 2828 / 819;

export function HerajaMark({
  width = 92,
  tone = 'green',
  caption,
}: {
  readonly width?: number;
  readonly tone?: 'green' | 'white';
  readonly caption?: string;
}) {
  return (
    <View className="items-center">
      <Image
        source={
          tone === 'white'
            ? require('../../../assets/heraja-logo-white.png')
            : require('../../../assets/heraja-logo.png')
        }
        style={{ width, height: width / ASPECT }}
        resizeMode="contain"
        /* Named for a screen reader, which otherwise announces nothing at
           all where a sighted reader sees who runs this. */
        accessibilityRole="image"
        accessibilityLabel="Heraja"
      />
      {caption ? (
        <Text
          className={`mt-1.5 text-[10px] ${tone === 'white' ? 'text-white/70' : 'text-text-3'}`}
        >
          {caption}
        </Text>
      ) : null}
    </View>
  );
}
