import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Colors from '../../constants/Colors';
import { useAuthStore } from '../../store/authStore';
import { riderApi } from '../../services/riderApi';

export default function RiderBankScreen() {
  const [bankData, setBankData] = useState({
    holderName: '',
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    upiId: '',
  });
  const [isAccVisible, setIsAccVisible] = useState(false);
  const router = useRouter();
  const params = useLocalSearchParams();
  const setProfileStatus = useAuthStore((state) => state.setProfileStatus);

  const handleInputChange = (name, value) => {
    setBankData({ ...bankData, [name]: value });
  };

  const handleSubmit = async () => {
    if (!bankData.holderName || !bankData.bankName || !bankData.accountNumber || !bankData.ifscCode) {
      Alert.alert('Error', 'Please fill in required fields');
      return;
    }
    
    try {
      await riderApi.updateProfile({
        fullName: params.fullName,
        vehicleType: 'Two Wheeler',
        vehicleNumber: params.vehicleNumber,
        preferredZone: params.workingZone,
        bankData: bankData
      });
      router.push('/kyc/rider-kyc');
    } catch (e) {
      Alert.alert('Error', 'Failed to save rider details');
    }
  };

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

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Account Holder Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="Full Name as per bank"
                value={bankData.holderName}
                onChangeText={(text) => handleInputChange('holderName', text)}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Bank Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. ICICI Bank"
                value={bankData.bankName}
                onChangeText={(text) => handleInputChange('bankName', text)}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Account Number *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter Account Number"
                keyboardType="number-pad"
                value={bankData.accountNumber}
                onChangeText={(text) => handleInputChange('accountNumber', text)}
                secureTextEntry={!isAccVisible}
                onFocus={() => setIsAccVisible(true)}
                onBlur={() => setIsAccVisible(false)}
              />
              <Text style={styles.helperText}>
                {isAccVisible ? 'Showing number while typing' : 'Number is hidden for security'}
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>IFSC Code *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. ICIC0001234"
                autoCapitalize="characters"
                value={bankData.ifscCode}
                onChangeText={(text) => handleInputChange('ifscCode', text)}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>UPI ID (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. yourname@upi"
                value={bankData.upiId}
                onChangeText={(text) => handleInputChange('upiId', text)}
              />
            </View>

            <TouchableOpacity 
              style={styles.nextButton}
              onPress={handleSubmit}
            >
              <Text style={styles.nextButtonText}>Submit & Proceed to KYC</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  scrollContainer: {
    padding: 24,
    paddingTop: 60,
  },
  header: {
    marginBottom: 32,
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
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    height: 50,
    fontSize: 16,
    color: Colors.black,
  },
  nextButton: {
    backgroundColor: Colors.primary,
    height: 56,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  nextButtonText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
});
