import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, NativeModules } from 'react-native';
import { useRouter } from 'expo-router';
import Colors from '../../constants/Colors';
import { authService } from '../../services/auth';

let GoogleSignin = null;
let statusCodes = {};

const hasGoogleSigninModule = !!NativeModules.RNGoogleSignin;

if (hasGoogleSigninModule) {
  try {
    const GoogleModule = require('@react-native-google-signin/google-signin');
    GoogleSignin = GoogleModule.GoogleSignin;
    statusCodes = GoogleModule.statusCodes;
  } catch (e) {
    console.warn('Google Sign-In module found but failed to load:', e.message);
  }
} else {
  console.log('[AUTH] Running in Expo Go: Native Google Sign-In disabled.');
}

export default function LoginScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [hasNativeGoogle, setHasNativeGoogle] = useState(true);

  // Tabbed Auth State
  const [activeTab, setActiveTab] = useState('google'); // 'google' | 'email'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  const handleEmailAuth = async () => {
    if (!email || !email.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    if (!password || password.length < 6) {
      Alert.alert('Invalid Password', 'Password must be at least 6 characters.');
      return;
    }
    if (isSignUp && !fullName.trim()) {
      Alert.alert('Missing Name', 'Please enter your full name.');
      return;
    }

    setLoading(true);
    try {
      let result;
      if (isSignUp) {
        result = await authService.signUpWithEmail(email, password, fullName);
      } else {
        result = await authService.loginWithEmail(email, password);
      }
      console.log('Vendor UI Email Auth Success:', result);
      // Automatic routing is handled globally in _layout.js via useAuthStore state update!
    } catch (error) {
      let errorMsg = error.message || 'An error occurred during authentication.';
      if (error.code === 'auth/user-not-found' || error.message?.includes('user-not-found')) {
        errorMsg = 'No account found with this email. Switch to "Sign Up" below to create one!';
      } else if (error.code === 'auth/wrong-password' || error.message?.includes('wrong-password')) {
        errorMsg = 'Incorrect password. Please try again.';
      } else if (error.code === 'auth/email-already-in-use' || error.message?.includes('email-already-in-use')) {
        errorMsg = 'This email is already registered. Switch to "Login" below!';
      }
      Alert.alert('Authentication Failed', errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Configure Google Sign-In
  useEffect(() => {
    if (!hasGoogleSigninModule) {
      console.log('[AUTH] Native Google Sign-In module not found. Likely running in Expo Go.');
      setHasNativeGoogle(false);
      return;
    }

    try {
      GoogleSignin.configure({
        webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
        iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
        offlineAccess: false,
      });
      setHasNativeGoogle(true);
    } catch (e) {
      console.error('Error configuring Google Sign-In:', e);
      setHasNativeGoogle(false);
    }
  }, []);

  const handleGoogleLogin = async () => {
    if (!hasNativeGoogle) {
      Alert.alert(
        'Feature Unavailable',
        'Google Sign-In requires a custom APK build. It does not work inside the "Expo Go" app.'
      );
      return;
    }

    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo?.data?.idToken || userInfo?.idToken;

      if (idToken) {
        console.log('UI: Starting Google Login...');
        await authService.googleLogin(idToken);
        console.log('UI: Google Login Success');
      }
    } catch (error) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        console.log('User cancelled login flow');
      } else if (error.code === statusCodes.IN_PROGRESS) {
        console.log('Login in progress');
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        Alert.alert('Error', 'Play services not available or outdated.');
      } else {
        console.error('UI: Google Login Failed', error);
        Alert.alert('Login Failed', error.message || 'An error occurred during Google Sign-In.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendOTP = async () => {
    if (loading) return;

    if (phoneNumber.length !== 10) {
      Alert.alert('Invalid Number', 'Please enter a valid 10-digit phone number');
      return;
    }
    
    setLoading(true);
    console.log('UI: Requesting OTP for', phoneNumber);
    
    try {
      const fullPhone = `+91${phoneNumber}`;
      
      const confirmationResult = await authService.sendOTP(fullPhone);
      
      authService._confirmationResult = confirmationResult;

      console.log('UI: OTP Request Success, Navigating...');
      router.push({ pathname: '/auth/otp-verify', params: { phone: phoneNumber } });
    } catch (err) {
      console.error('UI: OTP Request Failed', err);
      Alert.alert('Error', 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Image 
            source={{ uri: 'https://cdn-icons-png.flaticon.com/512/1160/1160358.png' }} 
            style={styles.logo}
          />
          <Text style={styles.title}>Vendors App</Text>
          <Text style={styles.subtitle}>Sign in with your Google account to get started</Text>
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'google' && styles.activeTabButton]}
            onPress={() => { setActiveTab('google'); setIsSignUp(false); }}
          >
            <Text style={[styles.tabText, activeTab === 'google' && styles.activeTabText]}>Google Account</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'email' && styles.activeTabButton]}
            onPress={() => setActiveTab('email')}
          >
            <Text style={[styles.tabText, activeTab === 'email' && styles.activeTabText]}>Email & Password</Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'google' ? (
          <TouchableOpacity 
            style={[styles.googleButton, loading && { opacity: 0.5 }]}
            onPress={handleGoogleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.primary} />
            ) : (
              <>
                <Image 
                  source={{ uri: 'https://cdn-icons-png.flaticon.com/512/300/300221.png' }} 
                  style={styles.googleIcon} 
                />
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.emailContainer}>
            {isSignUp && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Full Name</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter your full name"
                  placeholderTextColor={Colors.subText}
                  value={fullName}
                  onChangeText={setFullName}
                  editable={!loading}
                />
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email Address</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Enter email (e.g. yahoo, college, gmail)"
                placeholderTextColor={Colors.subText}
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
                editable={!loading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Enter password"
                placeholderTextColor={Colors.subText}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                editable={!loading}
              />
            </View>

            <TouchableOpacity
              style={[styles.actionButton, loading && styles.disabledButton]}
              onPress={handleEmailAuth}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.actionButtonText}>{isSignUp ? 'Create Vendor Account' : 'Login'}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toggleLink}
              onPress={() => setIsSignUp(!isSignUp)}
              disabled={loading}
            >
              <Text style={styles.toggleLinkText}>
                {isSignUp ? 'Already have an account? Login' : "Don't have an account? Sign Up"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.footerText}>
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  scrollContainer: {
    padding: 24,
    paddingTop: 80,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    width: 100,
    height: 100,
    marginBottom: 20,
    tintColor: Colors.primary,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.black,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.subText,
  },
  inputContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    color: Colors.black,
    fontWeight: '600',
    marginBottom: 8,
  },
  phoneInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 56,
  },
  countryCode: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.black,
    marginRight: 8,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
    paddingRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: Colors.black,
  },
  button: {
    backgroundColor: Colors.primary,
    height: 56,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  disabledButton: {
    opacity: 0.7,
  },
  buttonText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  footerText: {
    marginTop: 40,
    textAlign: 'center',
    color: Colors.subText,
    fontSize: 12,
    lineHeight: 18,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 30,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    marginHorizontal: 16,
    color: Colors.subText,
    fontSize: 14,
    fontWeight: '600',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  googleIcon: {
    width: 24,
    height: 24,
    marginRight: 12,
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.black,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F3F5',
    borderRadius: 12,
    padding: 6,
    marginBottom: 24,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeTabButton: {
    backgroundColor: Colors.white,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.subText,
  },
  activeTabText: {
    color: Colors.primary,
  },
  emailContainer: {
    width: '100%',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.black,
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
    fontSize: 16,
    color: Colors.black,
    backgroundColor: '#F8F9FA',
  },
  actionButton: {
    backgroundColor: Colors.primary,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  actionButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  toggleLink: {
    alignSelf: 'center',
    marginTop: 16,
    paddingVertical: 8,
  },
  toggleLinkText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.primary,
  },
});
