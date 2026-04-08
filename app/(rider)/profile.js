import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import Colors from '../../constants/Colors';

import { riderApi } from '../../services/riderApi';
import { useAuthStore } from '../../store/authStore';
import { useRiderStore } from '../../store/riderStore';
import { SkeletonLoader } from '../../components/SkeletonLoader';


export default function RiderProfile() {
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);
  const clearRiderStore = useRiderStore((state) => state.clearStore);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const data = await riderApi.getProfile();
      setProfile(data);
    } catch (error) {
      Alert.alert('Error', 'Failed to fetch profile');
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled) {
      handleUpload(result.assets[0].uri);
    }
  };

  const handleUpload = async (uri) => {
    setUploading(true);
    try {
      // In a real app, this would update Cloudflare/S3
      const updatedProfile = { ...profile, photo: uri };
      setProfile(updatedProfile);
      Alert.alert('Success', 'Profile photo updated!');
    } catch (error) {
      Alert.alert('Error', 'Failed to upload photo');
    } finally {
      setUploading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            logout();
            clearRiderStore();
            router.replace('/auth/login');
          }
        }
      ]

    );
  };

  if (loading || !profile) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
           <SkeletonLoader width={100} height={100} style={{ borderRadius: 50, marginBottom: 15 }} />
           <SkeletonLoader width={150} height={22} style={{ marginBottom: 8 }} />
           <SkeletonLoader width={100} height={14} style={{ marginBottom: 4 }} />
        </View>
        <View style={styles.content}>
           <SkeletonLoader width={SCREEN_WIDTH - 32} height={120} style={{ borderRadius: 16, marginBottom: 16 }} />
           <SkeletonLoader width={SCREEN_WIDTH - 32} height={200} style={{ borderRadius: 16 }} />
        </View>
      </View>
    );
  }

  const SCREEN_WIDTH = Dimensions.get('window').width;
  const { width } = Dimensions.get('window');

  return (
    <ScrollView 
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.photoContainer}>
          <Image source={{ uri: profile.photo }} style={styles.photo} />
          <TouchableOpacity style={styles.editPhotoBtn} onPress={pickImage} disabled={uploading}>
            {uploading ? <ActivityIndicator size="small" color={Colors.white} /> : <Ionicons name="camera" size={16} color={Colors.white} />}
          </TouchableOpacity>
        </View>
        <Text style={styles.name}>{profile.fullName}</Text>
        <Text style={styles.email}>{profile.email}</Text>
        <Text style={styles.phone}>{profile.phone}</Text>
      </View>

      <View style={styles.content}>
        {/* Compliance Section */}
        {profile.complianceFlags.length > 0 && (
          <View style={styles.complianceContainer}>
            <Text style={styles.sectionTitle}>Compliance & Quality</Text>
            <View style={styles.flagsList}>
              {profile.complianceFlags.map((flag, idx) => (
                <View key={idx} style={styles.flagChip}>
                  <Ionicons name="warning-outline" size={14} color={Colors.error} />
                  <Text style={styles.flagText}>{flag.replace(/_/g, ' ')}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.complianceSub}>Improve these to maintain a high rating and better rewards.</Text>
          </View>
        )}

        {/* Vehicle Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vehicle Details</Text>
          <View style={styles.infoRow}>
            <View style={styles.infoIcon}>
              <Ionicons name="bicycle" size={20} color={Colors.primary} />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Type</Text>
              <Text style={styles.infoValue}>{profile.vehicleDetails.type}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <View style={styles.infoIcon}>
              <Ionicons name="id-card-outline" size={20} color={Colors.primary} />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Plate Number</Text>
              <Text style={styles.infoValue}>{profile.vehicleDetails.number}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <View style={styles.infoIcon}>
              <Ionicons name="map-outline" size={20} color={Colors.primary} />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Preferred Zone</Text>
              <Text style={styles.infoValue}>{profile.preferredZone}</Text>
            </View>
          </View>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account & KYC</Text>
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/kyc/status')}>
            <View style={styles.menuLeft}>
              <Ionicons name="shield-checkmark-outline" size={22} color={Colors.black} />
              <Text style={styles.menuText}>KYC Verification</Text>
            </View>
            <View style={[styles.badge, styles.badgeSuccess]}>
              <Text style={styles.badgeText}>{profile.kycStatus}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => Alert.alert('Edit Bank Details', 'This feature will be available after KYC re-verification.')}
          >
            <View style={styles.menuLeft}>
              <Ionicons name="card-outline" size={22} color={Colors.black} />
              <Text style={styles.menuText}>Bank Details</Text>
            </View>
            <View style={styles.menuRight}>
              <Text style={styles.maskedVal}>****6789</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.subText} style={{ marginLeft: 5 }} />
            </View>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={Colors.error} />
          <Text style={styles.logoutBtnText}>Sign Out from Partner App</Text>
        </TouchableOpacity>

        {/* DEV ONLY MOCK TOOLS */}
        <View style={styles.devTools}>
          <Text style={styles.devToolsTitle}>[DEV] Security Testing</Text>
          <View style={styles.devToolsGrid}>
            <TouchableOpacity 
              style={[styles.devBtn, { borderColor: Colors.warning }]}
              onPress={() => {
                const { setProfileStatus } = useAuthStore.getState();
                setProfileStatus('SUSPENDED', 'Late delivery complaints and safety violations.');
                Alert.alert('Mock Success', 'Account status set to SUSPENDED. The layout monitor will redirect you shortly.');
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
                Alert.alert('Mock Success', 'Account status set to DISABLED. Permanent block initiated.');
              }}
            >
              <Ionicons name="lock-closed-outline" size={16} color={Colors.error} />
              <Text style={[styles.devBtnText, { color: Colors.error }]}>Mock Disable</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.version}>v1.2.5 (Security Phase)</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grey },
  header: {
    alignItems: 'center', backgroundColor: Colors.white,
    padding: 25, borderBottomLeftRadius: 30, borderBottomRightRadius: 30,
    elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5
  },
  photoContainer: { width: 100, height: 100, marginBottom: 15 },
  photo: { width: '100%', height: '100%', borderRadius: 50 },
  editPhotoBtn: {
    position: 'absolute', right: 0, bottom: 0,
    backgroundColor: Colors.primary, width: 30, height: 30,
    borderRadius: 15, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: Colors.white
  },
  name: { fontSize: 22, fontWeight: 'bold', color: Colors.black },
  email: { fontSize: 14, color: Colors.subText, marginTop: 4 },
  phone: { fontSize: 14, color: Colors.subText, marginTop: 2 },

  content: { padding: 16 },
  complianceContainer: {
    backgroundColor: Colors.white, borderRadius: 16,
    padding: 16, marginBottom: 16, borderLeftWidth: 4, borderLeftColor: Colors.error
  },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.black, marginBottom: 15 },
  flagsList: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  flagChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.error + '10', paddingHorizontal: 12,
    paddingVertical: 6, borderRadius: 20, marginRight: 8, marginBottom: 8
  },
  flagText: { fontSize: 12, color: Colors.error, fontWeight: 'bold', marginLeft: 6 },
  complianceSub: { fontSize: 11, color: Colors.subText },

  section: { backgroundColor: Colors.white, borderRadius: 16, padding: 16, marginBottom: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  infoIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center', alignItems: 'center', marginRight: 12
  },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 11, color: Colors.subText },
  infoValue: { fontSize: 15, fontWeight: 'bold', color: Colors.black },

  menuItem: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1,
    borderBottomColor: Colors.border
  },
  menuLeft: { flexDirection: 'row', alignItems: 'center' },
  menuText: { fontSize: 15, marginLeft: 12, fontWeight: '500' },
  menuRight: { flexDirection: 'row', alignItems: 'center' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeSuccess: { backgroundColor: Colors.success + '20' },
  badgeText: { fontSize: 11, fontWeight: 'bold', color: Colors.success },
  maskedVal: { fontSize: 14, color: Colors.subText },

  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.white, padding: 16, borderRadius: 16,
    marginTop: 10, borderWidth: 1, borderColor: Colors.error + '40'
  },
  logoutBtnText: { color: Colors.error, fontWeight: 'bold', fontSize: 16, marginLeft: 8 },
  version: { textAlign: 'center', color: Colors.subText, marginTop: 25, fontSize: 12, marginBottom: 10 },
  devTools: {
    marginTop: 20,
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  devToolsTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: Colors.subText,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  devToolsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  devBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  devBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    marginLeft: 6,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  devTools: {
    marginTop: 20,
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  devToolsTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: Colors.subText,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  devToolsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  devBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  devBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    marginLeft: 6,
  }
});
