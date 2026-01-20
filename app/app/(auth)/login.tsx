import React, {useState, useRef, useCallback, useEffect} from 'react';
import TermsAndConditionsModal from '../../components/TermsAndConditionsModal';
import AnimatedLogoButton from '../../components/AnimatedLogoButton';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  TextInput,
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
import { Ionicons } from '@expo/vector-icons';

const {width: screenWidth, height: screenHeight} = Dimensions.get('window');

export default function LoginScreen() {
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

  const GoogleIcon = () => (
    <Svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <Path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <Path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <Path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <Path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </Svg>
  );

  const AppleIcon = () => (
    <Svg width="14" height="16" viewBox="0 0 24 24" fill="none">
      <Path
        d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"
        fill="#000000"
      />
    </Svg>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={keyboardVerticalOffset ?? 0}
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ImageBackground
        source={{uri: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-09-15/Hp5N7fnQN4.png'}}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <View style={styles.overlay}>
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.formContainer}>
            <AnimatedLogoButton containerStyle={styles.logoButton} />
            <Text style={styles.title}>{t('auth.login.title')}</Text>
            {/* Google Sign In Button */}
            <TouchableOpacity 
              style={[styles.socialButton, isBusy && styles.disabledButton]} 
              onPress={handleGoogleSignIn}
              disabled={isBusy}
            >
              <GoogleIcon />
              <Text style={styles.socialButtonText}>{t('auth.signInGoogle')}</Text>
            </TouchableOpacity>
            {/* Apple Sign In Button */}
            <TouchableOpacity 
              style={[styles.socialButton, isBusy && styles.disabledButton]} 
              onPress={handleAppleSignIn}
              disabled={isBusy}
            >
              <AppleIcon />
              <Text style={styles.socialButtonText}>{t('auth.signInApple')}</Text>
            </TouchableOpacity>
            {/* Divider */}
            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>{t('auth.login.orContinue')}</Text>
              <View style={styles.dividerLine} />
            </View>
            {/* Email Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('auth.email')}</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.textInput}
                  placeholder={t('auth.login.emailPlaceholder')}
                  placeholderTextColor="rgba(0, 0, 0, 0.5)"
                  value={email}
                  onChangeText={handleEmailChange}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  returnKeyType="next"
                  textContentType="emailAddress"
                  autoComplete="email"
                  enablesReturnKeyAutomatically
                />
              </View>
            </View>
            {/* Password Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('auth.password')}</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.textInput}
                  placeholder={t('auth.login.passwordPlaceholder')}
                  placeholderTextColor="rgba(0, 0, 0, 0.5)"
                  value={password}
                  onChangeText={handlePasswordChange}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  returnKeyType="done"
                  textContentType="password"
                  autoComplete="current-password"
                  enablesReturnKeyAutomatically
                />
                <TouchableOpacity
                  style={styles.passwordToggle}
                  onPress={() => setShowPassword(prev => !prev)}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off' : 'eye'}
                    size={18}
                    color="rgba(0, 0, 0, 0.6)"
                  />
                </TouchableOpacity>
              </View>
            </View>
            {/* Forgot Password */}
            <TouchableOpacity 
              style={styles.forgotPasswordContainer}
              onPress={handleForgotPassword}
              disabled={resettingPassword}
            >
              <Text style={styles.forgotPasswordText}>
                {resettingPassword ? t('auth.login.sendingReset') : t('auth.login.forgotPassword')}
              </Text>
            </TouchableOpacity>
            {/* Sign In Button */}
            <TouchableOpacity 
              style={[styles.signInButton, isBusy && styles.disabledButton]} 
              onPress={handleSignIn}
              disabled={isBusy}
            >
              {loading ? (
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                  <ActivityIndicator color="#FFFFFF" size="small" />
                  <Text style={[styles.signInButtonText, {marginLeft: 8}]}>{t('auth.login.signingIn')}</Text>
                </View>
              ) : (
                <Text style={styles.signInButtonText}>{t('auth.login.signIn')}</Text>
              )}
            </TouchableOpacity>
            {/* Sign Up Link and Terms */}
            <View style={styles.signUpContainer}>
              <Text style={styles.signUpText}>{t('auth.login.noAccount')}</Text>
              <TouchableOpacity onPress={handleSignUp}>
                <Text style={styles.signUpLink}>{t('auth.login.signUp')}</Text>
              </TouchableOpacity>
            </View>
            <View style={{alignItems: 'center', marginTop: 8}}>
              <Text style={{fontSize: 10, color: 'rgba(255,255,255,0.7)', textAlign: 'center'}}>
                {t('auth.login.termsAccept')}
                <Text style={{color: '#2196F3', textDecorationLine: 'underline'}} onPress={handleShowTerms}>
                  {t('auth.login.termsLink')}
                </Text>.
              </Text>
            </View>
            </View>
          </ScrollView>
        </View>
        <TermsAndConditionsModal visible={showTerms} onClose={handleHideTerms} />
      </ImageBackground>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundImage: {
    flex: 1,
    width: screenWidth + 4,
    height: screenHeight,
    marginLeft: -4,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 29,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 64,
  },
  formContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 30,
    paddingHorizontal: 12,
    paddingVertical: 14,
    minHeight: 521,
  },
  logoButton: {
    alignSelf: 'center',
    marginBottom: 43,
  },
  title: {
    fontSize: 17,
    fontWeight: '500',
    color: '#FFFFFF',
    marginBottom: 47,
    fontFamily: 'Poppins',
    lineHeight: 25.5,
    textAlign: 'center',
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEEEEE',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 11,
    justifyContent: 'center',
    height: 42.77,
  },
  socialButtonText: {
    fontSize: 12,
    fontWeight: '300',
    color: '#000000',
    marginLeft: 8,
    fontFamily: 'Poppins',
    lineHeight: 18,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 13,
    height: 11,
  },
  dividerLine: {
    flex: 1,
    height: 0.2,
    backgroundColor: '#FFFFFF',
  },
  dividerText: {
    fontSize: 8,
    fontWeight: '300',
    color: '#FFFFFF',
    marginHorizontal: 10,
    fontFamily: 'Poppins',
    lineHeight: 12,
  },
  inputGroup: {
    marginBottom: 15,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FFFFFF',
    marginBottom: 8,
    fontFamily: 'Poppins',
    lineHeight: 18,
  },
  inputWrapper: {
    backgroundColor: '#EEEEEE',
    borderRadius: 20,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  textInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 12,
    fontWeight: '300',
    color: '#000000',
    fontFamily: 'Poppins',
  },
  passwordToggle: {
    paddingLeft: 8,
  },
  forgotPasswordContainer: {
    alignSelf: 'flex-end',
    marginBottom: 15,
  },
  forgotPasswordText: {
    fontSize: 12,
    fontWeight: '400',
    color: '#FFFFFF',
    fontFamily: 'Poppins',
    lineHeight: 18,
  },
  signInButton: {
    backgroundColor: '#F9A825',
    borderRadius: 20,
    paddingVertical: 11,
    alignItems: 'center',
    marginBottom: 17,
    height: 42.77,
    justifyContent: 'center',
  },
  signInButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
    fontFamily: 'Poppins',
    lineHeight: 24,
  },
  signUpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signUpText: {
    fontSize: 10,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.4)',
    fontFamily: 'Poppins',
    lineHeight: 15,
  },
  signUpLink: {
    fontSize: 10,
    fontWeight: '400',
    color: '#FFFFFF',
    fontFamily: 'Poppins',
    lineHeight: 15,
  },
  disabledButton: {
    opacity: 0.6,
  },
});