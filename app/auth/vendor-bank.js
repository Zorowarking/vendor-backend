import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import Colors from '../../constants/Colors';
import { useAuthStore } from '../../store/authStore';
import { vendorApi } from '../../services/vendorApi';

// ─── Validation Rules ─────────────────────────────────────────────────────────
const VALIDATORS = {
  holderName: (v) => {
    if (!v.trim()) return 'Account holder name is required.';
    if (v.trim().length < 3) return 'Name must be at least 3 characters.';
    if (!/^[a-zA-Z\s.]+$/.test(v)) return 'Name must contain letters only (no numbers or special characters).';
    return null;
  },
  bankName: (v) => {
    if (!v.trim()) return 'Bank name is required.';
    if (v.trim().length < 2) return 'Please enter a valid bank name.';
    return null;
  },
  accountNumber: (v) => {
    if (!v.trim()) return 'Account number is required.';
    if (!/^\d+$/.test(v)) return 'Account number must contain digits only.';
    if (v.length < 9 || v.length > 18) return 'Account number must be between 9 and 18 digits.';
    return null;
  },
  ifscCode: (v) => {
    if (!v.trim()) return 'IFSC code is required.';
    if (v.length !== 11) return 'IFSC code must be exactly 11 characters.';
    // RBI standard: 4 letters + 0 + 6 alphanumeric
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v)) {
      return 'Invalid IFSC format. Example: HDFC0001234 (4 letters + 0 + 6 alphanumeric).';
    }
    return null;
  },
  upiId: (v) => {
    if (!v.trim()) return null; // Optional field
    if (!/^[\w.\-_]{3,}@[a-zA-Z]{3,}$/.test(v)) {
      return 'Invalid UPI ID format. Example: yourname@okaxis or name@upi';
    }
    return null;
  },
};

// Validate all fields and return an errors object
const validateAll = (data) => {
  const errs = {};
  Object.keys(VALIDATORS).forEach((key) => {
    const err = VALIDATORS[key](data[key] || '');
    if (err) errs[key] = err;
  });
  return errs;
};

