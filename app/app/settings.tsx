import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  ActionSheetIOS,
  StatusBar,
  Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon, { IconName } from '../components/dw/Icon';
import { AMBER, F, INK, shadow, setThemePref, useDW, useThemePref, ThemePref } from '../constants/design';
import { useAppSelector } from '../store/hooks';
import { selectDefaultVehicle } from '../store/slices/vehicleSlice';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { isRichNotificationEnabled, setRichNotificationEnabled } from '../v2/rideNotification';
import { useSettings, MapType, Vehicle, Units } from '../contexts/SettingsContext';
import LanguageSelector from '../components/LanguageSelector';
import { LANGUAGES } from '../i18n';

export default function SettingsScreen() {
  const d = useDW();
  const themePref = useThemePref();
  const insets = useSafeAreaInsets();
  const defaultVehicle = useAppSelector(selectDefaultVehicle);
  const { i18n, t } = useTranslation();
  const { logout, deleteAccount } = useAuth();
  const {
    notificationsEnabled,
    units,
    mapType,
    vehicle,
    setNotificationsEnabled,
    setUnits,
    setMapType,
    setVehicle,
  } = useSettings();
  const [showUnitsModal, setShowUnitsModal] = React.useState(false);
  const [richNote, setRichNote] = React.useState(false);
  React.useEffect(() => { isRichNotificationEnabled().then(setRichNote); }, []);
  const [showLanguageModal, setShowLanguageModal] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  
  // Get current language display name
  const currentLanguage = LANGUAGES.find(lang => lang.code === i18n.language) || LANGUAGES[0];

  // Handle account deletion with proper API call
  const handleDeleteAccount = async () => {
    try {
      setIsDeleting(true);
      await deleteAccount();
      // After successful deletion, navigate to login
      router.replace('/(auth)/login');
    } catch (error: any) {
      Alert.alert(
        t('alerts.error'),
        error.message || t('settings.deleteAccount.deleting')
      );
    } finally {
      setIsDeleting(false);
    }
  };

  // Cross-platform option pickers
  const pickOption = (
    title: string,
    options: string[],
    selectedIndex: number,
    onPick: (index: number) => void
  ) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
          options: [...options, t('common.cancel')],
          cancelButtonIndex: options.length,
          userInterfaceStyle: d.dark ? 'dark' : 'light',
        },
        (buttonIndex) => {
          if (buttonIndex < options.length) onPick(buttonIndex);
        }
      );
    } else {
      Alert.alert(title, undefined, [
        ...options.map((label, idx) => ({ text: `${idx === selectedIndex ? '• ' : ''}${label}`, onPress: () => onPick(idx) })),
        { text: t('common.cancel'), style: 'cancel' },
      ]);
    }
  };

  const themeOptions: { label: string; value: ThemePref; preview: string; bar: string }[] = [
    { label: 'Match phone', value: 'system', preview: '', bar: '#1C1A16' },
    { label: 'Light', value: 'light', preview: '#F4F1E9', bar: '#1C1A16' },
    { label: 'Dark', value: 'dark', preview: '#11100E', bar: '#3A362F' },
  ];
  const mapTypes = ['standard', 'satellite', 'terrain'];
  const rows: { label: string; meta: string; icon: IconName; onPress: () => void; tile?: boolean }[] = [
    { label: 'Account', meta: '', icon: 'user', onPress: () => router.push('/edit-profile') },
    {
      label: t('settings.notifications'),
      meta: notificationsEnabled ? 'On' : 'Off',
      icon: 'bell',
      onPress: () => setNotificationsEnabled(!notificationsEnabled),
    },
    {
      label: t('settings.mapType'),
      meta: t(`settings.${mapType}`),
      icon: 'map',
      tile: true,
      onPress: () =>
        pickOption(
          t('settings.mapType'),
          [t('settings.standard'), t('settings.satellite'), t('settings.terrain')],
          mapTypes.indexOf(mapType),
          (i) => setMapType(mapTypes[i] as MapType)
        ),
    },
    { label: t('settings.language'), meta: currentLanguage.nativeName, icon: 'globe', onPress: () => setShowLanguageModal(true) },
    { label: t('settings.units'), meta: units === 'km' ? 'km' : 'mi', icon: 'route', onPress: () => setShowUnitsModal(true) },
    // Android only: the rich ride notification (beta). Off by default; takes effect on the next ride.
    ...(Platform.OS === 'android'
      ? [{
          label: 'Rich ride notification (beta)',
          meta: richNote ? 'On' : 'Off',
          icon: 'bell' as IconName,
          onPress: () =>
            Alert.alert(
              'Rich ride notification',
              'Shows your distance, speed and a timer with Photo, Pause and Finish buttons while you ride. It is in beta, so if tracking ever misbehaves, switch it off. It applies from your next ride.',
              [
                { text: richNote ? 'Turn off' : 'Turn on', onPress: async () => { await setRichNotificationEnabled(!richNote); setRichNote(!richNote); } },
                { text: 'Cancel', style: 'cancel' as const },
              ]
            ),
        }]
      : []),
    { label: t('settings.managePrivacySettings'), meta: '', icon: 'lock', onPress: () => Alert.alert(t('alerts.privacy'), t('alerts.comingSoon')) },
    { label: t('settings.helpCenter'), meta: '', icon: 'help', onPress: () => Alert.alert(t('settings.helpCenter'), t('alerts.comingSoon')) },
  ];

  return (
    <View style={[styles.container, { backgroundColor: d.bg }]}>
      <StatusBar barStyle={d.dark ? 'light-content' : 'dark-content'} />
      <View style={[styles.dwHeader, { paddingTop: Math.max(56, insets.top + 8) }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={[styles.dwRound, shadow(d, 8), { backgroundColor: d.surface }]}
        >
          <Icon name="back" size={20} color={d.ink} stroke={2} />
        </TouchableOpacity>
        <Text style={[styles.dwTitle, { color: d.ink }]}>{t('settings.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <TouchableOpacity
          onPress={() => router.push('/manage-vehicles')}
          accessibilityRole="button"
          style={styles.dwSetup}
        >
          <Text style={styles.dwSetupEyebrow}>Riding setup</Text>
          <Text style={styles.dwSetupName} numberOfLines={1}>
            {defaultVehicle ? defaultVehicle.name || `${defaultVehicle.make} ${defaultVehicle.model}` : 'Add a vehicle'}
          </Text>
          <Text style={styles.dwSetupSub}>Starts every new ride</Text>
          <View style={styles.dwChips}>
            <View style={styles.dwSetupChip}><Text style={[styles.dwSetupChipText, { fontFamily: F.monoBold }]}>{units}</Text></View>
            <View style={styles.dwSetupChip}><Text style={styles.dwSetupChipText}>{notificationsEnabled ? 'Alerts on' : 'Alerts off'}</Text></View>
          </View>
        </TouchableOpacity>

        <View style={styles.dwThemes} accessibilityRole="radiogroup">
          {themeOptions.map((m) => {
            const on = themePref === m.value;
            return (
              <TouchableOpacity
                key={m.value}
                onPress={() => setThemePref(m.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                style={[
                  styles.dwTheme,
                  { backgroundColor: d.surface },
                  on ? { borderWidth: 2.5, borderColor: AMBER } : { borderWidth: 1, borderColor: d.line2 },
                ]}
              >
                <View style={[styles.dwPreview, { backgroundColor: m.preview || '#F4F1E9' }]}>
                  {m.value === 'system' && <View style={[StyleSheet.absoluteFill, { left: '50%', backgroundColor: '#11100E' }]} />}
                  <View style={styles.dwPreviewCut} />
                  <View style={[styles.dwPreviewBar, { backgroundColor: m.bar }]} />
                </View>
                <Text style={[styles.dwThemeLabel, { color: d.ink }]}>{m.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={[styles.dwList, { backgroundColor: d.surface }]}>
          {rows.map((r, i) => (
            <TouchableOpacity
              key={r.label}
              onPress={r.onPress}
              accessibilityRole="button"
              style={[styles.dwRow, i > 0 && { borderTopWidth: 1, borderTopColor: d.line }]}
            >
              <View style={[styles.dwTile, { backgroundColor: r.tile ? INK : d.surface2 }]}>
                <Icon name={r.icon} size={17} color={r.tile ? AMBER : d.ink} stroke={2} />
              </View>
              <Text style={[styles.dwRowLabel, { color: d.ink }]} numberOfLines={1}>{r.label}</Text>
              <Text style={[styles.dwRowMeta, { color: d.ink2 }]} numberOfLines={1}>{r.meta}</Text>
              <Icon name="chevron" size={16} color={d.ink2} stroke={2} />
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.dwFooter}>
          <TouchableOpacity
            onPress={async () => {
              try {
                await logout();
                router.replace('/(auth)/login');
              } catch (e) {
                console.error('Logout failed', e);
              }
            }}
            accessibilityRole="button"
            style={{ height: 44, justifyContent: 'center' }}
          >
            <Text style={[styles.dwLogout, { color: d.danger }]}>{t('settings.logout')}</Text>
          </TouchableOpacity>
          <Text style={[styles.dwVersion, { color: d.ink2 }]}>Wayfarian 2.0</Text>
        </View>
      </ScrollView>
      <Modal
        visible={showUnitsModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowUnitsModal(false)}
      >
        <View style={styles.unitsModalBackdrop}>
          <View style={[styles.unitsModalCard, { backgroundColor: d.surface }]}>
            <Text style={[styles.unitsModalTitle, { color: d.ink }]}>{t('settings.measurementUnits')}</Text>
            <Text style={styles.unitsModalSubtitle}>{t('settings.chooseUnitsDisplay')}</Text>
            {[
              { label: t('settings.metricUnits'), value: 'km', description: t('settings.metricDescription') },
              { label: t('settings.imperialUnits'), value: 'mi', description: t('settings.imperialDescription') },
            ].map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[styles.unitsOption, units === option.value && styles.unitsOptionActive]}
                onPress={() => {
                  setUnits(option.value as Units);
                  setShowUnitsModal(false);
                }}
                activeOpacity={0.8}
              >
                <View style={styles.unitsOptionHeader}>
                  <Text style={[styles.unitsOptionLabel, { color: d.ink }]}>{option.label}</Text>
                  <MaterialIcons
                    name={units === option.value ? 'radio-button-checked' : 'radio-button-unchecked'}
                    size={20}
                    color={units === option.value ? '#111827' : '#9CA3AF'}
                  />
                </View>
                <Text style={styles.unitsOptionDescription}>{option.description}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.unitsModalClose} onPress={() => setShowUnitsModal(false)}>
              <Text style={styles.unitsModalCloseText}>{t('common.done')}</Text>
            </TouchableOpacity>
         </View>
        </View>
      </Modal>

      {/* Language Selector Modal */}
      <LanguageSelector 
        visible={showLanguageModal}
        onClose={() => setShowLanguageModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  dwHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  dwRound: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  dwTitle: { fontFamily: F.black, fontSize: 28, letterSpacing: -0.6 },
  dwSetup: { height: 150, borderRadius: 26, backgroundColor: AMBER, padding: 20, justifyContent: 'space-between' },
  dwSetupEyebrow: { fontFamily: F.black, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: INK },
  dwSetupName: { fontFamily: F.black, fontSize: 22, letterSpacing: -0.4, color: INK, marginTop: -26 },
  dwSetupSub: { fontFamily: F.bold, fontSize: 13, color: 'rgba(26,24,20,0.72)', marginTop: -26 },
  dwChips: { flexDirection: 'row', gap: 6 },
  dwSetupChip: { backgroundColor: 'rgba(255,253,248,0.55)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  dwSetupChipText: { fontFamily: F.extra, fontSize: 12, color: INK },
  dwThemes: { flexDirection: 'row', gap: 8 },
  dwTheme: { flex: 1, height: 104, borderRadius: 20, padding: 8, gap: 8 },
  dwPreview: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  dwPreviewCut: { position: 'absolute', left: 0, top: 0, width: 0, height: 0, borderStyle: 'solid', borderTopWidth: 40, borderRightWidth: 40, borderTopColor: AMBER, borderRightColor: 'transparent' },
  dwPreviewBar: { position: 'absolute', left: '10%', right: '10%', bottom: 8, height: 8, borderRadius: 4 },
  dwThemeLabel: { fontFamily: F.extra, fontSize: 12 },
  dwList: { borderRadius: 24, paddingHorizontal: 14, paddingVertical: 4 },
  dwRow: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 56 },
  dwTile: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  dwRowLabel: { flex: 1, fontFamily: F.extra, fontSize: 15 },
  dwRowMeta: { fontFamily: F.bold, fontSize: 13, maxWidth: 120 },
  dwFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 },
  dwLogout: { fontFamily: F.extra, fontSize: 15 },
  dwVersion: { fontFamily: F.mono, fontSize: 12 },
  container: {
    flex: 1,
    backgroundColor: '#F6F6F6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 30,
    paddingBottom: 16,
    backgroundColor: '#F6F6F6',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Inter',
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Inter',
    marginBottom: 16,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  profilePictureContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  profilePicture: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 16,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000000',
    fontFamily: 'Inter',
    marginBottom: 4,
  },
  settingSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: '#6B7280',
    fontFamily: 'Inter',
  },
  editButton: {
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    fontFamily: 'Inter',
  },
  versionText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000000',
    fontFamily: 'Inter',
  },
  logoutButton: {
    backgroundColor: '#000',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Inter',
  },
  unitsModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  unitsModalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 32,
    gap: 12,
  },
  unitsModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    fontFamily: 'Inter',
  },
  unitsModalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    fontFamily: 'Inter',
    marginBottom: 8,
  },
  unitsOption: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
  },
  unitsOptionActive: {
    borderColor: '#111827',
    backgroundColor: '#F8FAFC',
  },
  unitsOptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  unitsOptionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    fontFamily: 'Inter',
  },
  unitsOptionDescription: {
    fontSize: 13,
    color: '#6B7280',
    fontFamily: 'Inter',
  },
  unitsModalClose: {
    marginTop: 12,
    alignSelf: 'center',
    paddingHorizontal: 32,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#111827',
  },
  unitsModalCloseText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Inter',
  },
  deleteAccountTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#DC2626',
    fontFamily: 'Inter',
    marginBottom: 4,
  },
  deleteAccountSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: '#F87171',
    fontFamily: 'Inter',
  },
});
