import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import Colors from '../../constants/Colors';
import { authService } from '../../services/auth';
import { useAuthStore } from '../../store/authStore';
import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';
import { app } from '../../services/firebase';

export default function LoginScreen() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const router = useRouter();
  const recaptchaVerifier = React.useRef(null);

  const [loading, setLoading] = useState(false);

  const handleSendOTP = async () => {
    if (loading) return;
    
    if (phoneNumber.length !== 10) {
      Alert.alert('Invalid Number', 'Please enter a valid 10-digit phone number');
      return;
    }
    
    setLoading(true);
    console.log('UI: Requesting OTP for', phoneNumber);
    
    try {
      // In Web SDK, we must provide a phone number in E.164 format and a recaptcha verifier
      const fullPhone = `+91${phoneNumber}`;
      const confirmationResult = await authService.sendOTP(fullPhone, recaptchaVerifier.current);
      
      // Store confirmationResult globally or pass it to OTP screen
      authService._confirmationResult = confirmationResult;

      console.log('UI: OTP Request Success, Navigating...');
      // Navigate to OTP verify
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
            source={{ uri: 'https://cdn-icons-png.flaticon.com/512/1160/1160358.png' }} // Placeholder logo
            style={styles.logo}
          />
          <Text style={styles.title}>Vendor & Partner App</Text>
          <Text style={styles.subtitle}>Enter your phone number to continue</Text>
          <View style={styles.devHint}>
            <Text style={styles.devHintText}>Dev Tip: Use 99999 99999 / 123456 for bypass</Text>
          </View>
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

        {/* Firebase Recaptcha Modal */}
        <FirebaseRecaptchaVerifierModal
          ref={recaptchaVerifier}
          firebaseConfig={app.options}
          attemptInvisibleRetries={5}
        />

        <View style={styles.dividerContainer}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity 
          style={styles.googleButton}
          onPress={() => authService.googleLogin()}
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
  devHint: {
    backgroundColor: Colors.primary + '15',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 8,
  },
  devHintText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: 'bold',
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
