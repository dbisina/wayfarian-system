import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Image,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

type FacingDirection = 'back' | 'front';

interface JourneyCameraProps {
  journeyId: string;
  journeyType: 'solo' | 'group';
  onPhotoTaken: (photoData: { uri: string; latitude: number; longitude: number }) => void;
  onClose: () => void;
}

export default function JourneyCamera({
  journeyId,
  journeyType,
  onPhotoTaken,
  onClose,
}: JourneyCameraProps) {
  const { t } = useTranslation();
  const [facing, setFacing] = useState<FacingDirection>('back');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();

  useEffect(() => {
    if (!cameraPermission || (cameraPermission.status === 'undetermined' && cameraPermission.canAskAgain)) {
      requestCameraPermission();
    }
  }, [cameraPermission, requestCameraPermission]);

  useEffect(() => {
    if (!mediaPermission) {
      requestMediaPermission();
    }
  }, [mediaPermission, requestMediaPermission]);

  const ensureLocationPermission = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('components.journeyCamera.permissionRequired'), t('components.journeyCamera.locationNeeded'));
      throw new Error(t('components.journeyCamera.locationDenied'));
    }
  }, []);

  const saveToLibraryIfAllowed = useCallback(async (uri: string) => {
    if (mediaPermission?.granted) {
      try {
        await MediaLibrary.saveToLibraryAsync(uri);
      } catch (error) {
        console.warn('Unable to save photo to library', error);
      }
    }
  }, [mediaPermission?.granted]);

  const takePicture = useCallback(async () => {
    if (!cameraRef.current) {
      return;
    }
    try {
      const capture = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        exif: true,
      });

      if (!capture?.uri) {
        throw new Error(t('components.journeyCamera.failedCapture'));
      }

      setCapturedPhoto(capture.uri);
      saveToLibraryIfAllowed(capture.uri);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('components.journeyCamera.failedCapture');
      Alert.alert(t('components.journeyCamera.cameraError'), message);
    }
  }, [saveToLibraryIfAllowed]);

  const handleConfirmPhoto = useCallback(async () => {
    if (!capturedPhoto) return;
    
    try {
      await ensureLocationPermission();
      const location = await Location.getCurrentPositionAsync({});

      onPhotoTaken({
        uri: capturedPhoto,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : t('components.journeyCamera.failedProcess');
      Alert.alert(t('components.journeyCamera.error'), message);
    }
  }, [capturedPhoto, ensureLocationPermission, onPhotoTaken]);

  if (!cameraPermission) {
    return null;
  }

  if (!cameraPermission.granted) {
    return (
      <View style={styles.permissionContainer} testID={`journey-camera-permissions-${journeyId}`}>
        <Text style={styles.permissionText}>{t('components.journeyCamera.cameraPermissionRequired')}</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestCameraPermission}>
          <Text style={styles.permissionButtonText}>{t('components.journeyCamera.grantPermission')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (capturedPhoto) {
    return (
      <View style={styles.previewContainer} testID={`journey-camera-preview-${journeyId}`}>
        <Image source={{ uri: capturedPhoto }} style={styles.preview} />
        <View style={styles.previewControls}>
          <TouchableOpacity style={styles.previewButton} onPress={() => setCapturedPhoto(null)}>
            <Ionicons name="refresh" size={24} color="#fff" />
            <Text style={styles.previewButtonText}>{t('components.journeyCamera.retake')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.previewButton} onPress={handleConfirmPhoto}>
            <Ionicons name="checkmark" size={24} color="#fff" />
            <Text style={styles.previewButtonText}>{t('components.journeyCamera.usePhoto')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container} testID={`journey-camera-${journeyId}`}>
      <CameraView ref={cameraRef} style={styles.camera} facing={facing} mode="picture" />
      <View style={styles.controls}>
        <TouchableOpacity style={styles.iconButton} onPress={onClose}>
          <Ionicons name="close" size={26} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.captureButton}
          onPress={takePicture}
          accessibilityLabel={t('components.journeyCamera.captureLabel', { type: journeyType })}
        >
          <View style={styles.captureInner} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => setFacing((current) => (current === 'back' ? 'front' : 'back'))}
        >
          <Ionicons name="camera-reverse" size={26} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  controls: {
    position: 'absolute',
    bottom: 36,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  iconButton: {
    padding: 16,
  },
  captureButton: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 3,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#fff',
  },
  previewContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  preview: {
    flex: 1,
  },
  previewControls: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
  },
  previewButton: {
    alignItems: 'center',
  },
  previewButtonText: {
    color: '#fff',
    marginTop: 6,
    fontSize: 13,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    padding: 24,
  },
  permissionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  permissionButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  permissionButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
