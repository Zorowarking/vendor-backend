import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Colors from '../../constants/Colors';
import { useAuthStore } from '../../store/authStore';
import { vendorApi } from '../../services/vendorApi';

export default function KYCIndex() {
  const router = useRouter();
  
  // Use explicit selectors for better reactivity
  const role = useAuthStore((state) => state.role);
  const kycDocs = useAuthStore((state) => state.kycDocs);
  const profileStatus = useAuthStore((state) => state.profileStatus);
  const setProfileStatus = useAuthStore((state) => state.setProfileStatus);
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Debugging log to trace role issues
  console.log('KYC Index - Current Role:', role);

  const vendorDocs = [
    { id: 'gov_id', title: 'Government ID', subtitle: 'Passport, License, or National ID', required: true },
    { id: 'biz_proof', title: 'Business Proof', subtitle: 'Registration, GST, or Trade License', required: true },
    { id: 'pan', title: 'PAN Card', subtitle: 'Optional for tax purposes', required: false },
    { id: 'address_proof', title: 'Address Proof', subtitle: 'Utility bill or Rent agreement', required: true },
  ];

  // Safety check: If role is missing, don't default to Rider
  if (!role) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ marginTop: 16, color: Colors.subText }}>Syncing profile data...</Text>
        <TouchableOpacity 
          style={{ marginTop: 20 }}
          onPress={() => router.replace('/auth/role-select')}
        >
          <Text style={{ color: Colors.primary, fontWeight: 'bold' }}>Pick a Role</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const docs = vendorDocs;

  const handleSubmitKYC = async () => {
    // Check required docs
    const missingDocs = docs.filter(doc => doc.required && !kycDocs[doc.id]);
    if (missingDocs.length > 0) {
      Alert.alert('Missing Documents', `Please upload: ${missingDocs.map(d => d.title).join(', ')}`);
      return;
    }

    const kycPayload = {
      govIdType: 'Government ID',
      govIdUrl: kycDocs.gov_id?.url,
      businessProofType: 'Business Proof',
      businessProofUrl: kycDocs.biz_proof?.url,
      panUrl: kycDocs.pan?.url,
      addressProofUrl: kycDocs.address_proof?.url,
      drivingLicenseUrl: kycDocs.dl?.url,
      vehicleRegUrl: kycDocs.rc?.url
    };

    setIsSubmitting(true);
    try {
      await vendorApi.submitKyc(kycPayload);
      
      setProfileStatus('UNDER_REVIEW');
      router.push('/kyc/status');
    } catch (err) {
      console.error('KYC Submission Error:', err);
      Alert.alert('Error', 'Failed to submit KYC. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>KYC Verification</Text>
          <Text style={styles.subtitle}>Please upload the following documents to activate your account</Text>
        </View>

        <View style={styles.docList}>
          {docs.map((doc) => {
            const isUploaded = !!kycDocs[doc.id];
            return (
              <TouchableOpacity 
                key={doc.id} 
                style={[styles.docItem, isUploaded && styles.docItemUploaded]}
                onPress={() => router.push({ pathname: '/kyc/upload', params: { docId: doc.id, title: doc.title } })}
              >
                <View style={styles.docInfo}>
                  <Text style={styles.docTitle}>
                    {doc.title} {doc.required && <Text style={styles.required}>*</Text>}
                  </Text>
                  <Text style={styles.docSubtitle}>{doc.subtitle}</Text>
                  {isUploaded && (
                    <Text style={styles.successText}>✓ {kycDocs[doc.id].name} (Uploaded)</Text>
                  )}
                </View>
                <View style={[styles.uploadIconContainer, isUploaded && styles.uploadIconContainerUploaded]}>
                  <Image 
                    source={{ uri: isUploaded ? 'https://cdn-icons-png.flaticon.com/512/190/190411.png' : 'https://cdn-icons-png.flaticon.com/512/109/109612.png' }} 
                    style={[styles.uploadIcon, isUploaded && styles.uploadIconUploaded]} 
                  />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity 
          style={[styles.submitButton, isSubmitting && styles.disabledButton]}
          onPress={handleSubmitKYC}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.submitButtonText}>
              {profileStatus === 'UNDER_REVIEW' ? 'Update & Resubmit KYC' : 
               profileStatus === 'REJECTED' ? 'Fix & Resubmit KYC' : 
               (profileStatus === 'APPROVED' || profileStatus === 'READY' || profileStatus === 'ACTIVE') ? 'Update & Wait for Approval' :
               'Submit KYC for Review'}
            </Text>
          )}
        </TouchableOpacity>
        
        {(profileStatus === 'APPROVED' || profileStatus === 'READY' || profileStatus === 'ACTIVE') && (
          <View style={styles.warningBox}>
            <Ionicons name="warning" size={16} color={Colors.warning} />
            <Text style={styles.warningText}>
              Note: Updating your documents will temporarily put your account back into "Under Review" status until an admin approves the new documents.
            </Text>
          </View>
        )}
      </ScrollView>
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
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.subText,
    lineHeight: 22,
  },
  docList: {
    marginBottom: 40,
  },
  docItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  docItemUploaded: {
    borderColor: Colors.success,
    backgroundColor: '#F1F8E9',
  },
  docInfo: {
    flex: 1,
  },
  docTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.black,
    marginBottom: 4,
  },
  required: {
    color: Colors.error,
  },
  docSubtitle: {
    fontSize: 13,
    color: Colors.subText,
    marginBottom: 4,
  },
  successText: {
    fontSize: 12,
    color: Colors.success,
    fontWeight: 'bold',
  },
  uploadIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.grey,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadIconContainerUploaded: {
    backgroundColor: Colors.success,
  },
  uploadIcon: {
    width: 20,
    height: 20,
    tintColor: Colors.primary,
  },
  uploadIconUploaded: {
    tintColor: 'white',
  },
  submitButton: {
    backgroundColor: Colors.primary,
    height: 56,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  submitButtonText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  disabledButton: {
    backgroundColor: Colors.border,
  },
  warningBox: {
    flexDirection: 'row',
    backgroundColor: '#FFFBEB',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FEF3C7',
    marginBottom: 40,
    alignItems: 'flex-start',
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: '#92400E',
    marginLeft: 8,
    lineHeight: 18,
    fontWeight: '500',
  }
});
