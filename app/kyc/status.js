import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Linking, ScrollView, Alert } from 'react-native';

import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Colors from '../../constants/Colors';


import { useAuthStore } from '../../store/authStore';
import { notificationService } from '../../services/notificationService';
// import messaging from '@react-native-firebase/messaging'; // Requires dev build

export default function KYCStatus() {
  const router = useRouter();
  const { profileStatus, role, setProfileStatus, logout, suspensionReason } = useAuthStore();

  const [kycStatus, setKycStatus] = useState(profileStatus?.toUpperCase() || 'UNDER_REVIEW');

  useEffect(() => {
    // If approved, ensure notifications are ready
    if (kycStatus === 'APPROVED') {
      notificationService.requestPermissionAndToken();
    }
  }, [kycStatus]);

  useEffect(() => {
    // Basic FCM Listener setup (Mocked for Expo Go)
    console.log('FCM: Initializing status listeners...');
    
    // In real implementation:
    /*
    const unsubscribe = messaging().onMessage(async remoteMessage => {
      if (remoteMessage.data?.type === 'KYC_STATUS_UPDATE') {
        const newStatus = remoteMessage.data.status;
        setKycStatus(newStatus);
        setProfileStatus(newStatus);
      }
    });
    return unsubscribe;
    */
  }, []);

  const renderStatus = () => {
    switch (kycStatus) {
      case 'APPROVED':
        return (
          <View style={styles.content}>
            <Image 
              source={{ uri: 'https://cdn-icons-png.flaticon.com/512/190/190411.png' }} 
              style={styles.statusIcon} 
            />
            <Text style={[styles.statusTitle, { color: Colors.success }]}>Account Activated!</Text>
            <Text style={styles.statusDescription}>
              Your KYC has been approved. You can now start using the app as a {role === 'VENDOR' ? 'Vendor' : 'Delivery Partner'}.
            </Text>
            <TouchableOpacity 
              style={[styles.actionButton, { backgroundColor: Colors.success }]}
              onPress={() => router.replace(role === 'VENDOR' ? '/(vendor)' : '/(rider)')}
            >
              <Text style={styles.actionButtonText}>Proceed to Dashboard</Text>
            </TouchableOpacity>
          </View>
        );
      case 'REJECTED':
        return (
          <View style={styles.content}>
            <Image 
              source={{ uri: 'https://cdn-icons-png.flaticon.com/512/190/190406.png' }} 
              style={styles.statusIcon} 
            />
            <Text style={[styles.statusTitle, { color: Colors.error }]}>KYC Rejected</Text>
            <Text style={styles.statusDescription}>
              Reason: {suspensionReason || 'Your document was not clear. Please resubmit clear documents.'}
            </Text>
            <TouchableOpacity 
              style={[styles.actionButton, { backgroundColor: Colors.error }]}
              onPress={() => { setProfileStatus('PENDING'); router.replace('/kyc'); }}
            >
              <Text style={styles.actionButtonText}>Resubmit Documents</Text>
            </TouchableOpacity>
          </View>
        );

    case 'KYC_SUBMITTED':
      case 'UNDER_REVIEW':
      default:
        return (
          <View style={styles.content}>
            <Image 
              source={{ uri: 'https://cdn-icons-png.flaticon.com/512/1043/1043424.png' }} 
              style={styles.statusIcon} 
            />
               <Text style={styles.statusTitle}>Verification in Progress</Text>
            <Text style={styles.statusDescription}>
              Your documents are under review. This usually takes 24-48 hours. We'll notify you once your account is activated.
              {profileStatus === 'mock_approved' && ' (Auto-approved for Developer testing)'}
            </Text>
            
            {/* DEV MOCK BUTTON */}
            <TouchableOpacity 
              style={styles.devApproveButton}
              onPress={() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setKycStatus('APPROVED');
                setProfileStatus('APPROVED'); // Standardized for UI
              }}
            >
              <Text style={styles.devApproveText}>[DEV MOCK] Approve KYC</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.supportButton}

              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                Linking.openURL('mailto:support@app.com');
              }}
            >
              <Text style={styles.supportButtonText}>Contact Support</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.logoutButton} 
              onPress={() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                logout();
              }}
            >
              <Ionicons name="log-out-outline" size={20} color={Colors.error} />
              <Text style={styles.logoutButtonText}>Logout</Text>
            </TouchableOpacity>


            {/* DEV ONLY MOCK TOOLS */}
            <View style={styles.devTools}>
              <Text style={styles.devToolsTitle}>[DEV] Security Testing</Text>
              <View style={styles.devToolsGrid}>
                <TouchableOpacity 
                  style={[styles.devBtn, { borderColor: Colors.warning }]}
                  onPress={() => {
                    const { setProfileStatus } = useAuthStore.getState();
                    setProfileStatus('SUSPENDED', 'Payment irregularities and repeated policy violations.');
                    Alert.alert('Mock Success', 'Vendor status set to SUSPENDED. Enforcement initiated.');
                  }}
                >
                  <Ionicons name="alert-circle-outline" size={16} color={Colors.warning} />
                  <Text style={[styles.devBtnText, { color: Colors.warning }]}>Mock Suspend</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.devBtn, { borderColor: Colors.error }]}
                  onPress={() => {
                    const { setProfileStatus } = useAuthStore.getState();
                    setProfileStatus('DISABLED');
                    Alert.alert('Mock Success', 'Vendor status set to DISABLED. Compliance termination active.');
                  }}
                >
                  <Ionicons name="lock-closed-outline" size={16} color={Colors.error} />
                  <Text style={[styles.devBtnText, { color: Colors.error }]}>Mock Disable</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.version}>v1.2.5 (Security Phase)</Text>

          </View>
        );
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Account Status</Text>
        </View>

        {renderStatus()}

        <View style={styles.stepContainer}>
          <View style={styles.step}>
            <View style={[styles.stepDot, styles.stepCompleted]} />
            <Text style={styles.stepText}>Registration Complete</Text>
          </View>
          <View style={styles.stepLine} />
          <View style={styles.step}>
            <View style={[styles.stepDot, styles.stepCompleted]} />
            <Text style={styles.stepText}>KYC Documents Submitted</Text>
          </View>
          <View style={styles.stepLine} />
          <View style={styles.step}>
            <View style={[styles.stepDot, kycStatus === 'APPROVED' ? styles.stepCompleted : styles.stepActive]} />
            <Text style={[styles.stepText, kycStatus === 'APPROVED' ? null : styles.stepTextActive]}>Verification Review</Text>
          </View>
        </View>
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
    alignItems: 'center',
    flexGrow: 1,
  },
  header: {
    marginBottom: 40,
    width: '100%',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.black,
    textAlign: 'center',
  },
  content: {
    alignItems: 'center',
    marginBottom: 40,
  },
  statusIcon: {
    width: 120,
    height: 120,
    marginBottom: 24,
  },
  statusTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.black,
    marginBottom: 12,
    textAlign: 'center',
  },
  statusDescription: {
    fontSize: 16,
    color: Colors.subText,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  actionButton: {
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 30,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  actionButtonText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  supportButton: {
    marginTop: 10,
    padding: 10,
  },
  supportButtonText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  logoutButton: {
    marginTop: 20,
    padding: 10,
  },
  logoutButtonText: {
    color: Colors.error,
    fontSize: 14,
    fontWeight: 'bold',
  },
  stepContainer: {
    width: '100%',
    paddingHorizontal: 40,
    marginBottom: 40,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.border,
    marginRight: 16,
  },
  stepCompleted: {
    backgroundColor: Colors.success,
  },
  stepActive: {
    borderWidth: 2,
    borderColor: Colors.primary,
    backgroundColor: Colors.white,
  },
  stepLine: {
    width: 2,
    height: 30,
    backgroundColor: Colors.border,
    marginLeft: 5,
    marginBottom: 4,
  },
  stepText: {
    fontSize: 14,
    color: Colors.subText,
  },
  stepTextActive: {
    color: Colors.black,
    fontWeight: 'bold',
  },
  devApproveButton: {
    backgroundColor: Colors.info,
    padding: 12,
    borderRadius: 8,
    marginTop: 20,
    marginBottom: 10,
    width: '100%',
    alignItems: 'center'
  },
  devApproveText: {
    color: Colors.white,
    fontWeight: 'bold',
    fontSize: 16
  }
});
