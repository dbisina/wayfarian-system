import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { F, INK, PAPER, CREAM } from '../../constants/design';

/** Odometer digits: dark tiles for whole km, a light tile for the decimal. */
export default function Odometer({ whole, tenth }: { whole: string; tenth: string }) {
  return (
    <View style={styles.row}>
      {whole.split('').map((d, i) => (
        <View key={i} style={[styles.tile, { backgroundColor: INK }]}>
          <Text style={[styles.digit, { color: CREAM }]}>{d}</Text>
          <View style={styles.sheen} />
        </View>
      ))}
      <View style={{ width: 6 }} />
      <View style={[styles.tile, { backgroundColor: PAPER }]}>
        <Text style={[styles.digit, { color: INK }]}>{tenth}</Text>
      </View>
      <Text style={styles.unit}>km</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  tile: { width: 36, height: 52, borderRadius: 8, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  digit: { fontFamily: F.monoBold, fontSize: 30, lineHeight: 36 },
  sheen: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 14, backgroundColor: 'rgba(255,255,255,0.04)' },
  unit: { fontFamily: F.extra, fontSize: 16, color: INK, marginLeft: 6, paddingBottom: 4 },
});
