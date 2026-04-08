import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/authStore';
import Colors from '../constants/Colors';
import { Stack } from 'expo-router';

export default function AccountDisabled() {
  const { logout } = useAuthStore();

  const handlePolicyLink = () => {
    Linking.openURL('https://vantyrn.com/terms');
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons name="lock-closed" size={70} color={Colors.error} />
        </View>
        
        <Text style={styles.title}>Account Disabled</Text>
        <Text style={styles.description}>
          This account has been permanently disabled due to severe or repeated violations of our platform policies. 
        </Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            For security reasons, this account can no longer access the Vantyrn network. Any pending balances or active disputes will be handled via legal communication.
          </Text>
        </View>

        <TouchableOpacity 
          style={styles.policyButton} 
          onPress={handlePolicyLink}
        >
          <Text style={styles.policyButtonText}>View Platform Policies</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.logoutButton} 
          onPress={logout}
        >
          <Text style={styles.logoutButtonText}>Logout & Dispose Session</Text>
        </TouchableOpacity>

        {/* DEV ONLY MOCK RESTORE */}
        <TouchableOpacity 
          style={{ marginTop: 20, padding: 10, borderStyle: 'dashed', borderWidth: 1, borderColor: Colors.success, borderRadius: 8, opacity: 0.5 }}
          onPress={() => {
            const { setProfileStatus } = useAuthStore.getState();
            setProfileStatus('READY');
            // No Alert.alert as it might be hard to see on this dark theme, but the layout will react
          }}
        >
          <Text style={{ color: Colors.success, fontSize: 10, fontWeight: 'bold' }}>[DEV MOCKED] Restore Account</Text>
        </TouchableOpacity>

      </View>
      
      <View style={styles.footer}>
        <Text style={styles.footerStatus}>TERMINATED</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A', // Deep dark theme for "Disabled"
  },
  content: {
    flex: 1,
    padding: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
    borderWidth: 1,
    borderColor: 'rgba(255, 68, 68, 0.2)',
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: Colors.white,
    marginBottom: 20,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  description: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 40,
  },
  infoBox: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 25,
    borderRadius: 20,
    marginBottom: 50,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  infoText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 20,
    fontStyle: 'italic',
  },
  policyButton: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  policyButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  logoutButton: {
    padding: 15,
  },
  logoutButtonText: {
    color: Colors.error,
    fontSize: 16,
    fontWeight: 'bold',
  },
  footer: {
    paddingBottom: 30,
    alignItems: 'center',
  },
  footerStatus: {
    color: 'rgba(255, 68, 68, 0.5)',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 5,
  }
});
