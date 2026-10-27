// app/app/emergency-contacts.tsx — who the SOS sheet can text your location to. Kept on this phone only.

import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import TextInput from '../components/dw/DWTextInput';
import ScreenHeader from '../components/ScreenHeader';
import Icon from '../components/dw/Icon';
import { AMBER, F, INK, useDW } from '../constants/design';
import { MAX_EMERGENCY_CONTACTS, isValidPhone, normalizePhone, type EmergencyContact } from '../v2/emergency';
import { loadEmergencyContacts, saveEmergencyContacts } from '../v2/emergencyContacts';

export default function EmergencyContactsScreen() {
  const d = useDW();
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => { loadEmergencyContacts().then(setContacts); }, []);

  const persist = async (next: EmergencyContact[]) => {
    setContacts(next);
    try {
      await saveEmergencyContacts(next);
    } catch {
      Alert.alert('Could not save', 'Your contacts were not saved. Try again.');
    }
  };

  const add = async () => {
    if (!name.trim()) { Alert.alert('Add a name', 'Who is this? For example “Mum”.'); return; }
    if (!isValidPhone(phone)) { Alert.alert('Check the number', 'Use the full number with its country code, like +234 803 000 1111.'); return; }
    await persist([...contacts, { name: name.trim().slice(0, 40), phone: normalizePhone(phone) }]);
    setName('');
    setPhone('');
  };

  const remove = (i: number) =>
    Alert.alert(`Remove ${contacts[i].name}?`, undefined, [
      { text: 'Remove', style: 'destructive', onPress: () => persist(contacts.filter((_, j) => j !== i)) },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const full = contacts.length >= MAX_EMERGENCY_CONTACTS;

  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: d.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Emergency contacts" />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={[styles.lead, { color: d.ink2 }]}>
          When you tap SOS during a ride you can text your position to these people. They are saved on this phone only and never uploaded.
        </Text>

        {contacts.length > 0 && (
          <View style={[styles.list, { backgroundColor: d.surface }]}>
            {contacts.map((c, i) => (
              <View key={c.phone} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: d.line }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: d.ink }]} numberOfLines={1}>{c.name}</Text>
                  <Text style={[styles.phone, { color: d.ink2 }]}>{c.phone}</Text>
                </View>
                <TouchableOpacity onPress={() => remove(i)} accessibilityRole="button" accessibilityLabel={`Remove ${c.name}`} style={styles.remove}>
                  <Icon name="close" size={18} color={d.ink2} stroke={2} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {full ? (
          <Text style={[styles.lead, { color: d.ink2 }]}>You can save up to {MAX_EMERGENCY_CONTACTS} contacts. Remove one to add another.</Text>
        ) : (
          <View style={styles.form}>
            <Text style={[styles.formTitle, { color: d.ink }]}>Add a contact</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Name"
              placeholderTextColor={d.ink2}
              accessibilityLabel="Contact name"
              style={[styles.line, { backgroundColor: d.surface, color: d.ink }]}
            />
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="+234 803 000 1111"
              placeholderTextColor={d.ink2}
              keyboardType="phone-pad"
              accessibilityLabel="Contact phone number"
              style={[styles.line, { backgroundColor: d.surface, color: d.ink }]}
            />
            <TouchableOpacity onPress={add} accessibilityRole="button" style={[styles.add, { backgroundColor: AMBER }]}>
              <Text style={[styles.addText, { color: INK }]}>Save contact</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 16, gap: 16, paddingBottom: 60 },
  lead: { fontFamily: F.bold, fontSize: 14, lineHeight: 19 },
  list: { borderRadius: 24, paddingHorizontal: 16, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 64, gap: 12 },
  name: { fontFamily: F.extra, fontSize: 16 },
  phone: { fontFamily: F.mono, fontSize: 13, marginTop: 2 },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  form: { gap: 10 },
  formTitle: { fontFamily: F.black, fontSize: 18 },
  line: { height: 52, borderRadius: 16, paddingHorizontal: 14, fontFamily: F.regular, fontSize: 15 },
  add: { height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  addText: { fontFamily: F.black, fontSize: 15 },
});
