import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Image, 
  TouchableOpacity, 
  Linking, 
  ScrollView, 
  SafeAreaView,
  StatusBar
} from 'react-native';

import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '../../constants/Colors';

import { useAuthStore } from '../../store/authStore';
import { socketService } from '../../services/socketService';
import { vendorApi } from '../../services/vendorApi';

export default function KYCStatus() {
  const router = useRouter();
  const { profileStatus, setProfileStatus, logout, user } = useAuthStore();
  const [kycStatus, setKycStatus] = useState(profileStatus?.toUpperCase() || 'UNDER_REVIEW');

  useEffect(() => {
    if (kycStatus === 'APPROVED' || kycStatus === 'READY') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Give the user a moment to see the success state before redirecting
      const timer = setTimeout(() => {
        router.replace('/(vendor)');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [kycStatus]);

  useEffect(() => {
    // Real-time status updates via Socket.IO
    if (user?.uid) {
      socketService.connect(user.uid);
      
      const handleStatusUpdate = ({ status }) => {
        console.log(`[SOCKET] Received account status update: ${status}`);
        const upperStatus = status.toUpperCase();
        setKycStatus(upperStatus);
        setProfileStatus(upperStatus);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      };

      socketService.onAccountStatusUpdate(handleStatusUpdate);
      return () => socketService.offAccountStatusUpdate(handleStatusUpdate);
    }
  }, [user?.uid, setProfileStatus]);

  useEffect(() => {
    // Polling fallback every 10 seconds
    const checkStatus = async () => {
      try {
        const vendor = await vendorApi.getProfile();
        if (vendor && vendor.accountStatus) {
          const remoteStatus = vendor.accountStatus.toUpperCase();
          if (remoteStatus !== kycStatus) {
            console.log(`[POLL] Status mismatch: ${kycStatus} -> ${remoteStatus}`);
            setKycStatus(remoteStatus);
            setProfileStatus(remoteStatus);
          }
        }
      } catch (err) {
        console.error('[POLL] Failed to check status:', err);
      }
    };

    const interval = setInterval(checkStatus, 2000);
    return () => clearInterval(interval);
  }, [kycStatus, setProfileStatus]);

  const renderStatusIcon = () => {
    switch (kycStatus) {
      case 'APPROVED':
      case 'ACTIVE':
      case 'READY':
        return <Ionicons name="checkmark-circle" size={100} color={Colors.success} />;
      case 'REJECTED':
      case 'DISABLED':
        return <Ionicons name="close-circle" size={100} color={Colors.error} />;
      case 'SUSPENDED':
        return <Ionicons name="alert-circle" size={100} color={Colors.warning} />;
      default:
        return <Ionicons name="time" size={100} color={Colors.primary} />;
    }
  };

  const getStatusTitle = () => {
    switch (kycStatus) {
      case 'APPROVED':
      case 'ACTIVE':
      case 'READY': return 'Account Activated';
      case 'REJECTED': return 'Verification Failed';
      case 'SUSPENDED': return 'Account Suspended';
      case 'DISABLED': return 'Account Disabled';
      default: return 'Verification in Progress';
    }
  };

  const getStatusDescription = () => {
    switch (kycStatus) {
      case 'APPROVED':
      case 'ACTIVE':
      case 'READY': return 'Congratulations! Your account has been approved. You can now start managing your store and receiving orders.';
      case 'REJECTED': return 'Unfortunately, your documents could not be verified. Please review the requirements and resubmit.';
      case 'SUSPENDED': return 'Your account is temporarily suspended. Please contact support.';
      case 'DISABLED': return 'Your account is disabled. Access is restricted.';
      default: return 'Our team is currently reviewing your documents. This process usually takes 24-48 business hours.';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        
        <View style={styles.header}>
          <View>
            <Text style={styles.headerSubtitle}>Vetting Phase</Text>
            <Text style={styles.headerTitle}>Identity Verification</Text>
          </View>
          <View style={styles.statusBadge}>
            <View style={[styles.statusDot, { backgroundColor: kycStatus === 'APPROVED' ? Colors.success : Colors.warning }]} />
            <Text style={styles.statusBadgeText}>{kycStatus.replace('_', ' ')}</Text>
          </View>
        </View>

        <LinearGradient
          colors={['#FFFFFF', '#F8F9FA']}
          style={styles.card}
        >
          <View style={styles.iconContainer}>
            <LinearGradient
              colors={[Colors.primary + '10', Colors.primary + '05']}
              style={styles.iconBg}
            >
              {renderStatusIcon()}
            </LinearGradient>
          </View>
          
          <Text style={styles.statusTitle}>{getStatusTitle()}</Text>
          <Text style={styles.statusDescription}>{getStatusDescription()}</Text>

          {kycStatus === 'REJECTED' && (
            <TouchableOpacity 
              style={styles.primaryButton}
              onPress={() => {
                setProfileStatus('PENDING');
                router.replace('/auth/vendor-register');
              }}
            >
              <LinearGradient
                colors={[Colors.primary, Colors.secondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.gradientButton}
              >
                <Text style={styles.primaryButtonText}>Resubmit Documents</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}

          {(kycStatus === 'APPROVED' || kycStatus === 'READY') && (
            <TouchableOpacity 
              style={styles.primaryButton}
              onPress={() => router.replace('/(vendor)')}
            >
              <LinearGradient
                colors={[Colors.success, '#388E3C']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.gradientButton}
              >
                <Text style={styles.primaryButtonText}>Go to Dashboard</Text>
                <Ionicons name="arrow-forward" size={20} color={Colors.white} style={{ marginLeft: 8 }} />
              </LinearGradient>
            </TouchableOpacity>
          )}
        </LinearGradient>

        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>Verification Timeline</Text>
          
          <View style={styles.step}>
            <View style={[styles.stepNumber, styles.stepCompleted]}>
              <Ionicons name="checkmark" size={16} color={Colors.white} />
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepLabel}>Documents Submitted</Text>
              <Text style={styles.stepSubtext}>We have received your KYC documents safely.</Text>
            </View>
          </View>

          <View style={styles.step}>
            <View style={[styles.stepNumber, (kycStatus === 'APPROVED' || kycStatus === 'READY') ? styles.stepCompleted : styles.stepActive]}>
              {(kycStatus === 'APPROVED' || kycStatus === 'READY') ? (
                <Ionicons name="checkmark" size={16} color={Colors.white} />
              ) : (
                <Text style={styles.stepNumberText}>2</Text>
              )}
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepLabel}>Manual Review</Text>
              <Text style={styles.stepSubtext}>Our compliance team is verifying your details.</Text>
            </View>
          </View>

          <View style={styles.step}>
            <View style={[styles.stepNumber, (kycStatus === 'APPROVED' || kycStatus === 'READY') ? styles.stepActive : styles.stepInactive]}>
              <Text style={styles.stepNumberText}>3</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepLabel}>Store Activation</Text>
              <Text style={styles.stepSubtext}>Start adding products and receiving orders.</Text>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity 
            style={styles.supportLink}
            onPress={() => Linking.openURL('mailto:support@zorowarking.com')}
          >
            <Ionicons name="help-circle-outline" size={20} color={Colors.primary} />
            <Text style={styles.supportLinkText}>Need help? Contact Support</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
            <Text style={styles.logoutBtnText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  scrollContainer: {
    padding: 24,
    paddingTop: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1A1A1A',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#495057',
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 5,
    marginBottom: 32,
  },
  iconContainer: {
    marginBottom: 24,
  },
  iconBg: {
    padding: 24,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1A1A1A',
    marginBottom: 12,
    textAlign: 'center',
  },
  statusDescription: {
    fontSize: 15,
    color: '#6C757D',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  primaryButton: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  gradientButton: {
    flexDirection: 'row',
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  infoSection: {
    marginBottom: 40,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 24,
  },
  step: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    marginTop: 2,
  },
  stepCompleted: {
    backgroundColor: Colors.success,
  },
  stepActive: {
    backgroundColor: Colors.primary,
  },
  stepInactive: {
    backgroundColor: '#E9ECEF',
  },
  stepNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  stepContent: {
    flex: 1,
  },
  stepLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  stepSubtext: {
    fontSize: 14,
    color: '#6C757D',
  },
  footer: {
    alignItems: 'center',
    paddingBottom: 40,
  },
  supportLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  supportLinkText: {
    fontSize: 15,
    color: Colors.primary,
    fontWeight: '600',
    marginLeft: 8,
  },
  logoutBtn: {
    padding: 12,
  },
  logoutBtnText: {
    fontSize: 14,
    color: '#ADB5BD',
    fontWeight: '600',
  }
});
