import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import Colors from '../../constants/Colors';
import { authService } from '../../services/auth';
import { vendorApi } from '../../services/vendorApi';
import { useAuthStore } from '../../store/authStore';

export default function VerifyPhoneScreen() {
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchingProfile, setFetchingProfile] = useState(true);
  
  const router = useRouter();
  const verifyPhoneSuccess = useAuthStore((state) => state.verifyPhoneSuccess);

  useEffect(() => {
    const fetchRegisteredPhone = async () => {
      try {
        setFetchingProfile(true);
        const profile = await vendorApi.getProfile();
        if (profile && profile.phone) {
          setPhone(profile.phone);
        } else {
          Alert.alert('Registration Error', 'Unable to retrieve your pre-registered phone number. Please contact support.');
        }
      } catch (err) {
        console.error('[VERIFY-PHONE] Fetch phone error:', err);
        Alert.alert('Error', 'Unable to load pre-registered phone number. Please try again.');
      } finally {
        setFetchingProfile(false);
      }
    };
    fetchRegisteredPhone();
  }, []);

  const handleSendOTP = async () => {
    if (!phone) {
      Alert.alert('Error', 'Phone number is missing. Please contact support.');
      return;
    }

    setLoading(true);
    try {
      console.log('[VERIFY-PHONE] Requesting OTP for pre-registered number:', phone);
      const result = await authService.sendOTP(phone);
      setConfirmationResult(result);
      setOtpSent(true);
      Alert.alert('OTP Sent', 'A verification code has been sent to your registered phone number.');
    } catch (err) {
      console.error('[VERIFY-PHONE] Send OTP error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (verificationCode.length !== 6) {
      Alert.alert('Invalid Code', 'Please enter the 6-digit verification code.');
      return;
    }

    setLoading(true);
    try {
      console.log('[VERIFY-PHONE] Confirming OTP code...');
      
      // Verify OTP via confirmation result
      if (!confirmationResult || !confirmationResult.confirm) {
        throw new Error('No confirmation result object found. Please try sending OTP again.');
      }
      
      await confirmationResult.confirm(verificationCode);
      console.log('[VERIFY-PHONE] Firebase confirmation success. Updating database...');

      // Notify backend that OTP verification succeeded and activate payout
      const response = await vendorApi.verifyPhonePayout();
      
      if (response && response.success) {
        // Sync Zustand store state
        verifyPhoneSuccess();
        
        Alert.alert(
          'Verification Successful',
          'Your phone number has been verified. Welcome to Vantyrn!',
          [
            {
              text: 'Go to Dashboard',
              onPress: () => {
                router.replace('/(vendor)');
              }
            }
          ]
        );
      } else {
        throw new Error(response?.error || 'Failed to update verification status on backend.');
      }
    } catch (err) {
      console.error('[VERIFY-PHONE] OTP Verification failed:', err);
      Alert.alert('Verification Failed', err.message || 'Invalid verification code. Please check and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    try {
      await authService.logout();
      router.replace('/auth/login');
    } catch (err) {
      console.error('Logout error:', err);
      Alert.alert('Error', 'Failed to log out. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (fetchingProfile) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Retrieving your registered details...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Activate Payouts</Text>
          <Text style={styles.subtitle}>
            Your vendor profile is APPROVED. Please complete this one-time secure verification to link your registered phone number.
          </Text>
        </View>

        {!otpSent ? (
          <View style={styles.content}>
            <View style={styles.numberCard}>
              <Text style={styles.cardLabel}>Registered Payout Number</Text>
              <Text style={styles.cardNumber}>{phone || 'Not Available'}</Text>
              <Text style={styles.cardDesc}>
                This number was submitted during Step 2. You will receive an SMS containing your verification code here.
              </Text>
            </View>

            <TouchableOpacity 
              style={[styles.button, loading && styles.disabledButton]} 
              onPress={handleSendOTP}
              disabled={loading || !phone}
            >
              {loading ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.buttonText}>Send Verification SMS</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.content}>
            <View style={styles.numberCard}>
              <Text style={styles.cardLabel}>OTP Sent To</Text>
              <Text style={styles.cardNumber}>{phone}</Text>
              <TouchableOpacity onPress={() => setOtpSent(false)} style={styles.changeBtn}>
                <Text style={styles.changeBtnText}>Resend SMS / Change Screen</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>6-Digit Verification Code</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter 6-digit code"
                placeholderTextColor={Colors.subText}
                keyboardType="number-pad"
                maxLength={6}
                value={verificationCode}
                onChangeText={setVerificationCode}
              />
            </View>

            <TouchableOpacity 
              style={[styles.button, loading && styles.disabledButton]} 
              onPress={handleVerifyOTP}
              disabled={loading || verificationCode.length !== 6}
            >
              {loading ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.buttonText}>Verify OTP & Activate</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} disabled={loading}>
          <Text style={styles.logoutButtonText}>Sign Out / Change Account</Text>
        </TouchableOpacity>
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
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 40,
    justifyContent: 'space-between',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.white,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: Colors.subText,
  },
  header: {
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: Colors.black,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.subText,
    lineHeight: 22,
  },
  content: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  numberCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 30,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.subText,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  cardNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.black,
    marginBottom: 10,
  },
  cardDesc: {
    fontSize: 13,
    color: Colors.subText,
    lineHeight: 18,
  },
  changeBtn: {
    marginTop: 10,
  },
  changeBtnText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '600',
  },
  inputContainer: {
    marginBottom: 30,
  },
  label: {
    fontSize: 14,
    color: Colors.black,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    height: 56,
    fontSize: 16,
    color: Colors.black,
  },
  button: {
    backgroundColor: Colors.primary,
    height: 56,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  disabledButton: {
    opacity: 0.7,
  },
  buttonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  logoutButton: {
    alignSelf: 'center',
    marginTop: 40,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  logoutButtonText: {
    color: '#DC3545',
    fontSize: 14,
    fontWeight: '600',
  },
});
