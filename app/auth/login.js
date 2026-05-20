import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Image, KeyboardAvoidingView, Platform, ScrollView,
  Alert, ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import Colors from '../../constants/Colors';
import { authService } from '../../services/auth';

// ─── REMOVED: Google Sign-In ─────────────────────────────────────────────────
// Google Sign-In has been intentionally removed from the vendor auth page.
// All vendor authentication is now done exclusively via Phone OTP.
// The authService.googleLogin() function is preserved on the backend
// for any future re-introduction, but the UI entry point is removed.
// ─────────────────────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const router = useRouter();

  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [phoneError, setPhoneError] = useState(null);
  const [emailError, setEmailError] = useState(null);

  const validatePhone = (val) => {
    if (!val || val.length !== 10 || !/^\d+$/.test(val)) {
      return 'Please enter a valid 10-digit phone number.';
    }
    return null;
  };

  const validateEmail = (val) => {
    if (!val.trim()) return 'Email address is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim())) {
      return 'Please enter a valid email address.';
    }
    return null;
  };

  const handleSendOTP = async () => {
    if (loading) return;

    const cleanPhone = phoneNumber.trim();
    const cleanEmail = email.trim();

    // Validate both fields and surface inline errors
    const pErr = validatePhone(cleanPhone);
    const eErr = validateEmail(cleanEmail);
    setPhoneError(pErr);
    setEmailError(eErr);

    if (pErr || eErr) return;

    setLoading(true);
    console.log('[AUTH] Requesting OTP for', cleanPhone);

    try {
      const fullPhone = `+91${cleanPhone}`;

      // Native Firebase auth automatically handles APNs/Play Integrity silently
      const confirmationResult = await authService.sendOTP(fullPhone);

      authService._confirmationResult = confirmationResult;

      console.log('[AUTH] OTP sent successfully. Navigating to verification...');
      router.push({
        pathname: '/auth/otp-verify',
        params: { phone: cleanPhone, email: cleanEmail },
      });
    } catch (err) {
      console.error('[AUTH] OTP Request Failed:', err);
      Alert.alert(
        'Failed to Send OTP',
        err.message || 'Could not send verification code. Please check your number and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Image
            source={{ uri: 'https://cdn-icons-png.flaticon.com/512/1160/1160358.png' }}
            style={styles.logo}
          />
          <Text style={styles.title}>Vendor Portal</Text>
          <Text style={styles.subtitle}>
            Enter your mobile number and email to register or sign in
          </Text>
        </View>

        {/* ── Phone Number ─────────────────────────────────────────── */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Mobile Number *</Text>
          <View style={[styles.phoneInput, phoneError && styles.inputError]}>
            <Text style={styles.countryCode}>+91</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter 10-digit number"
              placeholderTextColor={Colors.darkGrey}
              keyboardType="phone-pad"
              maxLength={10}
              value={phoneNumber}
              onChangeText={(v) => {
                setPhoneNumber(v);
                if (phoneError) setPhoneError(validatePhone(v));
              }}
              onBlur={() => setPhoneError(validatePhone(phoneNumber))}
              editable={!loading}
            />
          </View>
          {phoneError ? <Text style={styles.fieldError}>⚠ {phoneError}</Text> : null}
        </View>

        {/* ── Email ────────────────────────────────────────────────── */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Email Address *</Text>
          <TextInput
            style={[styles.textInput, emailError && styles.inputError]}
            placeholder="Enter email address"
            placeholderTextColor={Colors.darkGrey}
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              if (emailError) setEmailError(validateEmail(v));
            }}
            onBlur={() => setEmailError(validateEmail(email))}
            editable={!loading}
          />
          {emailError ? <Text style={styles.fieldError}>⚠ {emailError}</Text> : null}
        </View>

        {/* ── Send OTP ──────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.actionButton, loading && styles.disabledButton]}
          onPress={handleSendOTP}
          disabled={loading}
        >
          {loading ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ActivityIndicator color={Colors.white} style={{ marginRight: 8 }} />
              <Text style={styles.actionButtonText}>Sending OTP...</Text>
            </View>
          ) : (
            <Text style={styles.actionButtonText}>Send OTP Verification</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.footerText}>
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  scrollContainer: {
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 36,
  },
  logo: {
    width: 90,
    height: 90,
    marginBottom: 16,
    tintColor: Colors.primary,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: Colors.black,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.subText,
    textAlign: 'center',
    lineHeight: 20,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    color: Colors.black,
    fontWeight: 'bold',
    marginBottom: 8,
    marginLeft: 2,
  },
  phoneInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
    backgroundColor: '#F8F9FA',
  },
  countryCode: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.black,
    marginRight: 12,
    borderRightWidth: 1.5,
    borderRightColor: Colors.border,
    paddingRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: Colors.black,
    fontWeight: '600',
  },
  textInput: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
    fontSize: 16,
    color: Colors.black,
    fontWeight: '600',
    backgroundColor: '#F8F9FA',
  },
  inputError: {
    borderColor: Colors.error,
    backgroundColor: '#FFF5F5',
  },
  fieldError: {
    fontSize: 12,
    color: Colors.error,
    marginTop: 5,
    fontWeight: '500',
    marginLeft: 2,
  },
  actionButton: {
    backgroundColor: Colors.primary,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
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
  disabledButton: {
    opacity: 0.7,
  },
  footerText: {
    marginTop: 32,
    textAlign: 'center',
    color: Colors.subText,
    fontSize: 12,
    lineHeight: 18,
  },
});
