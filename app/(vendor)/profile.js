import React, { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';

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
  Dimensions,
  Linking
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import MapView, { Marker } from 'react-native-maps';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import Colors from '../../constants/Colors';

import { vendorApi } from '../../services/vendorApi';
import { useAuthStore } from '../../store/authStore';
import { useVendorStore } from '../../store/vendorStore';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import MapModal from '../../components/MapModal';

const { width } = Dimensions.get('window');
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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
    phone: '',
    deliveryRadius: ''
  });
  
  const [isBankModalVisible, setIsBankModalVisible] = useState(false);
  const [bankForm, setBankForm] = useState({
    holderName: '',
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    upiId: ''
  });

  const [showHoursModal, setShowHoursModal] = useState(false);
  const [activeDay, setActiveDay] = useState(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timeMode, setTimeMode] = useState('open'); // 'open' or 'close'

  const [isMapModalVisible, setIsMapModalVisible] = useState(false);

  const [errorStatus, setErrorStatus] = useState(null);
  
  useFocusEffect(
    useCallback(() => {
      fetchProfile();
    }, [])
  );


  const fetchProfile = async () => {
    try {
      setErrorStatus(null);
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
        phone: data.phone,
        deliveryRadius: data.deliveryRadius?.toString() || '0'
      });
      if (data.bankDetails) {
        setBankForm({
          holderName: data.bankDetails.holderName || '',
          bankName: data.bankDetails.bankName || '',
          accountNumber: '', // Keep empty for security when editing
          ifscCode: data.bankDetails.ifscCode || '',
          upiId: data.bankDetails.upiId || ''
        });
      }
    } catch (error) {
      console.error('[PROFILE] Fetch Error:', error);
      setErrorStatus(error?.response?.status || 500);
      Alert.alert('Sync Error', 'We couldn\'t fetch your latest profile data.');
    } finally {
      setLoading(false);
    }
  };





  const handleSaveDetails = async () => {
    setLoading(true);
    try {
      const updatedProfile = { ...profile, ...editForm };
      const res = await vendorApi.updateProfile(updatedProfile);
      if (res.success && res.vendor) {
        setProfile(res.vendor);
        // Sync editForm with new data (important for operating hours etc)
        setEditForm({
          businessName: res.vendor.businessName,
          description: res.vendor.description,
          category: res.vendor.category,
          deliveryRadius: res.vendor.deliveryRadius.toString(),
          operatingHours: res.vendor.operatingHours
        });
      } else {
        setProfile(updatedProfile);
      }
      setIsEditModalVisible(false);
      Alert.alert('Success', 'Profile updated successfully!');
    } catch (error) {
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBank = async () => {
    if (!bankForm.accountNumber || !bankForm.holderName) {
      Alert.alert('Error', 'Account number and holder name are required to update bank details.');
      return;
    }
    setLoading(true);
    try {
      await vendorApi.updateProfile({ 
        ...profile, 
        bankData: bankForm 
      });
      await fetchProfile(); // Refresh
      setIsBankModalVisible(false);
      Alert.alert('Success', 'Bank details updated successfully!');
    } catch (error) {
      Alert.alert('Error', 'Failed to update bank details');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmLocation = async (coords) => {
    setLoading(true);
    try {
      const updatedProfile = { 
        ...profile, 
        location: {
          ...profile.location,
          latitude: coords.latitude,
          longitude: coords.longitude
        }
      };
      await vendorApi.updateProfile(updatedProfile);
      setProfile(updatedProfile);
      setIsMapModalVisible(false);
      Alert.alert('Success', 'Store location updated successfully!');
    } catch (error) {
      Alert.alert('Error', 'Failed to update location');
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
      const res = await vendorApi.updateProfile(updatedProfile);
      if (res.success && res.vendor) {
        setProfile(res.vendor);
      } else {
        setProfile(updatedProfile);
      }
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

  const handleTimeChange = (event, selectedDate) => {
    setShowTimePicker(false);
    if (selectedDate && activeDay) {
      const hours = selectedDate.getHours().toString().padStart(2, '0');
      const minutes = selectedDate.getMinutes().toString().padStart(2, '0');
      const timeString = `${hours}:${minutes}`;
      
      setEditForm(prev => ({
        ...prev,
        operatingHours: {
          ...prev.operatingHours,
          [activeDay]: {
            ...prev.operatingHours[activeDay],
            [timeMode]: timeString
          }
        }
      }));
    }
  };

  const renderValue = (val) => {
    if (!val) return 'Not set';
    if (typeof val === 'string' && val.trim() === '') return 'Not set';
    if (typeof val === 'string') return val;
    if (typeof val === 'object') {
      // If it's the operating hours object, format it simply
      if (val.Monday) {
        const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
        const todayHours = val[today];
        if (todayHours) {
          return `${today}: ${todayHours.isClosed ? 'Closed' : `${todayHours.open} - ${todayHours.close}`}`;
        }
        return 'Schedule Configured';
      }
      return JSON.stringify(val);
    }
    return String(val);
  };

  if (!loading && errorStatus) {

    return (
      <View style={styles.center}>
        <Ionicons name="cloud-offline-outline" size={64} color={Colors.error} />
        <Text style={{ marginTop: 16, fontSize: 18, fontWeight: 'bold' }}>Error loading profile</Text>
        <Text style={{ marginTop: 8, color: Colors.subText }}>Check your connection and try again.</Text>
        <TouchableOpacity style={styles.saveButton} onPress={fetchProfile}>
          <Text style={styles.saveButtonText}>Retry Sync</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
        
        {/* Performance Overview */}
        <View style={styles.performanceGrid}>
          <View style={styles.perfCard}>
            <View style={styles.perfIconBox}>
              <Ionicons name="star" size={24} color="#FFD700" />
            </View>
            <Text style={styles.perfValue}>
              {profile.ratingsSummary?.avgRating ? Number(profile.ratingsSummary.avgRating).toFixed(1) : '0.0'}
            </Text>
            <Text style={styles.perfLabel}>Avg Rating</Text>
          </View>

          <TouchableOpacity 
            style={styles.perfCard}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/reviews');
            }}
          >
            <View style={styles.perfIconBox}>
              <Ionicons name="chatbubbles" size={24} color={Colors.primary} />
            </View>
            <Text style={styles.perfValue}>
              {profile.ratingsSummary?.totalReviews || 0}
            </Text>
            <Text style={styles.perfLabel}>Total Reviews</Text>
          </TouchableOpacity>
        </View>

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
              <Text style={styles.infoValue}>{renderValue(profile.operatingHours)}</Text>
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
              <Text style={styles.infoValue}>{profile.email || 'Not Set'}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="bicycle" size={20} color={Colors.subText} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>Delivery Radius</Text>
              <Text style={styles.infoValue}>{profile.deliveryRadius} km</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Location</Text>
            <TouchableOpacity onPress={() => setIsMapModalVisible(true)}>
              <Text style={styles.editBtn}>Edit Pin</Text>
            </TouchableOpacity>
          </View>
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

        <MapModal 
          visible={isMapModalVisible}
          onClose={() => setIsMapModalVisible(false)}
          onConfirm={handleConfirmLocation}
          initialLocation={{
            latitude: profile.location.latitude,
            longitude: profile.location.longitude
          }}
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Platform Commission Model</Text>
          <Text style={styles.sectionSubtitle}>
            {profile.commissionModel 
              ? 'Your commission model is assigned by the administration.' 
              : 'No commission model has been assigned to your account yet. Please contact support.'}
          </Text>
          
          <View 
            style={[
              styles.commissionCard, 
              profile.commissionModel === 'ADD_ON' && styles.commissionCardActive,
              { opacity: profile.commissionModel === 'ADD_ON' ? 1 : 0.6 }
            ]}
          >
            <View style={[styles.radio, profile.commissionModel === 'ADD_ON' && styles.radioActive]}>
              {profile.commissionModel === 'ADD_ON' && <View style={styles.radioInner} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.commissionTitle}>Add-on Model</Text>
              <Text style={styles.commissionDesc}>5% is added on top of your price. Customers pay more, you receive your full price.</Text>
            </View>
          </View>
 
          <View 
            style={[
              styles.commissionCard, 
              profile.commissionModel === 'DEDUCTED' && styles.commissionCardActive,
              { opacity: profile.commissionModel === 'DEDUCTED' ? 1 : 0.6 }
            ]}
          >
            <View style={[styles.radio, profile.commissionModel === 'DEDUCTED' && styles.radioActive]}>
              {profile.commissionModel === 'DEDUCTED' && <View style={styles.radioInner} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.commissionTitle}>Deducted Model</Text>
              <Text style={styles.commissionDesc}>5% is deducted from your price. Customers pay your price, platform takes a cut.</Text>
            </View>
          </View>
          
          {profile.commissionModel && (
            <View style={styles.lockedNote}>
              <Ionicons name="lock-closed" size={14} color={Colors.subText} />
              <Text style={styles.lockedNoteText}>Contact support to change this model</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>KYC & Compliance</Text>
          <View style={styles.kycRow}>
            <View style={[styles.badge, styles.badgeApproved]}>
              <Text style={styles.badgeText}>{profile.kycStatus}</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/kyc/home')}>
              <Text style={styles.linkText}>Update Docs</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.sectionSubtitle}>Identification documents and business licenses.</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Bank Details</Text>
            <TouchableOpacity onPress={() => setIsBankModalVisible(true)}>
              <Text style={styles.editBtn}>Update</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="card" size={20} color={Colors.subText} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>{profile.bankDetails?.bankName || 'No Bank Linked'}</Text>
              <Text style={styles.infoValue}>
                {profile.bankDetails?.accountNumber 
                  ? `**** **** ${profile.bankDetails.accountNumber.slice(-4)}` 
                  : 'Not Set'}
              </Text>
            </View>
          </View>
          <Text style={styles.sectionSubtitle}>Account numbers are masked for your security.</Text>
        </View>



        <TouchableOpacity 
          style={[styles.logoutBtn, { borderColor: Colors.primary + '40', marginBottom: 12 }]} 
          onPress={async () => {
            const message = `Hello Foodie Support, I am Vendor: ${profile.businessName}. I need assistance.`;
            const whatsappUrl = `whatsapp://send?phone=919063851105&text=${encodeURIComponent(message)}`;
            const browserUrl = `https://wa.me/919063851105?text=${encodeURIComponent(message)}`;
            
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              // Try the native app first
              const supported = await Linking.canOpenURL(whatsappUrl);
              if (supported) {
                await Linking.openURL(whatsappUrl);
              } else {
                // Fallback to browser link which handles everything
                await Linking.openURL(browserUrl);
              }
            } catch (err) {
              // Final fallback to browser link if everything else fails
              try {
                await Linking.openURL(browserUrl);
              } catch (finalErr) {
                Alert.alert('Error', 'Could not open WhatsApp or Browser.');
              }
            }
          }}
        >
          <Ionicons name="logo-whatsapp" size={20} color={Colors.primary} />
          <Text style={[styles.logoutBtnText, { color: Colors.primary }]}>Contact Support</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={Colors.error} />
          <Text style={styles.logoutBtnText}>Logout</Text>
        </TouchableOpacity>


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
                  <Text style={styles.inputLabel}>Operating Hours</Text>
                  <TouchableOpacity 
                    style={styles.selectorInput} 
                    onPress={() => setShowHoursModal(true)}
                  >
                    <Text style={styles.selectorText} numberOfLines={1}>
                      {editForm.operatingHours?.Monday ? 'Edit Weekly Schedule' : 'Set Hours'}
                    </Text>
                    <Ionicons name="time-outline" size={16} color={Colors.darkGrey} />
                  </TouchableOpacity>
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

              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Delivery Radius (km)</Text>
                <TextInput
                  style={styles.textInput}
                  value={editForm.deliveryRadius}
                  onChangeText={(val) => setEditForm(prev => ({ ...prev, deliveryRadius: val }))}
                  keyboardType="numeric"
                  placeholder="e.g. 5"
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

      {/* Edit Bank Details Modal */}
      <Modal
        visible={isBankModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsBankModalVisible(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Update Bank Details</Text>
              <TouchableOpacity onPress={() => setIsBankModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.black} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Account Holder Name</Text>
                <TextInput
                  style={styles.textInput}
                  value={bankForm.holderName}
                  onChangeText={(val) => setBankForm(prev => ({ ...prev, holderName: val }))}
                  placeholder="Full Name"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Bank Name</Text>
                <TextInput
                  style={styles.textInput}
                  value={bankForm.bankName}
                  onChangeText={(val) => setBankForm(prev => ({ ...prev, bankName: val }))}
                  placeholder="e.g. HDFC"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Account Number</Text>
                <TextInput
                  style={styles.textInput}
                  value={bankForm.accountNumber}
                  onChangeText={(val) => setBankForm(prev => ({ ...prev, accountNumber: val }))}
                  placeholder="Enter New Account Number"
                  keyboardType="number-pad"
                  secureTextEntry={true}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>IFSC Code</Text>
                <TextInput
                  style={styles.textInput}
                  value={bankForm.ifscCode}
                  onChangeText={(val) => setBankForm(prev => ({ ...prev, ifscCode: val }))}
                  placeholder="IFSC Code"
                  autoCapitalize="characters"
                />
              </View>

              <TouchableOpacity 
                style={[styles.saveButton, loading && styles.disabledButton]} 
                onPress={handleSaveBank}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.saveButtonText}>Update Bank Details</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Operating Hours Modal */}
      <Modal visible={showHoursModal} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={[styles.modalContent, { maxHeight: '80%' }]}>
            <Text style={styles.modalTitle}>Weekly Operating Hours</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {DAYS.map(day => (
                <View key={day} style={styles.dayRow}>
                  <Text style={styles.dayName}>{day}</Text>
                  <View style={styles.timeControls}>
                    <TouchableOpacity 
                      onPress={() => { setActiveDay(day); setTimeMode('open'); setShowTimePicker(true); }}
                      style={styles.timeBox}
                    >
                      <Text style={styles.timeText}>{editForm.operatingHours?.[day]?.open || '09:00'}</Text>
                    </TouchableOpacity>
                    <Text style={styles.timeSeparator}>-</Text>
                    <TouchableOpacity 
                      onPress={() => { setActiveDay(day); setTimeMode('close'); setShowTimePicker(true); }}
                      style={styles.timeBox}
                    >
                      <Text style={styles.timeText}>{editForm.operatingHours?.[day]?.close || '22:00'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={[styles.closeButton, { backgroundColor: Colors.primary }]} onPress={() => setShowHoursModal(false)}>
              <Text style={[styles.closeButtonText, { color: 'white' }]}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {showTimePicker && (
        <DateTimePicker
          value={new Date()}
          mode="time"
          is24Hour={true}
          display="default"
          onChange={handleTimeChange}
        />
      )}
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
  performanceGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    marginTop: 10,
  },
  perfCard: {
    backgroundColor: Colors.white,
    width: '48%',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  perfIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.grey,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  perfValue: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.black,
  },
  perfLabel: {
    fontSize: 12,
    color: Colors.subText,
    marginTop: 2,
    fontWeight: '600',
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
  sectionSubtitle: {
    fontSize: 14,
    color: Colors.subText,
    marginBottom: 20,
    marginTop: -8,
  },
  commissionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    backgroundColor: Colors.grey,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  commissionCardActive: {
    backgroundColor: Colors.white,
    borderColor: Colors.primary,
    elevation: 4,
    shadowColor: Colors.primary,
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.subText,
    marginRight: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioActive: {
    borderColor: Colors.primary,
  },
  radioInner: {
    width: 12, height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },
  commissionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.black,
    marginBottom: 4,
  },
  commissionDesc: {
    fontSize: 13,
    color: Colors.subText,
    lineHeight: 18,
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
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  dayName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.black,
    width: 100,
  },
  timeControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeBox: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: Colors.grey,
  },
  timeText: {
    fontSize: 14,
    color: Colors.black,
  },
  timeSeparator: {
    marginHorizontal: 8,
    color: Colors.darkGrey,
  },
  closeButton: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: Colors.grey,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.black,
  },
  selectorInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.grey,
  },
  selectorText: {
    fontSize: 14,
    color: Colors.black,
  },
  lockedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  lockedNoteText: {
    fontSize: 12,
    color: Colors.subText,
    marginLeft: 6,
    fontStyle: 'italic',
  }
});
