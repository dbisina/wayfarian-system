import React, {useState} from 'react';
import TermsAndConditionsModal from '../../components/TermsAndConditionsModal';
import { Field, SocialRow } from '../../components/dw/AuthParts';
import { AMBER, F, INK, useDW } from '../../constants/design';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import { router } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { useAlert } from '../../contexts/AlertContext';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import BrandMark from '../../components/dw/BrandMark';

const RegisterScreen = () => {
  const d = useDW();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { register, loginWithGoogle, loginWithApple } = useAuth();
  const { showAlert } = useAlert();
  const keyboardVerticalOffset = Platform.select({ ios: 0, android: 40 });
  const { t } = useTranslation();

  const handleSignUp = async (consent = false) => {
    if (!name || !email || !password || !confirmPassword) {
      showAlert({
        title: t('alerts.error'),
        message: t('auth.fillAllFields'),
        type: 'error',
      });
      return;
    }

    if (password !== confirmPassword) {
      showAlert({
        title: t('alerts.error'),
        message: t('auth.passwordsDoNotMatch'),
        type: 'error',
      });
      return;
    }

    if (!agreeToTerms && !consent) {
      showAlert({
        title: t('alerts.error'),
        message: t('auth.agreeToTermsError'),
        type: 'error',
      });
      return;
    }

    try {
      setLoading(true);
      await register(email, password, name);
      // Navigate to profile setup for new users
      router.replace('/profile-setup' as any);
    } catch (error: any) {
      showAlert({
        title: t('auth.registrationFailed'),
        message: error.message || t('auth.registrationFailed'),
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      await loginWithGoogle();
      // Check if this was a new signup after the auth state updates
      // The navigation will be handled by the root layout based on hasCompletedProfileSetup
    } catch (error: any) {
      if (error.message && !error.message.includes('canceled')) {
        showAlert({
          title: t('auth.googleSignInFailed'),
          message: error.message,
          type: 'error',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    try {
      setLoading(true);
      await loginWithApple();
    } catch (error: any) {
      if (error.message && !error.message.includes('canceled')) {
        showAlert({
          title: t('auth.appleSignInFailed'),
          message: error.message,
          type: 'error',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = () => {
    router.push('/(auth)/login');
  };
  const handleShowTerms = () => setShowTerms(true);
  const handleHideTerms = () => setShowTerms(false);

  const weakPassword =
    password.length > 0 && !(password.length >= 8 && /\d/.test(password))
      ? password.length < 8
        ? 'Use at least 8 characters'
        : 'Add a number to make it stronger'
      : '';

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: d.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={keyboardVerticalOffset ?? 0}
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroShade} />
          <View style={styles.heroTop}>
            <TouchableOpacity
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={styles.glass}
            >
              <Ionicons name="chevron-back" size={22} color="#FFFDF8" />
            </TouchableOpacity>
            <View style={[styles.glass, { width: undefined, paddingHorizontal: 12, height: 32, borderRadius: 16 }]}>
              <Text style={styles.step}>1 of 2</Text>
            </View>
          </View>
          <View style={styles.heroText}>
            <View style={styles.brandRow}>
              <BrandMark size={28} />
              <Text style={styles.brandName}>Wayfarian</Text>
            </View>
            <Text style={styles.heroTitle}>Create your account</Text>
          </View>
        </View>

        <View style={styles.form}>
          <SocialRow onGoogle={handleGoogleSignIn} onApple={handleAppleSignIn} disabled={loading} />
          <View style={styles.or}>
            <View style={[styles.orLine, { backgroundColor: d.line2 }]} />
            <Text style={[styles.orText, { color: d.ink2 }]}>or with email</Text>
            <View style={[styles.orLine, { backgroundColor: d.line2 }]} />
          </View>
          <Field label="Name" value={name} onChangeText={setName} placeholder="What riders call you" autoCapitalize="words" />
          <Field
            label={t('auth.email')}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <Field
            label={t('auth.password')}
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              setConfirmPassword(v);
            }}
            placeholder="At least 8 characters"
            secureTextEntry
            autoCapitalize="none"
            error={weakPassword}
          />
        </View>

        <View style={styles.foot}>
          <Text style={[styles.terms, { color: d.ink2 }]}>
            By continuing you agree to the{' '}
            <Text style={{ color: d.ink, fontFamily: F.extra }} onPress={handleShowTerms}>
              Terms
            </Text>{' '}
            and location use on rides.
          </Text>
          <TouchableOpacity
            style={[styles.primary, loading && { opacity: 0.6 }]}
            onPress={() => {
              setAgreeToTerms(true);
              handleSignUp(true);
            }}
            disabled={loading}
            accessibilityRole="button"
          >
            {loading ? <ActivityIndicator color={INK} /> : <Text style={styles.primaryText}>Continue</Text>}
          </TouchableOpacity>
          <Text style={[styles.have, { color: d.ink2 }]}>
            Have an account?{' '}
            <Text style={{ color: d.ink, fontFamily: F.extra }} onPress={handleSignIn}>
              Log in
            </Text>
          </Text>
        </View>
      </ScrollView>
      <TermsAndConditionsModal visible={showTerms} onClose={handleHideTerms} />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 12, paddingBottom: 30 },
  hero: { height: 262, borderRadius: 36, overflow: 'hidden', backgroundColor: '#2B2924', justifyContent: 'space-between' },
  heroShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(17,16,14,0.45)' },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 44, paddingHorizontal: 12 },
  glass: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(26,24,20,0.3)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', alignItems: 'center', justifyContent: 'center' },
  step: { fontFamily: F.monoBold, fontSize: 12, color: '#FFFDF8' },
  heroText: { padding: 22, paddingTop: 0, gap: 8 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandMark: { width: 26, height: 26, borderRadius: 9, backgroundColor: AMBER, alignItems: 'center', justifyContent: 'center' },
  brandName: { fontFamily: F.extra, fontSize: 13, color: '#FFFDF8' },
  heroTitle: { fontFamily: F.black, fontSize: 32, lineHeight: 34, letterSpacing: -1, color: '#FFFDF8' },
  form: { paddingHorizontal: 12, paddingTop: 20, gap: 14 },
  or: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orLine: { flex: 1, height: 1 },
  orText: { fontFamily: F.bold, fontSize: 12 },
  foot: { paddingHorizontal: 12, paddingTop: 22, gap: 12, alignItems: 'center' },
  terms: { fontFamily: F.regular, fontSize: 12, lineHeight: 16, textAlign: 'center' },
  primary: { width: '100%', height: 56, borderRadius: 28, backgroundColor: AMBER, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: F.black, fontSize: 16, color: INK },
  have: { fontFamily: F.regular, fontSize: 14 },
});
