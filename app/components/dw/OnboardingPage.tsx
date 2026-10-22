import React from 'react';
import { Image, ImageSourcePropType, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from './Icon';
import BrandMark from './BrandMark';
import { AMBER, CREAM, F, INK } from '../../constants/design';

interface Props {
  image: ImageSourcePropType;
  index: number; // 1-based
  total: number;
  title: string;
  body: string;
  onNext: () => void;
  onSkip: () => void;
}

/** Onboarding page: photo on top, cream sheet with step chip, big title, dots and a square next button. */
export default function OnboardingPage({ image, index, total, title, body, onNext, onSkip }: Props) {
  const insets = useSafeAreaInsets();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <Image source={image} style={styles.photo} resizeMode="cover" />
      <View style={styles.sheet} />

      <View style={[styles.top, { top: Math.max(56, insets.top + 8) }]}>
        <BrandMark size={44} />
        <TouchableOpacity onPress={onSkip} accessibilityRole="button" style={styles.skip}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.copy}>
        <View style={styles.chip}>
          <Text style={styles.chipText}>
            {pad(index)} / {pad(total)}
          </Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>

      <View style={[styles.bottom, { bottom: Math.max(34, insets.bottom + 14) }]}>
        <View style={styles.dots} accessibilityElementsHidden>
          {Array.from({ length: total }).map((_, i) => (
            <View key={i} style={i === index - 1 ? styles.dotOn : styles.dot} />
          ))}
        </View>
        <TouchableOpacity onPress={onNext} accessibilityRole="button" accessibilityLabel="Next" style={styles.next}>
          <Icon name="chevron" size={24} color={AMBER} stroke={2.4} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: INK },
  photo: { position: 'absolute', top: 0, left: 0, right: 0, height: 600, width: '100%' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 330, backgroundColor: CREAM, borderTopLeftRadius: 34, borderTopRightRadius: 34 },
  top: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logo: { width: 44, height: 44, borderRadius: 15, backgroundColor: AMBER, alignItems: 'center', justifyContent: 'center' },
  skip: { height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: 'rgba(26,24,20,0.3)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', justifyContent: 'center' },
  skipText: { fontFamily: F.extra, fontSize: 14, color: '#FFFDF8' },
  copy: { position: 'absolute', left: 24, right: 24, bottom: 150, gap: 12 },
  chip: { alignSelf: 'flex-start', backgroundColor: AMBER, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  chipText: { fontFamily: F.monoBold, fontSize: 12, color: INK },
  title: { fontFamily: F.black, fontSize: 38, lineHeight: 40, letterSpacing: -1.1, color: INK },
  body: { fontFamily: F.semi, fontSize: 16, lineHeight: 22, color: '#625C51', maxWidth: 300 },
  bottom: { position: 'absolute', left: 24, right: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(26,24,20,0.3)' },
  dotOn: { width: 22, height: 6, borderRadius: 3, backgroundColor: INK },
  next: { width: 64, height: 64, borderRadius: 22, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' },
});
