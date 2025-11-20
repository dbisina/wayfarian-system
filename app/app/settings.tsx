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
import { useAuth } from '../contexts/AuthContext';
import { useSettings, MapType, Vehicle, Units } from '../contexts/SettingsContext';

export default function SettingsScreen() {
  const { logout } = useAuth();
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
          options: [...options, 'Cancel'],
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
        { text: 'Cancel', style: 'cancel' },
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
          <Text style={styles.editButtonText}>Edit</Text>
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
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Account Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Settings</Text>
          
          <SettingItem
            title="Edit Profile"
            subtitle="Change your name, country, and more"
            onPress={() => router.push('/edit-profile')}
          />



          <SettingItem
            title="Vehicle Type"
            subtitle={`Current: ${vehicle}`}
            onPress={() =>
              pickOption('Select vehicle', ['car', 'bike', 'scooter'], ['car','bike','scooter'].indexOf(vehicle), (i) => setVehicle(['car','bike','scooter'][i] as Vehicle))
            }
          />
        </View>

        {/* App Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Preferences</Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingContent}>
              <Text style={styles.settingTitle}>Notifications</Text>
              <Text style={styles.settingSubtitle}>Enable or disable notifications</Text>
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
            title="Units"
            subtitle={`Current: ${units === 'km' ? 'Kilometers' : 'Miles'}`}
            onPress={() => setShowUnitsModal(true)}
          />

          <SettingItem
            title="Map Type"
            subtitle={`Current: ${mapType}`}
            onPress={() => pickOption('Select map type', ['standard', 'satellite', 'terrain'], ['standard','satellite','terrain'].indexOf(mapType), (i) => setMapType(['standard','satellite','terrain'][i] as MapType))}
          />
        </View>

        {/* Privacy Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy Settings</Text>
          
          <SettingItem
            title="Manage Privacy Settings"
            subtitle=""
            onPress={() => Alert.alert('Privacy', 'Coming soon')}
            showArrow={true}
          />
        </View>

        {/* Support & About */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support & About</Text>
          
          <SettingItem
            title="FAQ"
            subtitle=""
            onPress={() => Alert.alert('FAQ', 'Coming soon')}
            showArrow={true}
          />

          <SettingItem
            title="Help Center"
            subtitle=""
            onPress={() => Alert.alert('Help Center', 'Coming soon')}
            showArrow={true}
          />


          <View style={styles.settingItem}>
            <View style={styles.settingContent}>
              <Text style={styles.settingTitle}>App Version</Text>
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
            <Text style={styles.logoutText}>Log out</Text>
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
            <Text style={styles.unitsModalTitle}>Measurement units</Text>
            <Text style={styles.unitsModalSubtitle}>Choose how we display distance and speed.</Text>
            {[
              { label: 'Metric (km + km/h)', value: 'km', description: 'Best for most of the world.' },
              { label: 'Imperial (mi + mph)', value: 'mi', description: 'Popular in the US & UK.' },
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
              <Text style={styles.unitsModalCloseText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
});
