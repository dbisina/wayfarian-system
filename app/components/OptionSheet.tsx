// app/components/OptionSheet.tsx
// A bottom sheet for picking one of a few options. Used instead of an alert, because Android alerts
// show at most three buttons and a three-way choice plus Cancel needs four.

import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AMBER, F, INK, useDW } from '../constants/design';

export interface Option { label: string; hint?: string }

interface Props {
  visible: boolean;
  title: string;
  options: Option[];
  selectedIndex: number;
  onPick: (index: number) => void;
  onClose: () => void;
}

export default function OptionSheet({ visible, title, options, selectedIndex, onPick, onClose }: Props) {
  const d = useDW();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { backgroundColor: d.surface }]} accessibilityViewIsModal>
        <View style={[styles.handle, { backgroundColor: d.line2 }]} />
        <Text style={[styles.title, { color: d.ink }]} accessibilityRole="header">{title}</Text>
        <View accessibilityRole="radiogroup">
          {options.map((o, i) => {
            const on = i === selectedIndex;
            return (
              <TouchableOpacity
                key={o.label}
                onPress={() => { onPick(i); onClose(); }}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: d.line }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: d.ink }]}>{o.label}</Text>
                  {o.hint ? <Text style={[styles.hint, { color: d.ink2 }]}>{o.hint}</Text> : null}
                </View>
                <View style={[styles.radio, { borderColor: on ? AMBER : d.line2 }]}>{on && <View style={styles.radioDot} />}</View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17,16,14,0.55)' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 34 },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: 14 },
  title: { fontFamily: F.black, fontSize: 22, letterSpacing: -0.4, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10 },
  label: { fontFamily: F.extra, fontSize: 16 },
  hint: { fontFamily: F.regular, fontSize: 12, marginTop: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: INK },
});
