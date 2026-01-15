import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Platform,
  Alert,
  ActionSheetIOS,
  StatusBar,
  Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useSettings, MapType, Vehicle, Units } from '../contexts/SettingsContext';
import LanguageSelector from '../components/LanguageSelector';
import { LANGUAGES } from '../i18n';

export default function SettingsScreen() {
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
          userInterfaceStyle: 'light',
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

  const SettingItem = ({ 
    title, 
    subtitle, 
    onPress, 
    showArrow = false,
    children 
  }: {
    title: string;
    subtitle: string;
    onPress?: () => void;
    showArrow?: boolean;
    children?: React.ReactNode;
  }) => (
    <TouchableOpacity style={styles.settingItem} onPress={onPress}>
      <View style={styles.settingContent}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingSubtitle}>{subtitle}</Text>
      </View>
      {children || (showArrow ? (
        <MaterialIcons name="chevron-right" size={24} color="#757575" />
      ) : (
        <View style={styles.editButton}>
          <Text style={styles.editButtonText}>{t('common.edit')}</Text>
        </View>
      ))}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <MaterialIcons name="arrow-back" size={24} color="#000000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('settings.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Account Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.accountSettings')}</Text>
          
          <SettingItem
            title={t('settings.editProfile')}
            subtitle={t('settings.changeProfileInfo')}
            onPress={() => router.push('/edit-profile')}
          />

          <SettingItem
            title={t('settings.vehicleType')}
            subtitle={`${t('settings.currentLanguage')}: ${t(`settings.${vehicle}`)}`}
            onPress={() =>
              pickOption(t('settings.selectVehicle'), [t('settings.car'), t('settings.bike'), t('settings.scooter')], ['car','bike','scooter'].indexOf(vehicle), (i) => setVehicle(['car','bike','scooter'][i] as Vehicle))
            }
          />

          <TouchableOpacity 
            style={styles.settingItem} 
            disabled={isDeleting}
            onPress={() => {
              Alert.alert(
                t('settings.deleteAccount.confirmTitle'),
                t('settings.deleteAccount.confirmMsg'),
                [
                  { text: t('common.cancel'), style: 'cancel' },
                  { 
                    text: t('settings.deleteAccount.button'), 
                    style: 'destructive',
                    onPress: handleDeleteAccount
                  },
                ]
              );
            }}
          >
            <View style={styles.settingContent}>
              <Text style={styles.deleteAccountTitle}>
                {isDeleting ? t('settings.deleteAccount.deleting') : t('settings.deleteAccount.title')}
              </Text>
              <Text style={styles.deleteAccountSubtitle}>{t('settings.deleteAccount.subtitle')}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#DC2626" />
          </TouchableOpacity>
        </View>

        {/* App Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.appPreferences')}</Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingContent}>
              <Text style={styles.settingTitle}>{t('settings.notifications')}</Text>
              <Text style={styles.settingSubtitle}>{t('settings.enableDisableNotifications')}</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: '#D1D5DB', true: '#000000' }}
              thumbColor={notificationsEnabled ? '#FFFFFF' : '#FFFFFF'}
              ios_backgroundColor="#D1D5DB"
            />
          </View>

          <SettingItem
            title={t('settings.language')}
            subtitle={`${t('settings.currentLanguage')}: ${currentLanguage.nativeName}`}
            onPress={() => setShowLanguageModal(true)}
          />

          <SettingItem
            title={t('settings.units')}
            subtitle={`${t('settings.currentLanguage')}: ${units === 'km' ? t('settings.metricUnits') : t('settings.imperialUnits')}`}
            onPress={() => setShowUnitsModal(true)}
          />

          <SettingItem
            title={t('settings.mapType')}
            subtitle={`${t('settings.currentLanguage')}: ${t(`settings.${mapType}`)}`}
            onPress={() => pickOption(t('settings.mapType'), [t('settings.standard'), t('settings.satellite'), t('settings.terrain')], ['standard','satellite','terrain'].indexOf(mapType), (i) => setMapType(['standard','satellite','terrain'][i] as MapType))}
          />
        </View>

        {/* Privacy Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.privacySettings')}</Text>
          
          <SettingItem
            title={t('settings.managePrivacySettings')}
            subtitle=""
            onPress={() => Alert.alert(t('alerts.privacy'), t('alerts.comingSoon'))}
            showArrow={true}
          />
        </View>

        {/* Support & About */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.supportAbout')}</Text>
          
          <SettingItem
            title={t('settings.faq')}
            subtitle=""
            onPress={() => Alert.alert(t('settings.faq'), t('alerts.comingSoon'))}
            showArrow={true}
          />

          <SettingItem
            title={t('settings.helpCenter')}
            subtitle=""
            onPress={() => Alert.alert(t('settings.helpCenter'), t('alerts.comingSoon'))}
            showArrow={true}
          />


          <View style={styles.settingItem}>
            <View style={styles.settingContent}>
              <Text style={styles.settingTitle}>{t('settings.appVersion')}</Text>
            </View>
            <Text style={styles.versionText}>1.2.3</Text>
          </View>
        </View>

        {/* Logout */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={async () => {
              try {
                await logout();
                router.replace('/(auth)/login');
              } catch (e) {
                console.error('Logout failed', e);
              }
            }}
          >
            <Text style={styles.logoutText}>{t('settings.logout')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      <Modal
        visible={showUnitsModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowUnitsModal(false)}
      >
        <View style={styles.unitsModalBackdrop}>
          <View style={styles.unitsModalCard}>
            <Text style={styles.unitsModalTitle}>{t('settings.measurementUnits')}</Text>
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
                  <Text style={styles.unitsOptionLabel}>{option.label}</Text>
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
