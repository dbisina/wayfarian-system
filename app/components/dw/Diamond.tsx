import React from 'react';
import { Text, View } from 'react-native';
import { AMBER, DWTheme, F, INK } from '../../constants/design';
import Icon, { IconName } from './Icon';

/** Rotated badge diamond with a counter-rotated icon; dashed outline when locked. */
export default function Diamond({
  t, icon, name, tier, on,
}: { t: DWTheme; icon: IconName; name: string; tier: string; on: boolean }) {
  return (
    <View style={{ width: 96, alignItems: 'center', gap: 10 }}>
      <View style={{ width: 80, height: 80, alignItems: 'center', justifyContent: 'center' }}>
        <View
          style={{
            width: 54, height: 54, borderRadius: 14, transform: [{ rotate: '45deg' }],
            backgroundColor: on ? AMBER : 'transparent',
            borderWidth: on ? 0 : 1.5, borderStyle: 'dashed', borderColor: t.ink2,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <View style={{ transform: [{ rotate: '-45deg' }] }}>
            <Icon name={icon} size={24} color={on ? INK : t.ink2} stroke={1.9} />
          </View>
        </View>
      </View>
      <View style={{ alignItems: 'center', gap: 1 }}>
        <Text style={{ fontFamily: F.extra, fontSize: 13, color: on ? t.ink : t.ink2 }}>{name}</Text>
        <Text style={{ fontFamily: F.regular, fontSize: 12, color: t.ink2 }}>{tier}</Text>
      </View>
    </View>
  );
}
