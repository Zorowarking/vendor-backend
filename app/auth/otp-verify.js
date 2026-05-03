import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Colors from '../../constants/Colors';
import { useAuthStore } from '../../store/authStore';
import { authService } from '../../services/auth';
import { Alert, ActivityIndicator } from 'react-native';

export default function OTPVerifyScreen() {
  const [otp, setOtp] = useState(['', '', '', '', '', '']); // 6 digits
  const [timer, setTimer] = useState(30);
  const [loading, setLoading] = useState(false);
  
  const router = useRouter();
  const { phone } = useLocalSearchParams();
  const inputRefs = useRef([]);


  useEffect(() => {
    let interval;
    if (timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

  const handleOtpChange = (value, index) => {
    // Only take the last character if multiple are entered
    const char = value.length > 1 ? value.charAt(value.length - 1) : value;
    
    // Clean non-numeric
    if (char !== '' && !/^\d+$/.test(char)) return;

    const newOtp = [...otp];
    newOtp[index] = char;
    setOtp(newOtp);

    // Auto-focus next input if a digit is entered
    if (char !== '' && index < 5) {
      inputRefs.current[index + 1].focus();
    }
    
    // Auto-submit if all 6 digits are filled
    if (newOtp.every(digit => digit !== '')) {
      handleVerify(newOtp.join(''));
    }
  };

  const handleKeyPress = (e, index) => {
    // If backspace is pressed and current input is empty, focus previous
    if (e.nativeEvent.key === 'Backspace' && otp[index] === '' && index > 0) {
      inputRefs.current[index - 1].focus();
    }
  };

  const isVerifying = useRef(false);
  const hasSucceeded = useRef(false);

  const handleVerify = async (code = otp.join('')) => {
    if (loading || isVerifying.current || hasSucceeded.current) return;

    if (code.length !== 6) {
      Alert.alert('Invalid OTP', 'Please enter all 6 digits.');
      return;
    }

    isVerifying.current = true;
    setLoading(true);
    console.log('UI: Verifying OTP Code...', code);
    
    try {
      const confirmationResult = authService._confirmationResult;
      
      if (!confirmationResult) {
        console.error('UI: No confirmationResult found in service!');
        Alert.alert('Error', 'Verification session expired. Please go back and try again.');
        setLoading(false);
        isVerifying.current = false;
        return;
      }

      await authService.verifyOTP(confirmationResult, code);
      console.log('UI: Verification successful!');
      setLoading(false); // Clear spinner
      hasSucceeded.current = true; // Mark as successful to block ANY future calls

      
      // We don't reset isVerifying or loading to true here because we want the UI 
      // to stay disabled until the router redirects the user.
    } catch (err) {
      console.error('UI: Verification Error', err);
      // Only show error if we haven't succeeded elsewhere
      if (!hasSucceeded.current) {
        Alert.alert('Invalid OTP', 'The code you entered is incorrect or has expired.');
      }
      setLoading(false);
      isVerifying.current = false;
    }
  };



  const handleResend = async () => {
    if (timer === 0) {
      setLoading(true);
      try {
        await authService.sendOTP(`+91${phone}`);
        setTimer(30);
      } catch (err) {
        console.error('UI: Resend Error', err);
        Alert.alert('Error', 'Failed to resend OTP. Please try again.');
      } finally {
        setLoading(false);
      }
    }
  };


  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>Confirm OTP</Text>
          <View style={styles.phoneHeader}>
            <Text style={styles.subtitle}>Sent to +91 {phone}</Text>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.changeNumberText}>Change</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.otpContainer}>
          {otp.map((digit, index) => (
            <TextInput
              key={index}
              ref={(ref) => (inputRefs.current[index] = ref)}
              style={[styles.otpInput, loading && styles.disabledInput]}
              value={digit}
              onChangeText={(value) => handleOtpChange(value, index)}
              onKeyPress={(e) => handleKeyPress(e, index)}
              keyboardType="number-pad"
              maxLength={1}
              autoFocus={index === 0}
              editable={!loading}
            />
          ))}
        </View>

        <View style={styles.resendContainer}>
          <Text style={styles.resendText}>Didn't receive code?</Text>
          <TouchableOpacity onPress={handleResend} disabled={timer > 0 || loading}>
            <Text style={[styles.resendButton, (timer > 0 || loading) && styles.disabledText]}>
              {timer > 0 ? `Resend in ${timer}s` : 'Resend OTP'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={[styles.button, loading && styles.disabledButton]}
          onPress={() => handleVerify(otp.join(''))}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.buttonText}>Verify & Continue</Text>
          )}
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
    padding: 24,
    paddingTop: 80,
  },
  header: {
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.black,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.subText,
  },
  phoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  changeNumberText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 40,
  },
  otpInput: {
    width: 45,
    height: 56,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 'bold',
    backgroundColor: Colors.grey,
  },
  resendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 40,
  },
  resendText: {
    color: Colors.subText,
    fontSize: 14,
  },
  resendButton: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  disabledText: {
    color: Colors.darkGrey,
  },
  button: {
    backgroundColor: Colors.primary,
    height: 56,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  disabledInput: {
    opacity: 0.5,
    backgroundColor: Colors.border,
  },
  disabledButton: {
    opacity: 0.7,
  },
});

