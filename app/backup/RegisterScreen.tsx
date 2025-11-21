import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  TextInput,
  ImageBackground,
  ScrollView,
  StatusBar,
} from 'react-native';
import Svg, {Path, G, Defs, ClipPath, Rect} from 'react-native-svg';

const {width: screenWidth, height: screenHeight} = Dimensions.get('window');

interface RegisterScreenProps {
  onSignIn: () => void;
  onSignUp: () => void;
}

const RegisterScreen = ({onSignIn, onSignUp}: RegisterScreenProps): JSX.Element => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreeToTerms, setAgreeToTerms] = useState(false);

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
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ImageBackground
        source={{uri: 'https://codia-f2c.s3.us-west-1.amazonaws.com/image/2025-09-15/rfzYAAc8iR.png'}}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <View style={styles.overlay}>
          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.formContainer}>
              <View style={styles.profileCircle} />
              
              <Text style={styles.title}>Sign into your account</Text>
              
              {/* Google Sign In Button */}
              <TouchableOpacity style={styles.socialButton}>
                <GoogleIcon />
                <Text style={styles.socialButtonText}>Sign in with Google</Text>
              </TouchableOpacity>
              
              {/* Apple Sign In Button */}
              <TouchableOpacity style={styles.socialButton}>
                <AppleIcon />
                <Text style={styles.socialButtonText}>Sign in with Apple</Text>
              </TouchableOpacity>
              
              {/* Divider */}
              <View style={styles.dividerContainer}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>Or continue with</Text>
                <View style={styles.dividerLine} />
              </View>
              
              {/* Name Field */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Name</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter your Name"
                  placeholderTextColor="rgba(0, 0, 0, 0.5)"
                  value={name}
                  onChangeText={setName}
                />
              </View>
              
              {/* Email Field */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter Your email address"
                  placeholderTextColor="rgba(0, 0, 0, 0.5)"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
              
              {/* Password Field */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Password</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter your password"
                  placeholderTextColor="rgba(0, 0, 0, 0.5)"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />
              </View>
              
              {/* Confirm Password Field */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Confirm Password</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Re-enter password"
                  placeholderTextColor="rgba(0, 0, 0, 0.5)"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                />
              </View>
              
              {/* Terms and Conditions */}
              <View style={styles.termsContainer}>
                <TouchableOpacity
                  style={[styles.checkbox, agreeToTerms && styles.checkboxChecked]}
                  onPress={() => setAgreeToTerms(!agreeToTerms)}
                />
                <Text style={styles.termsText}>
                  By Clicking, I agree with WayfarianS terms of service and Privacy Policy.
                </Text>
              </View>
              
              {/* Sign In Button */}
              <TouchableOpacity style={styles.signInButton} onPress={onSignUp}>
                <Text style={styles.signInButtonText}>Sign in</Text>
              </TouchableOpacity>
              
              {/* Sign Up Link */}
              <View style={styles.signUpContainer}>
                <Text style={styles.signUpText}>Don&apos;t Have an account? </Text>
                <TouchableOpacity onPress={onSignIn}>
                  <Text style={styles.signUpLink}>SignUp</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </ImageBackground>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundImage: {
    flex: 1,
    width: screenWidth,
    height: screenHeight,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 65,
  },
  formContainer: {
    marginHorizontal: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 30,
    paddingHorizontal: 12,
    paddingVertical: 14,
    minHeight: 713,
  },
  profileCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#D9D9D9',
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
  },
  socialButtonText: {
    fontSize: 12,
    fontWeight: '400',
    color: '#000000',
    marginLeft: 24,
    fontFamily: 'Poppins',
    lineHeight: 18,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 13,
  },
  dividerLine: {
    flex: 1,
    height: 0.2,
    backgroundColor: '#D9D9D9',
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
  textInput: {
    backgroundColor: '#EEEEEE',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 12,
    fontWeight: '300',
    color: '#000000',
    fontFamily: 'Poppins',
    lineHeight: 18,
  },
  termsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 20,
    paddingHorizontal: 8,
  },
  checkbox: {
    width: 8,
    height: 8,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
    marginRight: 5,
    marginTop: 3,
  },
  checkboxChecked: {
    backgroundColor: '#F9A825',
  },
  termsText: {
    flex: 1,
    fontSize: 10,
    fontWeight: '300',
    color: 'rgba(238, 238, 238, 0.6)',
    fontFamily: 'Poppins',
    lineHeight: 15,
    textAlign: 'center',
  },
  signInButton: {
    backgroundColor: '#F9A825',
    borderRadius: 20,
    paddingVertical: 11,
    alignItems: 'center',
    marginBottom: 17,
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
});

export default RegisterScreen;
