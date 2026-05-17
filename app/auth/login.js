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
  const [phoneNumber, setPhoneNumber] = useState('');
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [hasNativeGoogle, setHasNativeGoogle] = useState(true);

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
          <Text style={styles.subtitle}>Enter your phone number to continue</Text>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Phone Number</Text>
          <View style={styles.phoneInput}>
            <Text style={styles.countryCode}>+91</Text>
            <TextInput
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              keyboardType="phone-pad"
              maxLength={10}
              placeholder="00000 00000"
              style={styles.input}
              editable={!loading}
            />
          </View>
        </View>

        <TouchableOpacity 
          style={[styles.button, loading && styles.disabledButton]}
          onPress={handleSendOTP}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>Send OTP</Text>
          )}
        </TouchableOpacity>

        <View style={styles.dividerContainer}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity 
          style={[styles.googleButton, loading && { opacity: 0.5 }]}
          onPress={handleGoogleLogin}
          disabled={loading}
        >
          <Image 
            source={{ uri: 'https://cdn-icons-png.flaticon.com/512/300/300221.png' }} 
            style={styles.googleIcon} 
          />
          <Text style={styles.googleButtonText}>Continue with Google</Text>
        </TouchableOpacity>

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
});