// ─── Helper: Inline Error Text ────────────────────────────────────────────────
const FieldError = ({ message }) => {
  if (!message) return null;
  return <Text style={styles.fieldError}>⚠ {message}</Text>;
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function VendorBankScreen() {
  const [bankData, setBankData] = useState({
    holderName: '',
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    upiId: '',
  });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isAccVisible, setIsAccVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const router = useRouter();
  const setProfileStatus = useAuthStore((state) => state.setProfileStatus);
  const vendorRegistrationData = useAuthStore((state) => state.vendorRegistrationData);

  // Handle live input and immediately clear/set field error
  const handleInputChange = (name, value) => {
    let processed = value;

    if (name === 'ifscCode') {
      // Auto-uppercase, strip non-alphanumeric, max 11 chars
      processed = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().substring(0, 11);
    }

    if (name === 'accountNumber') {
      // Digits only
      processed = value.replace(/\D/g, '').substring(0, 18);
    }

    if (name === 'holderName' || name === 'bankName') {
      // Trim leading spaces
      processed = value.replace(/^\s+/, '');
    }

    setBankData((prev) => ({ ...prev, [name]: processed }));

    // Validate the changed field in real-time (only after it's been touched)
    if (touched[name]) {
      const err = VALIDATORS[name]?.(processed);
      setErrors((prev) => ({ ...prev, [name]: err || undefined }));
    }
  };

  // Mark field as touched on blur and run validation
  const handleBlur = (name) => {
    setTouched((prev) => ({ ...prev, [name]: true }));
    const err = VALIDATORS[name]?.(bankData[name] || '');
    setErrors((prev) => ({ ...prev, [name]: err || undefined }));
  };

  const handleSubmit = async () => {
    if (!vendorRegistrationData) {
      Alert.alert('Session Expired', 'Please go back and re-enter your business details first.');
      router.back();
      return;
    }

    // Touch all fields so errors appear
    const allTouched = Object.keys(bankData).reduce((acc, k) => ({ ...acc, [k]: true }), {});
    setTouched(allTouched);

    const allErrors = validateAll(bankData);
    setErrors(allErrors);

    if (Object.keys(allErrors).length > 0) {
      const firstError = Object.values(allErrors)[0];
      Alert.alert('Please Fix Errors', firstError);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...vendorRegistrationData,
        bankData,
      };

      await vendorApi.updateProfile(payload);
      router.push('/kyc');
    } catch (error) {
      console.error('Vendor registration error:', error);
      const serverMessage =
        error.response?.data?.error ||
        error.response?.data?.details ||
        error.message;
      Alert.alert(
        'Submission Failed',
        serverMessage
          ? `${serverMessage}`
          : 'Could not save details to the server. Please check your internet connection and try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Determine input border color
  const inputStyle = (name) => [
    styles.input,
    touched[name] && errors[name] ? styles.inputError : null,
    touched[name] && !errors[name] && bankData[name] ? styles.inputValid : null,
  ];

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>Bank Details</Text>
            <Text style={styles.subtitle}>Where we'll send your earnings</Text>
          </View>

          {/* ── Info Banner ─────────────────────────────────────────── */}
          <View style={styles.infoBanner}>
            <Text style={styles.infoBannerText}>
              🔒 Your bank details are encrypted and used only for payout processing. Ensure all details exactly match your bank records.
            </Text>
          </View>

          <View style={styles.form}>

            {/* ── Account Holder Name ──────────────────────────────── */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Account Holder Name <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={inputStyle('holderName')}
                placeholder="Full name as per bank records"
                value={bankData.holderName}
                onChangeText={(text) => handleInputChange('holderName', text)}
                onBlur={() => handleBlur('holderName')}
                autoCapitalize="words"
              />
              <FieldError message={touched.holderName && errors.holderName} />
              {!errors.holderName && (
                <Text style={styles.helperText}>Must match your bank account name exactly</Text>
              )}
            </View>

            {/* ── Bank Name ────────────────────────────────────────── */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Bank Name <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={inputStyle('bankName')}
                placeholder="e.g. HDFC Bank, SBI, ICICI Bank"
                value={bankData.bankName}
                onChangeText={(text) => handleInputChange('bankName', text)}
                onBlur={() => handleBlur('bankName')}
                autoCapitalize="words"
              />
              <FieldError message={touched.bankName && errors.bankName} />
            </View>

            {/* ── Account Number ───────────────────────────────────── */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Account Number <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={inputStyle('accountNumber')}
                placeholder="Enter 9–18 digit account number"
                keyboardType="number-pad"
                value={bankData.accountNumber}
                onChangeText={(text) => handleInputChange('accountNumber', text)}
                onBlur={() => handleBlur('accountNumber')}
                secureTextEntry={!isAccVisible}
                onFocus={() => setIsAccVisible(true)}
              />
              <FieldError message={touched.accountNumber && errors.accountNumber} />
              <Text style={styles.helperText}>
                {isAccVisible
                  ? `${bankData.accountNumber.length} digits entered (9–18 required)`
                  : 'Number is hidden for security — tap to reveal while typing'}
              </Text>
            </View>

            {/* ── IFSC Code ────────────────────────────────────────── */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>IFSC Code <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={inputStyle('ifscCode')}
                placeholder="e.g. HDFC0001234"
                autoCapitalize="characters"
                maxLength={11}
                value={bankData.ifscCode}
                onChangeText={(text) => handleInputChange('ifscCode', text)}
                onBlur={() => handleBlur('ifscCode')}
              />
              <FieldError message={touched.ifscCode && errors.ifscCode} />
              {!errors.ifscCode && (
                <Text style={styles.helperText}>
                  Format: 4 letters + 0 + 6 alphanumeric (e.g. HDFC0001234)
                  {bankData.ifscCode.length > 0 ? ` · ${bankData.ifscCode.length}/11` : ''}
                </Text>
              )}
            </View>

            {/* ── UPI ID ───────────────────────────────────────────── */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>UPI ID <Text style={styles.optional}>(Optional)</Text></Text>
              <TextInput
                style={inputStyle('upiId')}
                placeholder="e.g. yourname@okaxis"
                autoCapitalize="none"
                keyboardType="email-address"
                value={bankData.upiId}
                onChangeText={(text) => handleInputChange('upiId', text)}
                onBlur={() => handleBlur('upiId')}
              />
              <FieldError message={touched.upiId && errors.upiId} />
              {!errors.upiId && (
                <Text style={styles.helperText}>Format: name@bankhandle (e.g. john@okicici)</Text>
              )}
            </View>

            {/* ── Submit ───────────────────────────────────────────── */}
            <TouchableOpacity
              style={[styles.nextButton, isSubmitting && { opacity: 0.7 }]}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <ActivityIndicator color="white" style={{ marginRight: 8 }} />
                  <Text style={styles.nextButtonText}>Saving...</Text>
                </View>
              ) : (
                <Text style={styles.nextButtonText}>Submit & Proceed to KYC →</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.backButton}
              onPress={() => {
                Alert.alert(
                  'Cancel Registration',
                  'Are you sure you want to go back to the login screen? Your progress will be lost.',
                  [
                    { text: 'Stay', style: 'cancel' },
                    {
                      text: 'Go Back',
                      style: 'destructive',
                      onPress: async () => {
                        await useAuthStore.getState().logout();
                        router.replace('/auth/login');
                      },
                    },
                  ]
                );
              }}
            >
              <Text style={styles.backButtonText}>← Back to Login</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
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
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.black,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.subText,
  },
  infoBanner: {
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 24,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  infoBannerText: {
    fontSize: 12,
    color: '#1E40AF',
    lineHeight: 18,
  },
  form: {
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.black,
    marginBottom: 8,
  },
  required: {
    color: Colors.error,
  },
  optional: {
    color: Colors.subText,
    fontWeight: 'normal',
    fontSize: 12,
  },
  input: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    height: 52,
    fontSize: 16,
    color: Colors.black,
    backgroundColor: '#FAFAFA',
  },
  inputError: {
    borderColor: Colors.error,
    backgroundColor: '#FFF5F5',
  },
  inputValid: {
    borderColor: Colors.success,
    backgroundColor: '#F0FFF4',
  },
  fieldError: {
    fontSize: 12,
    color: Colors.error,
    marginTop: 5,
    fontWeight: '500',
  },
  helperText: {
    fontSize: 11,
    color: Colors.subText,
    marginTop: 4,
    lineHeight: 16,
  },
  nextButton: {
    backgroundColor: Colors.primary,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 16,
  },
  nextButtonText: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: 'bold',
  },
  backButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  backButtonText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
});
