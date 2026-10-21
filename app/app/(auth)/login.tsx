import React, {useState, useRef, useCallback, useEffect} from 'react';
import TermsAndConditionsModal from '../../components/TermsAndConditionsModal';
import { Field, SocialRow } from '../../components/dw/AuthParts';
import { AMBER, F, INK, useDW } from '../../constants/design';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  StatusBar,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import { router } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { useAlert } from '../../contexts/AlertContext';
import { useTranslation } from 'react-i18next';

export default function LoginScreen() {
  const d = useDW();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login, loginWithGoogle, loginWithApple, resetPassword, isAuthenticated } = useAuth();
  const { showAlert } = useAlert();
  const { t } = useTranslation();
  const keyboardVerticalOffset = Platform.select({ ios: 0, android: 40 });
  const isBusy = loading || resettingPassword;
  
  // Refs to preserve form values during auth state changes
  const emailRef = useRef(email);
  const passwordRef = useRef(password);
  
  // Keep refs in sync with state
  const handleEmailChange = useCallback((text: string) => {
    emailRef.current = text;
    setEmail(text);
  }, []);
  
  // Safety check: if we become authenticated, ensure we stop loading
  // This prevents the spinner from getting stuck if navigation is delayed
  useEffect(() => {
    if (isAuthenticated) {
      setLoading(false);
      // Navigate to the main tabs screen after successful login
      router.replace('/(tabs)' as any);
    }
  }, [isAuthenticated]);

  const handlePasswordChange = useCallback((text: string) => {
    passwordRef.current = text;
    setPassword(text);
  }, []);

  const handleSignIn = async () => {
    if (!email || !password) {
      showAlert({
        title: t('auth.login.alerts.error'),
        message: t('auth.login.alerts.enterBoth'),
        type: 'error',
      });
      return;
    }

    try {
      setLoading(true);
      await login(email, password);
    } catch (error: any) {
      showAlert({
        title: t('auth.login.alerts.loginFailed'),
        message: error.message || t('auth.alerts.error'),
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
    } catch (error: any) {
      if (error.message && !error.message.includes('canceled')) {
        showAlert({
          title: t('auth.login.alerts.googleFailed'), 
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
          title: t('auth.login.alerts.appleFailed'),
          message: error.message,
          type: 'error',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = () => {
    router.push('/(auth)/register');
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      showAlert({
        title: t('auth.login.alerts.resetPassword'),
        message: t('auth.login.alerts.enterEmailFirst'),
        type: 'warning',
      });
      return;
    }

    try {
      setResettingPassword(true);
      await resetPassword(email.trim());
      showAlert({
        title: t('auth.login.alerts.checkEmail'),
        message: t('auth.login.alerts.resetSent'),
        type: 'success',
      });
    } catch (error: any) {
      showAlert({
        title: t('auth.login.alerts.resetFailed'),
        message: error.message || t('auth.login.alerts.error'),
        type: 'error',
      });
    } finally {
      setResettingPassword(false);
    }
  };
  const handleShowTerms = () => setShowTerms(true);
  const handleHideTerms = () => setShowTerms(false);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: d.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={keyboardVerticalOffset ?? 0}
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <ImageBackground
          source={{ uri: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-09-15/Hp5N7fnQN4.png' }}
          style={styles.hero}
          imageStyle={{ borderRadius: 36 }}
          resizeMode="cover"
        >
          <View style={styles.heroShade} />
          <View style={styles.heroText}>
            <View style={styles.logo}>
              <Svg width={24} height={24} viewBox="0 0 24 24">
                <Path d="M12 3 20 20 12 15.5 4 20z" fill={INK} />
              </Svg>
            </View>
            <Text style={styles.brand}>Wayfarian</Text>
            <Text style={styles.tagline}>Every ride you take, kept like a diary.</Text>
          </View>
        </ImageBackground>

        <View style={styles.form}>
          <Field
            label={t('auth.email')}
            value={email}
            onChangeText={handleEmailChange}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            returnKeyType="next"
            textContentType="emailAddress"
            autoComplete="email"
          />
          <Field
            label={t('auth.password')}
            value={password}
            onChangeText={handlePasswordChange}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            returnKeyType="done"
            textContentType="password"
            autoComplete="current-password"
            onSubmitEditing={handleSignIn}
            right={
              <TouchableOpacity onPress={handleForgotPassword} disabled={resettingPassword} accessibilityRole="button">
                <Text style={[styles.forgot, { color: d.ink2 }]}>
                  {resettingPassword ? t('auth.login.sendingReset') : 'Forgot it?'}
                </Text>
              </TouchableOpacity>
            }
          />

          <TouchableOpacity
            style={[styles.primary, isBusy && { opacity: 0.6 }]}
            onPress={handleSignIn}
            disabled={isBusy}
            accessibilityRole="button"
          >
            {loading ? <ActivityIndicator color={INK} /> : <Text style={styles.primaryText}>Log in</Text>}
          </TouchableOpacity>

          <SocialRow onGoogle={handleGoogleSignIn} onApple={handleAppleSignIn} disabled={isBusy} />
        </View>

        <View style={styles.foot}>
          <Text style={[styles.footText, { color: d.ink2 }]}>
            New here?{' '}
            <Text style={{ color: d.ink, fontFamily: F.extra }} onPress={handleSignUp}>
              Create an account
            </Text>
          </Text>
          <Text style={[styles.terms, { color: d.ink2 }]}>
            {t('auth.login.termsAccept')}
            <Text style={{ color: d.ink, fontFamily: F.extra }} onPress={handleShowTerms}>
              {t('auth.login.termsLink')}
            </Text>
            .
          </Text>
        </View>
      </ScrollView>
      <TermsAndConditionsModal visible={showTerms} onClose={handleHideTerms} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 12, paddingBottom: 30 },
  hero: { height: 352, borderRadius: 36, overflow: 'hidden', backgroundColor: '#2B2924', justifyContent: 'flex-end' },
  heroShade: { ...StyleSheet.absoluteFillObject, top: 120, backgroundColor: 'rgba(17,16,14,0.55)' },
  heroText: { padding: 22, gap: 10 },
  logo: { width: 48, height: 48, borderRadius: 16, backgroundColor: AMBER, alignItems: 'center', justifyContent: 'center' },
  brand: { fontFamily: F.black, fontSize: 40, lineHeight: 42, letterSpacing: -1.4, color: '#FFFDF8' },
  tagline: { fontFamily: F.bold, fontSize: 16, lineHeight: 21, color: 'rgba(255,253,248,0.85)' },
  form: { paddingHorizontal: 12, paddingTop: 22, gap: 14 },
  forgot: { fontFamily: F.bold, fontSize: 13 },
  primary: { height: 56, marginTop: 4, borderRadius: 28, backgroundColor: AMBER, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: F.black, fontSize: 16, color: INK },
  foot: { alignItems: 'center', gap: 10, marginTop: 24 },
  footText: { fontFamily: F.regular, fontSize: 14 },
  terms: { fontFamily: F.regular, fontSize: 11, textAlign: 'center', paddingHorizontal: 24 },
});
