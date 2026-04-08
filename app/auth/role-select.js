import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import Colors from '../../constants/Colors';
import { useAuthStore } from '../../store/authStore';
import apiClient from '../../services/api';


export default function RoleSelectScreen() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);
  const user = useAuthStore((state) => state.user);

  const handleRoleSelection = async (role) => {
    try {
      // Persist role selection to the backend
      const response = await apiClient.post('/api/auth/role', { role });
      
      if (response.data.success) {
        const updatedUser = response.data.user;
        login({ 
          user, 
          role: updatedUser.role, 
          profileStatus: updatedUser.profileStatus, 
          sessionToken: useAuthStore.getState().sessionToken 
        });
      }
    } catch (error) {
      console.warn('Backend role update failed, using local state:', error.message);
      // Fallback to local state for development resilience
      login({ 
        user, 
        role, 
        profileStatus: 'PENDING', 
        sessionToken: useAuthStore.getState().sessionToken 
      });
    }
    
    if (role === 'VENDOR') {
      router.push('/auth/vendor-register');
    } else {
      router.push('/auth/rider-register');
    }
  };


  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>Welcome!</Text>
          <Text style={styles.subtitle}>How would you like to partner with us?</Text>
        </View>

        <TouchableOpacity 
          style={styles.card}
          onPress={() => handleRoleSelection('VENDOR')}
        >
          <View style={styles.cardContent}>
            <View style={styles.iconContainer}>
              <Image 
                source={{ uri: 'https://cdn-icons-png.flaticon.com/512/3081/3081559.png' }} // Vendor icon
                style={styles.icon}
              />
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.cardTitle}>Register as Vendor</Text>
              <Text style={styles.cardDescription}>List your restaurant or store on our platform and grow your business.</Text>
            </View>
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.card}
          onPress={() => handleRoleSelection('RIDER')}
        >
          <View style={styles.cardContent}>
            <View style={[styles.iconContainer, { backgroundColor: '#E3F2FD' }]}>
              <Image 
                source={{ uri: 'https://cdn-icons-png.flaticon.com/512/2830/2830305.png' }} // Delivery icon
                style={[styles.icon, { tintColor: '#2196F3' }]}
              />
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.cardTitle}>Register as Partner</Text>
              <Text style={styles.cardDescription}>Start delivering with us and earn based on your own schedule.</Text>
            </View>
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => useAuthStore.getState().logout()}
        >
          <Text style={styles.backButtonText}>← Change Phone Number</Text>
        </TouchableOpacity>

        <Text style={styles.footerText}>
          You can change your role later by contacting support.
        </Text>
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
    justifyContent: 'center',
    flexGrow: 1,
  },
  header: {
    marginBottom: 40,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: Colors.black,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.subText,
    textAlign: 'center',
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 24,
    padding: 24,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFF0E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 20,
  },
  icon: {
    width: 40,
    height: 40,
    tintColor: Colors.primary,
  },
  textContainer: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.black,
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 13,
    color: Colors.subText,
    lineHeight: 18,
  },
  footerText: {
    marginTop: 40,
    textAlign: 'center',
    color: Colors.subText,
    fontSize: 12,
  },
  backButton: {
    marginTop: 20,
    alignItems: 'center',
    padding: 10,
  },
  backButtonText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: 'bold',
  },
});
