import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Switch,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';

export default function SettingsScreen() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

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
            onPress={() => {}}
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
            subtitle="Select your vehicle type"
            onPress={() => {}}
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
            subtitle="Choose between kilometers or miles"
            onPress={() => {}}
          />

          <SettingItem
            title="Map Type"
            subtitle="Select your preferred map style"
            onPress={() => {}}
          />
        </View>

        {/* Privacy Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy Settings</Text>
          
          <SettingItem
            title="Manage Privacy Settings"
            subtitle=""
            onPress={() => {}}
            showArrow={true}
          />
        </View>

        {/* Support & About */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support & About</Text>
          
          <SettingItem
            title="FAQ"
            subtitle=""
            onPress={() => {}}
            showArrow={true}
          />

          <SettingItem
            title="Help Center"
            subtitle=""
            onPress={() => {}}
            showArrow={true}
          />

          <View style={styles.settingItem}>
            <View style={styles.settingContent}>
              <Text style={styles.settingTitle}>App Version</Text>
            </View>
            <Text style={styles.versionText}>1.2.3</Text>
          </View>
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
});
