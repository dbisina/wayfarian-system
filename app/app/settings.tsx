import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Switch,
  Platform,
  Alert,
  ActionSheetIOS,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext';

const STORE_KEYS = {
  notifications: 'settings.notificationsEnabled',
  units: 'settings.units',
  mapType: 'settings.mapType',
  vehicle: 'settings.vehicle',
} as const;

type Units = 'km' | 'mi';
type MapType = 'standard' | 'satellite' | 'terrain';
type Vehicle = 'car' | 'bike' | 'scooter';

export default function SettingsScreen() {
  const { logout } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [units, setUnits] = useState<Units>('km');
  const [mapType, setMapType] = useState<MapType>('standard');
  const [vehicle, setVehicle] = useState<Vehicle>('car');

  // Load persisted settings
  useEffect(() => {
    (async () => {
      try {
        const [n, u, m, v] = await Promise.all([
          AsyncStorage.getItem(STORE_KEYS.notifications),
          AsyncStorage.getItem(STORE_KEYS.units),
          AsyncStorage.getItem(STORE_KEYS.mapType),
          AsyncStorage.getItem(STORE_KEYS.vehicle),
        ]);
        if (n !== null) setNotificationsEnabled(n === '1');
        if (u === 'km' || u === 'mi') setUnits(u);
        if (m === 'standard' || m === 'satellite' || m === 'terrain') setMapType(m as MapType);
        if (v === 'car' || v === 'bike' || v === 'scooter') setVehicle(v as Vehicle);
      } catch (e) {
        console.warn('Failed to load settings', e);
      }
    })();
  }, []);

  // Persist helpers
  const saveNotifications = async (val: boolean) => {
    try { await AsyncStorage.setItem(STORE_KEYS.notifications, val ? '1' : '0'); } catch {}
    setNotificationsEnabled(val);
  };
  const saveUnits = async (val: Units) => {
    try { await AsyncStorage.setItem(STORE_KEYS.units, val); } catch {}
    setUnits(val);
  };
  const saveMapType = async (val: MapType) => {
    try { await AsyncStorage.setItem(STORE_KEYS.mapType, val); } catch {}
    setMapType(val);
  };
  const saveVehicle = async (val: Vehicle) => {
    try { await AsyncStorage.setItem(STORE_KEYS.vehicle, val); } catch {}
    setVehicle(val);
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
            title="Username"
            subtitle="Change your display name"
            onPress={() => router.push('/profile')}
          />

          <View style={styles.settingItem}>
            <View style={styles.profilePictureContainer}>
              <Image 
                source={{ uri: 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=100&h=100&fit=crop&crop=face' }}
                style={styles.profilePicture}
              />
              <View style={styles.settingContent}>
                <Text style={styles.settingTitle}>Profile Picture</Text>
                <Text style={styles.settingSubtitle}>Update your profile image</Text>
              </View>
            </View>
            <View style={styles.editButton}>
              <Text style={styles.editButtonText}>Edit</Text>
            </View>
          </View>

          <SettingItem
            title="Vehicle Type"
            subtitle={`Current: ${vehicle}`}
            onPress={() =>
              pickOption('Select vehicle', ['car', 'bike', 'scooter'], ['car','bike','scooter'].indexOf(vehicle), (i) => saveVehicle(['car','bike','scooter'][i] as Vehicle))
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
              onValueChange={saveNotifications}
              trackColor={{ false: '#D1D5DB', true: '#000000' }}
              thumbColor={notificationsEnabled ? '#FFFFFF' : '#FFFFFF'}
              ios_backgroundColor="#D1D5DB"
            />
          </View>

          <SettingItem
            title="Units"
            subtitle={`Current: ${units === 'km' ? 'Kilometers' : 'Miles'}`}
            onPress={() => pickOption('Select units', ['Kilometers', 'Miles'], units === 'km' ? 0 : 1, (i) => saveUnits(i === 0 ? 'km' : 'mi'))}
          />

          <SettingItem
            title="Map Type"
            subtitle={`Current: ${mapType}`}
            onPress={() => pickOption('Select map type', ['standard', 'satellite', 'terrain'], ['standard','satellite','terrain'].indexOf(mapType), (i) => saveMapType(['standard','satellite','terrain'][i] as MapType))}
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

          <SettingItem
            title="OAuth Debug & API Override"
            subtitle="Set tunnel URL and test /health"
            onPress={() => router.push('/oauth-debug')}
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
    paddingVertical: 16,
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
});
