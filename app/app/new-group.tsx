import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Image, Platform } from 'react-native';
import TextInput from '../components/dw/DWTextInput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { groupAPI } from '../services/api';
import Icon from '../components/dw/Icon';
import { useKeyboardHeight } from '../components/dw/KeyboardInset';
import { AMBER, F, INK, shadow, useDW } from '../constants/design';

const RIDE_STYLES = ['Long distance', 'Weekend runs', 'Night rides', 'Off-road', 'Commutes'];

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || 'G';

export default function NewGroupScreen() {
  const d = useDW();
  const insets = useSafeAreaInsets();
  const [groupName, setGroupName] = useState('');
  const [styles_, setStyles] = useState<string[]>([]);
  const [isPrivate, setIsPrivate] = useState(true);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleStyle = (s: string) =>
    setStyles((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert('Error', 'Please enter a group name');
      return;
    }
    setBusy(true);
    try {
      const result = await groupAPI.createGroup({
        name: groupName.trim(),
        description: styles_.length ? styles_.join(' · ') : undefined,
        isPrivate,
      });

      const groupId = result?.group?.id || result?.id;
      if (!groupId) throw new Error('No group id returned');

      if (coverUri) {
        try {
          await groupAPI.uploadGroupCover(groupId, coverUri);
        } catch (e: any) {
          console.error('[Group Cover] Upload failed:', e?.message || e);
          Alert.alert(
            'Cover Upload Failed',
            'The group was created successfully, but the cover photo failed to upload. You can try uploading it again from the group settings.',
            [{ text: 'OK' }]
          );
        }
      }

      router.replace(`/group-detail?groupId=${groupId}`);
    } catch (e: any) {
      console.error('Create group failed:', e);
      Alert.alert('Error', e?.message || 'Failed to create group');
    } finally {
      setBusy(false);
    }
  };

  const handleUploadPhoto = async () => {
    try {
      // Small delay to ensure ActivityResultLauncher is registered (Android fix)
      await new Promise((resolve) => setTimeout(resolve, 100));
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
        base64: false,
      });
      if (!result.canceled && result.assets?.length) setCoverUri(result.assets[0].uri);
    } catch (e: any) {
      console.error('[New Group] Photo selection failed:', e);
      if (e?.message?.includes('ActivityResultLauncher') || e?.message?.includes('unregistered')) {
        Alert.alert('Error', 'Please try again. If the issue persists, restart the app.');
      } else {
        Alert.alert('Error', e?.message || 'Failed to select photo. Please try again.');
      }
    }
  };

  const kbHeight = useKeyboardHeight();
  const name = groupName.trim();

  return (
    <View style={[styles.root, { backgroundColor: d.bg, paddingBottom: Platform.OS === 'ios' ? kbHeight : 0 }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: Math.max(56, insets.top + 8), paddingHorizontal: 16, paddingBottom: 120, gap: 18 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={[styles.round, shadow(d, 8), { backgroundColor: d.surface }]}
          >
            <Icon name="close" size={18} color={d.ink} stroke={2.4} />
          </TouchableOpacity>
          <Text style={[styles.h1, { color: d.ink }]}>New group</Text>
        </View>

        <View style={[styles.preview, { backgroundColor: INK }]}>
          {coverUri ? null : <View style={styles.previewGlow} />}
          {coverUri ? <Image source={{ uri: coverUri }} style={StyleSheet.absoluteFill} /> : null}
          <View style={styles.previewShade} />
          <View style={styles.previewChip}>
            <Text style={styles.previewChipText}>Preview</Text>
          </View>
          <View style={styles.previewRow}>
            <View style={styles.previewMark}>
              <Text style={styles.previewMarkText}>{initials(name || 'Group')}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.previewName} numberOfLines={1}>{name || 'Your group'}</Text>
              <Text style={styles.previewSub}>Just you so far · invite by code</Text>
            </View>
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={[styles.label, { color: d.ink }]}>Cover</Text>
          <View style={styles.coverRow}>
            <TouchableOpacity
              onPress={handleUploadPhoto}
              accessibilityRole="button"
              accessibilityLabel="Upload a cover"
              style={[styles.coverBtn, { borderColor: d.line2 }]}
            >
              {coverUri ? (
                <Image source={{ uri: coverUri }} style={styles.coverThumb} />
              ) : (
                <Icon name="plus" size={18} color={d.ink2} stroke={2.4} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <View style={styles.labelRow}>
            <Text style={[styles.label, { color: d.ink }]}>Group name</Text>
            <Text style={[styles.counter, { color: d.ink2 }]}>{groupName.length}/32</Text>
          </View>
          <TextInput
            value={groupName}
            onChangeText={setGroupName}
            maxLength={32}
            placeholder="Name your crew"
            placeholderTextColor={d.ink2}
            accessibilityLabel="Group name"
            style={[styles.input, { backgroundColor: d.surface, color: d.ink }]}
          />
        </View>

        <View style={{ gap: 8 }}>
          <Text style={[styles.label, { color: d.ink }]}>How you ride</Text>
          <View style={styles.chips}>
            {RIDE_STYLES.map((s) => {
              const on = styles_.includes(s);
              return (
                <TouchableOpacity
                  key={s}
                  onPress={() => toggleStyle(s)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[styles.chip, on ? { backgroundColor: d.ink } : { borderWidth: 1.5, borderColor: d.line2 }]}
                >
                  <Text style={[styles.chipText, { color: on ? d.bg : d.ink }]}>{s}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={[styles.seg, { backgroundColor: d.surface2 }]} accessibilityRole="radiogroup">
          {[
            { label: 'Invite by code', value: true },
            { label: 'Open to nearby', value: false },
          ].map((o) => {
            const on = isPrivate === o.value;
            return (
              <TouchableOpacity
                key={o.label}
                onPress={() => setIsPrivate(o.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                style={[styles.segItem, on && { backgroundColor: d.surface }]}
              >
                <Text style={{ fontFamily: on ? F.black : F.extra, fontSize: 13, color: on ? d.ink : d.ink2 }}>{o.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <TouchableOpacity
        onPress={handleCreateGroup}
        disabled={busy}
        accessibilityRole="button"
        style={[styles.create, { bottom: Math.max(30, insets.bottom + 10), opacity: busy ? 0.6 : 1 }]}
      >
        <Text style={styles.createText}>{busy ? 'Creating…' : 'Create group'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  h1: { fontFamily: F.black, fontSize: 26, letterSpacing: -0.5 },
  preview: { height: 200, borderRadius: 28, overflow: 'hidden', justifyContent: 'flex-end' },
  previewGlow: { position: 'absolute', right: -70, top: -70, width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(245,165,36,0.18)' },
  previewShade: { ...StyleSheet.absoluteFillObject, top: 80, backgroundColor: 'rgba(17,16,14,0.55)' },
  previewChip: { position: 'absolute', left: 14, top: 14, height: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: 'rgba(26,24,20,0.45)', justifyContent: 'center' },
  previewChipText: { fontFamily: F.extra, fontSize: 11, letterSpacing: 1.1, textTransform: 'uppercase', color: '#FFFDF8' },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  previewMark: { width: 52, height: 52, borderRadius: 17, backgroundColor: AMBER, alignItems: 'center', justifyContent: 'center' },
  previewMarkText: { fontFamily: F.black, fontSize: 18, color: INK },
  previewName: { fontFamily: F.black, fontSize: 22, letterSpacing: -0.4, color: '#FFFDF8' },
  previewSub: { fontFamily: F.regular, fontSize: 12, color: 'rgba(255,253,248,0.8)' },
  label: { fontFamily: F.extra, fontSize: 13 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  counter: { fontFamily: F.monoSemi, fontSize: 13 },
  coverRow: { flexDirection: 'row', gap: 8 },
  coverBtn: { width: 58, height: 58, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  coverThumb: { width: 58, height: 58 },
  input: { height: 52, borderRadius: 16, borderWidth: 2, borderColor: AMBER, paddingHorizontal: 16, fontFamily: F.extra, fontSize: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: F.extra, fontSize: 13 },
  seg: { flexDirection: 'row', padding: 4, borderRadius: 16 },
  segItem: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  create: { position: 'absolute', left: 16, right: 16, height: 56, borderRadius: 28, backgroundColor: AMBER, alignItems: 'center', justifyContent: 'center' },
  createText: { fontFamily: F.black, fontSize: 16, color: INK },
});
