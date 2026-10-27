// app/components/SosSheet.tsx
// The SOS sheet on the live-ride screen. It does not contact anyone by itself: the rider taps to
// call the local emergency number, or to open a drafted text with their position for the contacts
// they saved. Wayfarian is not an emergency service and the sheet says so.

import React, { useEffect, useState } from 'react';
import { Alert, Linking, Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Localization from 'expo-localization';
import { router } from 'expo-router';
import { AMBER, F, INK, useDW } from '../constants/design';
import { emergencyNumber, mapsLink, smsUrl, sosMessage, type EmergencyContact } from '../v2/emergency';
import { loadEmergencyContacts } from '../v2/emergencyContacts';

const RED = '#E5484D';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Where the rider is, or null before the first GPS fix. */
  position: { latitude: number; longitude: number } | null;
}

export default function SosSheet({ visible, onClose, position }: Props) {
  const d = useDW();
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const number = emergencyNumber(Localization.getLocales()[0]?.regionCode);

  // Re-read each time it opens, so contacts added in Settings show up straight away.
  useEffect(() => {
    if (visible) loadEmergencyContacts().then(setContacts);
  }, [visible]);

  const call = async () => {
    try {
      await Linking.openURL(`tel:${number}`);
    } catch {
      Alert.alert('Could not open the dialler', `Dial ${number} yourself.`);
    }
  };

  const text = async () => {
    if (!position) return;
    const body = sosMessage(position.latitude, position.longitude);
    try {
      await Linking.openURL(smsUrl(contacts.map((c) => c.phone), body, Platform.OS));
    } catch {
      // Some phones reject a list of numbers: fall back to a draft to the first contact.
      try {
        await Linking.openURL(smsUrl([contacts[0].phone], body, Platform.OS));
      } catch {
        Alert.alert('Could not open messages', `Send this yourself:\n${body}`);
      }
    }
  };

  const addContacts = () => {
    onClose();
    router.push('/emergency-contacts' as never);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close emergency sheet" />
      <View style={[styles.sheet, { backgroundColor: d.surface }]} accessibilityViewIsModal>
        <View style={[styles.handle, { backgroundColor: d.line2 }]} />
        <Text style={[styles.title, { color: d.ink }]}>Emergency</Text>
        <Text style={[styles.where, { color: d.ink2 }]} selectable>
          {position ? `Your position: ${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}` : 'Waiting for your position…'}
        </Text>

        <TouchableOpacity onPress={call} accessibilityRole="button" accessibilityLabel={`Call ${number}`} style={[styles.big, { backgroundColor: RED }]}>
          <Text style={[styles.bigText, { color: '#FFFDF8' }]}>Call {number}</Text>
        </TouchableOpacity>

        {contacts.length > 0 ? (
          <TouchableOpacity
            onPress={text}
            disabled={!position}
            accessibilityRole="button"
            style={[styles.big, { backgroundColor: AMBER, opacity: position ? 1 : 0.5 }]}
          >
            <Text style={[styles.bigText, { color: INK }]}>
              Text my location to {contacts.length === 1 ? contacts[0].name : `${contacts.length} contacts`}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={addContacts} accessibilityRole="button" style={[styles.big, { backgroundColor: d.surface2 }]}>
            <Text style={[styles.bigText, { color: d.ink }]}>Add emergency contacts</Text>
          </TouchableOpacity>
        )}

        {position && (
          <Text style={[styles.link, { color: d.ink2 }]} numberOfLines={1} selectable>{mapsLink(position.latitude, position.longitude)}</Text>
        )}
        <Text style={[styles.note, { color: d.ink2 }]}>
          Wayfarian does not contact emergency services for you. These buttons only call and text from your phone when you tap them.
        </Text>

        <TouchableOpacity onPress={onClose} accessibilityRole="button" style={styles.cancel}>
          <Text style={[styles.cancelText, { color: d.ink }]}>Close</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17,16,14,0.55)' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 34, gap: 12 },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2 },
  title: { fontFamily: F.black, fontSize: 24, letterSpacing: -0.4 },
  where: { fontFamily: F.monoBold, fontSize: 12 },
  big: { height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  bigText: { fontFamily: F.black, fontSize: 16 },
  link: { fontFamily: F.mono, fontSize: 11 },
  note: { fontFamily: F.regular, fontSize: 12, lineHeight: 17 },
  cancel: { height: 48, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontFamily: F.extra, fontSize: 15 },
});
