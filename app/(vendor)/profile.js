import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Image, 
  Switch, 
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import MapView, { Marker } from 'react-native-maps';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import Colors from '../../constants/Colors';

import { vendorApi } from '../../services/vendorApi';
import { useAuthStore } from '../../store/authStore';
import { useVendorStore } from '../../store/vendorStore';
import { SkeletonLoader } from '../../components/SkeletonLoader';


export default function VendorProfile() {
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);
  const clearVendorStore = useVendorStore((state) => state.clearStore);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [uploading, setUploading] = useState(false);
  
  // Edit Modal State
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editForm, setEditForm] = useState({
    businessName: '',
    description: '',
    category: '',
    operatingHours: '',
    ownerName: '',
    email: '',
    phone: ''
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const data = await vendorApi.getProfile();
      setProfile(data);
      // Initialize edit form with current data
      setEditForm({
        businessName: data.businessName,
        description: data.description,
        category: data.category,
        operatingHours: data.operatingHours,
        ownerName: data.ownerName,
        email: data.email,
        phone: data.phone
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to fetch profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDetails = async () => {
    setLoading(true);
    try {
      const updatedProfile = { ...profile, ...editForm };
      await vendorApi.updateProfile(updatedProfile);
      setProfile(updatedProfile);
      setIsEditModalVisible(false);
      Alert.alert('Success', 'Profile updated successfully!');
    } catch (error) {
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async (type) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: type === 'logo' ? [1, 1] : [16, 9],
      quality: 1,
    });

    if (!result.canceled) {
      handleUpload(type, result.assets[0].uri);
    }
  };

  const handleUpload = async (type, uri) => {
    setUploading(true);
    try {
      const uploadResult = await vendorApi.uploadImage(uri);
      const updatedProfile = { ...profile, [type]: uploadResult.url };
      await vendorApi.updateProfile(updatedProfile);
      setProfile(updatedProfile);
      Alert.alert('Success', `${type.charAt(0).toUpperCase() + type.slice(1)} updated successfully!`);
    } catch (error) {
      Alert.alert('Error', 'Failed to upload image');
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
            clearVendorStore();
            router.replace('/auth/login');
          }
        }
      ]
    );
  };

  if (loading || !profile) {
    return (
      <View style={styles.container}>
        <SkeletonLoader width={Dimensions.get('window').width} height={200} style={{ borderBottomLeftRadius: 30, borderBottomRightRadius: 30 }} />
        <View style={{ padding: 16, marginTop: 50 }}>
          <SkeletonLoader width={Dimensions.get('window').width - 32} height={150} style={{ borderRadius: 12, marginBottom: 16 }} />
          <SkeletonLoader width={Dimensions.get('window').width - 32} height={100} style={{ borderRadius: 12, marginBottom: 16 }} />
          <SkeletonLoader width={Dimensions.get('window').width - 32} height={120} style={{ borderRadius: 12 }} />
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 120 }}>
      {/* Banner & Logo */}
      <View style={styles.header}>
        <Image source={{ uri: profile.banner }} style={styles.banner} />
        <TouchableOpacity style={styles.editBannerBtn} onPress={() => pickImage('banner')}>
          <Ionicons name="camera" size={20} color={Colors.white} />
        </TouchableOpacity>
        
        <View style={styles.logoContainer}>
          <Image source={{ uri: profile.logo }} style={styles.logo} />
          <TouchableOpacity style={styles.editLogoBtn} onPress={() => pickImage('logo')}>
            <Ionicons name="camera" size={16} color={Colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.content}>
        {uploading && <ActivityIndicator color={Colors.primary} style={{ marginBottom: 15 }} />}
        
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Business Details</Text>
            <TouchableOpacity onPress={() => setIsEditModalVisible(true)}>
              <Text style={styles.editBtn}>Edit</Text>
            </TouchableOpacity>
          </View>
          
          <Text style={styles.descriptionText}>{profile.description}</Text>
          
          <View style={styles.infoRow}>
            <Ionicons name="business" size={20} color={Colors.subText} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>Business Name</Text>
              <Text style={styles.infoValue}>{profile.businessName}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="pricetag" size={20} color={Colors.subText} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>Category</Text>
              <Text style={styles.infoValue}>{profile.category}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="time" size={20} color={Colors.subText} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>Operating Hours</Text>
              <Text style={styles.infoValue}>{profile.operatingHours}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="person" size={20} color={Colors.subText} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>Owner Name</Text>
              <Text style={styles.infoValue}>{profile.ownerName}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="call" size={20} color={Colors.subText} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>Phone</Text>
              <Text style={styles.infoValue}>{profile.phone}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="mail" size={20} color={Colors.subText} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>{profile.email}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>
          <Text style={styles.addressText}>{profile.location.address}</Text>
          <View style={styles.mapContainer}>
            <MapView
              style={styles.map}
              initialRegion={{
                latitude: profile.location.latitude,
                longitude: profile.location.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
              scrollEnabled={false}
              zoomEnabled={false}
            >
              <Marker coordinate={{ latitude: profile.location.latitude, longitude: profile.location.longitude }} />
            </MapView>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>KYC & Compliance</Text>
          <View style={styles.kycRow}>
            <View style={[styles.badge, styles.badgeApproved]}>
              <Text style={styles.badgeText}>{profile.kycStatus}</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/kyc/status')}>
              <Text style={styles.linkText}>View Details</Text>
            </TouchableOpacity>
          </View>

          {profile.complianceFlags.length > 0 ? (
            <View style={styles.flagsContainer}>
              {profile.complianceFlags.map((flag, idx) => (
                <View key={idx} style={styles.flagChip}>
                  <Ionicons name="warning" size={14} color={Colors.error} />
                  <Text style={styles.flagText}>{flag}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.successText}>No compliance issues found.</Text>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Bank Details</Text>
            <TouchableOpacity>
              <Text style={styles.editBtn}>Update</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="card" size={20} color={Colors.subText} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>{profile.bankDetails.bankName}</Text>
              <Text style={styles.infoValue}>{profile.bankDetails.accountNumber}</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={Colors.error} />
          <Text style={styles.logoutBtnText}>Logout</Text>
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

      {/* Edit Details Modal */}
      <Modal
        visible={isEditModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsEditModalVisible(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Business Details</Text>
              <TouchableOpacity onPress={() => setIsEditModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.black} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Business Name</Text>
                <TextInput
                  style={styles.textInput}
                  value={editForm.businessName}
                  onChangeText={(val) => setEditForm(prev => ({ ...prev, businessName: val }))}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Description</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  value={editForm.description}
                  onChangeText={(val) => setEditForm(prev => ({ ...prev, description: val }))}
                  multiline
                  numberOfLines={4}
                />
              </View>

              <View style={styles.formRow}>
                <View style={[styles.formGroup, { flex: 1, marginRight: 8 }]}>
                  <Text style={styles.inputLabel}>Category</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editForm.category}
                    onChangeText={(val) => setEditForm(prev => ({ ...prev, category: val }))}
                  />
                </View>
                <View style={[styles.formGroup, { flex: 1, marginLeft: 8 }]}>
                  <Text style={styles.inputLabel}>Hours</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editForm.operatingHours}
                    onChangeText={(val) => setEditForm(prev => ({ ...prev, operatingHours: val }))}
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Owner Name</Text>
                <TextInput
                  style={styles.textInput}
                  value={editForm.ownerName}
                  onChangeText={(val) => setEditForm(prev => ({ ...prev, ownerName: val }))}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput
                  style={styles.textInput}
                  value={editForm.email}
                  onChangeText={(val) => setEditForm(prev => ({ ...prev, email: val }))}
                  keyboardType="email-address"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Phone</Text>
                <TextInput
                  style={styles.textInput}
                  value={editForm.phone}
                  onChangeText={(val) => setEditForm(prev => ({ ...prev, phone: val }))}
                  keyboardType="phone-pad"
                />
              </View>

              <TouchableOpacity 
                style={[styles.saveButton, loading && styles.disabledButton]} 
                onPress={handleSaveDetails}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.saveButtonText}>Save Changes</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.white
  },
  container: {
    flex: 1, backgroundColor: Colors.grey
  },
  header: {
    height: 200, backgroundColor: Colors.border
  },
  banner: {
    width: '100%', height: '100%'
  },
  logoContainer: {
    position: 'absolute', bottom: -40, left: 20,
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.white, padding: 4,
    elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }
  },
  logo: {
    width: '100%', height: '100%', borderRadius: 36
  },
  editLogoBtn: {
    position: 'absolute', right: 0, bottom: 0,
    backgroundColor: Colors.primary, width: 24, height: 24,
    borderRadius: 12, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: Colors.white
  },
  content: {
    padding: 16, paddingTop: 50
  },
  section: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 16, marginBottom: 16,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }
  },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12
  },
  sectionTitle: {
    fontSize: 18, fontWeight: 'bold', color: Colors.black
  },
  editBtn: {
    color: Colors.primary, fontWeight: '600'
  },
  descriptionText: {
    fontSize: 14, color: Colors.text, marginBottom: 15, fontStyle: 'italic'
  },
  editBannerBtn: {
    position: 'absolute', top: 20, right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)', width: 40, height: 40,
    borderRadius: 20, justifyContent: 'center', alignItems: 'center'
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 12
  },
  infoText: {
    marginLeft: 12
  },
  infoLabel: {
    fontSize: 12, color: Colors.subText
  },
  infoValue: {
    fontSize: 16, color: Colors.black, fontWeight: '500'
  },
  addressText: {
    fontSize: 14, color: Colors.text, marginBottom: 8
  },
  mapContainer: {
    height: 150, borderRadius: 8, overflow: 'hidden', marginTop: 8
  },
  map: {
    flex: 1
  },
  kycRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8
  },
  badge: {
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12
  },
  badgeApproved: {
    backgroundColor: Colors.success + '20'
  },
  badgeText: {
    fontSize: 12, fontWeight: 'bold'
  },
  linkText: {
    color: Colors.primary, fontSize: 14, fontWeight: '600'
  },
  flagsContainer: {
    marginTop: 12
  },
  flagChip: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.error + '10',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, alignSelf: 'flex-start'
  },
  flagText: {
    marginLeft: 6, color: Colors.error, fontSize: 12, fontWeight: '500'
  },
  successText: {
    fontSize: 14, color: Colors.success, marginTop: 12
  },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: 16, backgroundColor: Colors.white, borderRadius: 12,
    marginTop: 8, marginBottom: 40, borderWidth: 1, borderColor: Colors.error + '40'
  },
  logoutBtnText: {
    marginLeft: 8, color: Colors.error, fontSize: 16, fontWeight: 'bold'
  },
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

  // Modal Styles
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, height: '80%'
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20
  },
  modalTitle: {
    fontSize: 20, fontWeight: 'bold', color: Colors.black
  },
  formGroup: {
    marginBottom: 16
  },
  formRow: {
    flexDirection: 'row'
  },
  inputLabel: {
    fontSize: 14, color: Colors.subText, marginBottom: 6
  },
  textInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 8,
    padding: 12, fontSize: 16, color: Colors.black, backgroundColor: Colors.grey
  },
  textArea: {
    height: 80, textAlignVertical: 'top'
  },
  saveButton: {
    backgroundColor: Colors.primary, padding: 16, borderRadius: 12,
    alignItems: 'center', marginTop: 20, marginBottom: 20
  },
  saveButtonText: {
    color: Colors.white, fontSize: 16, fontWeight: 'bold'
  },
  disabledButton: {
    opacity: 0.6
  }
});
