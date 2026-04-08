import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Alert } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/authStore';
import Colors from '../constants/Colors';
import { Stack } from 'expo-router';

export default function AccountSuspended() {
  const { suspensionReason, logout } = useAuthStore();

  const handleContactSupport = () => {
    Linking.openURL('mailto:support@vantyrn.com?subject=Account Suspension Appeal');
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons name="alert-circle" size={80} color={Colors.warning} />
        </View>
        
        <Text style={styles.title}>Account Suspended</Text>
        <Text style={styles.description}>
          Your account has been temporarily suspended due to a violation of our community guidelines or terms of service.
        </Text>

        <View style={styles.reasonCard}>
          <Text style={styles.reasonLabel}>Reason for Suspension:</Text>
          <Text style={styles.reasonText}>{suspensionReason || 'Multiple delivery failures reported by customers.'}</Text>
        </View>

        <TouchableOpacity 
          style={styles.supportButton} 
          onPress={handleContactSupport}
        >
          <Text style={styles.supportButtonText}>Contact Support</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.logoutButton} 
          onPress={logout}
        >
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>

        {/* DEV ONLY MOCK RESOLVE */}
        <TouchableOpacity 
          style={{ marginTop: 20, padding: 10, borderStyle: 'dashed', borderWidth: 1, borderColor: Colors.success, borderRadius: 8 }}
          onPress={() => {
            const { setProfileStatus } = useAuthStore.getState();
            setProfileStatus('READY');
            Alert.alert('Mock Resolved', 'Your account has been restored to READY status.');
          }}
        >
          <Text style={{ color: Colors.success, fontSize: 12, fontWeight: 'bold' }}>[DEV MOCKED] Resolve Suspension</Text>
        </TouchableOpacity>

      </View>
      
      <View style={styles.footer}>
        <Text style={styles.footerText}>Team Vantyrn</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  content: {
    flex: 1,
    padding: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconCircle: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: Colors.warning + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.black,
    marginBottom: 15,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: Colors.subText,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 30,
  },
  reasonCard: {
    width: '100%',
    backgroundColor: Colors.grey,
    padding: 20,
    borderRadius: 16,
    marginBottom: 40,
    borderLeftWidth: 4,
    borderLeftColor: Colors.warning,
  },
  reasonLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: Colors.subText,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  reasonText: {
    fontSize: 16,
    color: Colors.black,
    fontWeight: '600',
    lineHeight: 22,
  },
  supportButton: {
    width: '100%',
    backgroundColor: Colors.primary,
    padding: 18,
    borderRadius: 15,
    alignItems: 'center',
    marginBottom: 15,
    elevation: 2,
  },
  supportButtonText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  logoutButton: {
    padding: 15,
  },
  logoutButtonText: {
    color: Colors.error,
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    paddingBottom: 20,
    alignItems: 'center',
  },
  footerText: {
    color: Colors.border,
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 2,
    textTransform: 'uppercase',
  }
});
