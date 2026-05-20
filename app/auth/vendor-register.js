import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert, Modal, FlatList, ActivityIndicator, Image } from 'react-native';
import { useRouter } from 'expo-router';
import Colors from '../../constants/Colors';
import * as Location from 'expo-location';
import { useAuthStore } from '../../store/authStore';
import DateTimePicker from '@react-native-community/datetimepicker';
import MapModal from '../../components/MapModal';
import * as ImagePicker from 'expo-image-picker';
import { vendorApi } from '../../services/vendorApi';
import { Ionicons } from '@expo/vector-icons';

const CATEGORIES = ['Food', 'Grocery', 'Pharmacy', 'Other'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ─── Validation Rules ────────────────────────────────────────────────────────
const FIELD_VALIDATORS = {
  businessName: (v) => {
    if (!v.trim()) return 'Business name is required.';
    if (v.trim().length < 3) return 'Business name must be at least 3 characters.';
    if (v.trim().length > 100) return 'Business name must be 100 characters or fewer.';
    if (!/^[a-zA-Z0-9\s&'.,()|\-]+$/.test(v)) return 'Business name contains invalid characters.';
    return null;
  },
  ownerName: (v) => {
    if (!v.trim()) return 'Owner name is required.';
    if (v.trim().length < 3) return 'Owner name must be at least 3 characters.';
    if (!/^[a-zA-Z\s.]+$/.test(v)) return 'Owner name must contain letters only (no numbers or symbols).';
    return null;
  },
  email: (v) => {
    if (!v.trim()) return null; // Email might be pre-filled from auth
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Please enter a valid email address.';
    return null;
  },
  address: (v) => {
    if (!v.trim()) return 'Business address is required.';
    if (v.trim().length < 10) return 'Please enter a more complete address (minimum 10 characters).';
    return null;
  },
};

// Convert HH:MM string to total minutes for comparison
const timeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
};

// Validate operating hours for a single day
const validateDayHours = (open, close) => {
  if (timeToMinutes(close) <= timeToMinutes(open)) {
    return `Closing time must be after opening time.`;
  }
  return null;
};

// Inline error component
const FieldError = ({ message }) => {
  if (!message) return null;
  return <Text style={fieldErrorStyle}>⚠ {message}</Text>;
};
const fieldErrorStyle = { fontSize: 12, color: '#DC2626', marginTop: 4, fontWeight: '500' };

const formatTo12Hour = (timeStr) => {
  if (!timeStr) return '';
  const [hoursStr, minutesStr] = timeStr.split(':');
  let hours = parseInt(hoursStr, 10);
  const minutes = minutesStr;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  return `${hours.toString().padStart(2, '0')}:${minutes} ${ampm}`;
};

export default function VendorRegisterScreen() {
  const { user } = useAuthStore();
  const [formData, setFormData] = useState({
    businessName: '',
    ownerName: '',
    phone: user?.phoneNumber || '+91',
    email: user?.email || '',
    address: '',
    category: 'Food',
    description: '',
    location: null,
    logo: '',
    operatingHours: DAYS.reduce((acc, day) => ({
      ...acc,
      [day]: { isClosed: false, open: '09:00', close: '22:00' }
    }), {}),
  });

  // Track which fields the user has interacted with
  const [touched, setTouched] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [hoursErrors, setHoursErrors] = useState({});

  useEffect(() => {
    if (user?.phoneNumber) {
      setFormData(prev => ({ ...prev, phone: user.phoneNumber }));
    }
    if (user?.email) {
      setFormData(prev => ({ ...prev, email: user.email }));
    }
  }, [user]);

  // Validate a single named field and update errors state
  const validateField = (name, value) => {
    if (!FIELD_VALIDATORS[name]) return;
    const err = FIELD_VALIDATORS[name](value);
    setFieldErrors(prev => ({ ...prev, [name]: err || undefined }));
  };

  // Mark field touched and validate on blur
  const handleBlur = (name) => {
    setTouched(prev => ({ ...prev, [name]: true }));
    validateField(name, formData[name] || '');
  };

  // Determine input border style based on validation state
  const inputStyle = (name) => [
    styles.input,
    touched[name] && fieldErrors[name] ? styles.inputError : null,
    touched[name] && !fieldErrors[name] && formData[name] ? styles.inputValid : null,
  ];

  // Validate all hours and return true if valid
  const validateAllHours = () => {
    const newHoursErrors = {};
    DAYS.forEach(day => {
      const { open, close, isClosed } = formData.operatingHours[day];
      if (!isClosed) {
        const err = validateDayHours(open, close);
        if (err) newHoursErrors[day] = err;
      }
    });
    setHoursErrors(newHoursErrors);
    return Object.keys(newHoursErrors).length === 0;
  };

  const [uploadingLogo, setUploadingLogo] = useState(false);

  const pickAndUploadLogo = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Media library permission is required to upload a logo.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled) {
        const asset = result.assets[0];
        setUploadingLogo(true);
        console.log('[LOGO-UPLOAD] Picked image, starting upload...', asset.uri);

        const uid = user?.uid || 'temp-vendor';
        const extension = asset.uri.split('.').pop().toLowerCase();
        const logoKey = `logos/${uid}_logo.${extension}`;

        const uploadResult = await vendorApi.uploadImage(asset.uri, {
          key: logoKey,
          isDeterministic: true
        });

        if (uploadResult.success) {
          console.log('[LOGO-UPLOAD] Success, URL:', uploadResult.url);
          setFormData(prev => ({ ...prev, logo: uploadResult.url }));
          Alert.alert('Success', 'Store logo uploaded successfully!');
        } else {
          throw new Error('Upload was not successful');
        }
      }
    } catch (err) {
      console.error('[LOGO-UPLOAD] Error:', err);
      Alert.alert('Upload Failed', 'Failed to upload the logo. Please try again.');
    } finally {
      setUploadingLogo(false);
    }
  };
  
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showHoursModal, setShowHoursModal] = useState(false);
  const [activeDay, setActiveDay] = useState(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timeMode, setTimeMode] = useState('open'); // 'open' or 'close'
  const [mapVisible, setMapVisible] = useState(false);
 
  const router = useRouter();
 
  const handleInputChange = (name, value) => {
    if (name === 'phone') {
      let cleaned = value;
      if (!cleaned.startsWith('+91')) {
        const digits = cleaned.replace(/\D/g, '');
        if (digits.startsWith('91')) {
          cleaned = '+' + digits;
        } else {
          cleaned = '+91' + digits;
        }
      } else {
        const afterPrefix = cleaned.substring(3);
        const digitsAfter = afterPrefix.replace(/\D/g, '');
        cleaned = '+91' + digitsAfter;
      }
      if (cleaned.length > 13) {
        cleaned = cleaned.substring(0, 13);
      }
      setFormData({ ...formData, phone: cleaned });
    } else {
      setFormData({ ...formData, [name]: value });
      // Real-time validation on change (only if already touched)
      if (touched[name] && FIELD_VALIDATORS[name]) {
        const err = FIELD_VALIDATORS[name](value);
        setFieldErrors(prev => ({ ...prev, [name]: err || undefined }));
      }
    }
  };
 
  const handlePinLocation = () => {
    setMapVisible(true);
  };
 
  const onConfirmLocation = (coords) => {
    setFormData(prev => ({
      ...prev,
      location: {
        latitude: coords.latitude,
        longitude: coords.longitude,
      },
      address: coords.address || prev.address
    }));
    setMapVisible(false);
    Alert.alert('Location Pinned', 'Map coordinates saved successfully!');
  };
 
  const handleTimeChange = (event, selectedDate) => {
    setShowTimePicker(false);
    if (selectedDate && activeDay) {
      const hours = selectedDate.getHours().toString().padStart(2, '0');
      const minutes = selectedDate.getMinutes().toString().padStart(2, '0');
      const timeString = `${hours}:${minutes}`;

      const updatedDay = {
        ...formData.operatingHours[activeDay],
        [timeMode]: timeString,
      };

      // Validate the updated open/close for this day immediately
      const openTime  = timeMode === 'open'  ? timeString : updatedDay.open;
      const closeTime = timeMode === 'close' ? timeString : updatedDay.close;
      const hoursErr  = validateDayHours(openTime, closeTime);
      setHoursErrors(prev => ({ ...prev, [activeDay]: hoursErr || undefined }));

      setFormData({
        ...formData,
        operatingHours: {
          ...formData.operatingHours,
          [activeDay]: updatedDay,
        },
      });
    }
  };
 
  const handleNext = () => {
    // Touch all validated fields to surface errors
    const allTouched = { businessName: true, ownerName: true, email: true, address: true };
    setTouched(allTouched);

    // Run all field validations
    const newErrors = {};
    Object.keys(FIELD_VALIDATORS).forEach(key => {
      const err = FIELD_VALIDATORS[key](formData[key] || '');
      if (err) newErrors[key] = err;
    });
    setFieldErrors(newErrors);

    // Validate operating hours
    const hoursValid = validateAllHours();

    if (Object.keys(newErrors).length > 0) {
      const firstError = Object.values(newErrors)[0];
      Alert.alert('Please Fix Errors', firstError);
      return;
    }

    if (!formData.phone || formData.phone.length !== 13) {
      Alert.alert('Invalid Phone Number', 'Please enter a valid 10-digit phone number after +91.');
      return;
    }

    if (!formData.location) {
      Alert.alert('Location Required', 'Please pin your store location on the map.');
      return;
    }

    if (!hoursValid) {
      Alert.alert('Invalid Operating Hours', 'One or more days have closing time set before opening time. Please fix the highlighted days.');
      return;
    }

    if (formData.category === 'Food' && !formData.logo) {
      Alert.alert('Logo Required', 'As a Food category vendor, uploading a store logo is mandatory.');
      return;
    }

    // Save to global state
    useAuthStore.getState().setVendorRegistrationData(formData);
    router.push('/auth/vendor-bank');
  };
 
  return (
    <View style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>Vendor Details</Text>
            <Text style={styles.subtitle}>Help us set up your store</Text>
          </View>
 
          <View style={styles.form}>
            {/* Logo Upload Section */}
            <View style={styles.logoUploadSection}>
              <Text style={styles.label}>Vendor Logo {formData.category === 'Food' && <Text style={styles.required}>*</Text>}</Text>
              <TouchableOpacity 
                style={[styles.logoUploader, formData.logo && styles.logoUploaded]} 
                onPress={pickAndUploadLogo}
                disabled={uploadingLogo}
              >
                {uploadingLogo ? (
                  <View style={styles.uploaderPlaceholder}>
                    <ActivityIndicator size="small" color={Colors.primary} />
                    <Text style={styles.uploaderText}>Uploading Logo...</Text>
                  </View>
                ) : formData.logo ? (
                  <View style={styles.logoPreviewContainer}>
                    <Image source={{ uri: formData.logo }} style={styles.logoImage} />
                    <View style={styles.changeBadge}>
                      <Ionicons name="camera" size={14} color="white" />
                      <Text style={styles.changeBadgeText}>Change</Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.uploaderPlaceholder}>
                    <Ionicons name="cloud-upload" size={28} color={Colors.primary} />
                    <Text style={styles.uploaderText}>Upload Store Logo</Text>
                    <Text style={styles.uploaderSubtext}>Square image, max 5MB</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Business Name <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={inputStyle('businessName')}
                placeholder="e.g. Tasty Bites"
                value={formData.businessName}
                onChangeText={(text) => handleInputChange('businessName', text)}
                onBlur={() => handleBlur('businessName')}
              />
              <FieldError message={touched.businessName && fieldErrors.businessName} />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Owner Name <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={inputStyle('ownerName')}
                placeholder="Full name (letters only)"
                value={formData.ownerName}
                onChangeText={(text) => handleInputChange('ownerName', text)}
                onBlur={() => handleBlur('ownerName')}
              />
              <FieldError message={touched.ownerName && fieldErrors.ownerName} />
            </View>
 
            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.label}>Phone Number *</Text>
                <TextInput
                  style={[styles.input, user?.phoneNumber ? { backgroundColor: '#F0F0F0', color: '#888' } : {}]}
                  placeholder="e.g. +919999999999"
                  keyboardType="phone-pad"
                  value={formData.phone}
                  editable={!user?.phoneNumber}
                  onChangeText={(text) => handleInputChange('phone', text)}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Category *</Text>
                <TouchableOpacity 
                  style={styles.selectorInput} 
                  onPress={() => setShowCategoryModal(true)}
                >
                  <Text style={styles.selectorText}>{formData.category}</Text>
                  <Text style={styles.dropdownIcon}>▼</Text>
                </TouchableOpacity>
              </View>
            </View>


            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={[styles.input, formData.email ? { backgroundColor: '#F0F0F0', color: '#888' } : {}]}
                placeholder="email@example.com"
                keyboardType="email-address"
                value={formData.email}
                editable={!formData.email}
                onChangeText={(text) => handleInputChange('email', text)}
                onBlur={() => handleBlur('email')}
              />
              <FieldError message={touched.email && fieldErrors.email} />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Business Address <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={[inputStyle('address'), styles.textArea]}
                placeholder="Full address (minimum 10 characters)"
                multiline
                numberOfLines={3}
                value={formData.address}
                onChangeText={(text) => handleInputChange('address', text)}
                onBlur={() => handleBlur('address')}
              />
              <FieldError message={touched.address && fieldErrors.address} />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Store Location *</Text>
              <TouchableOpacity 
                style={[styles.locationButton, formData.location && styles.locationPined]}
                onPress={handlePinLocation}
                disabled={loadingLocation}
              >
                <Text style={[styles.locationButtonText, formData.location && styles.locationPinedText]}>
                  {loadingLocation ? 'Getting Location...' : formData.location ? `Pinned: ${formData.location.latitude.toFixed(4)}, ${formData.location.longitude.toFixed(4)}` : 'Pin my location'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Map Selection Modal */}
            <MapModal 
              visible={mapVisible}
              onClose={() => setMapVisible(false)}
              onConfirm={onConfirmLocation}
              initialLocation={formData.location}
            />

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Operating Hours *</Text>
              <TouchableOpacity 
                style={styles.selectorInput} 
                onPress={() => setShowHoursModal(true)}
              >
                <Text style={styles.selectorText}>Configure Weekly Schedule</Text>
                <Text style={styles.dropdownIcon}>🗓️</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Store Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Tell us about your store, specialties, etc."
                multiline
                numberOfLines={3}
                value={formData.description}
                onChangeText={(text) => handleInputChange('description', text)}
              />
            </View>

            <TouchableOpacity 
              style={styles.nextButton}
              onPress={handleNext}
            >
              <Text style={styles.nextButtonText}>Next</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.backButton}
              onPress={() => {
                Alert.alert(
                  'Cancel Registration',
                  'Are you sure you want to go back to the login screen? Your progress will be lost.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { 
                      text: 'Go Back', 
                      style: 'destructive', 
                      onPress: async () => {
                        await useAuthStore.getState().logout();
                        router.replace('/auth/login');
                      } 
                    }
                  ]
                );
              }}
            >
              <Text style={styles.backButtonText}>← Back to Login</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Category Modal */}
      <Modal visible={showCategoryModal} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Category</Text>
            {CATEGORIES.map(cat => (
              <TouchableOpacity 
                key={cat} 
                style={styles.modalItem}
                onPress={() => { handleInputChange('category', cat); setShowCategoryModal(false); }}
              >
                <Text style={styles.modalItemText}>{cat}</Text>
                {formData.category === cat && <Text style={styles.checkIcon}>✓</Text>}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.closeButton} onPress={() => setShowCategoryModal(false)}>
              <Text style={styles.closeButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Operating Hours Modal */}
      <Modal visible={showHoursModal} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={[styles.modalContent, { maxHeight: '80%' }]}>
            <Text style={styles.modalTitle}>Weekly Operating Hours</Text>
            <ScrollView>
              {DAYS.map(day => (
                <View key={day}>
                  <View style={[styles.dayRow, hoursErrors[day] && styles.dayRowError]}>
                    <Text style={[styles.dayName, hoursErrors[day] && { color: Colors.error }]}>{day}</Text>
                    <View style={styles.timeControls}>
                      <TouchableOpacity
                        onPress={() => { setActiveDay(day); setTimeMode('open'); setShowTimePicker(true); }}
                        style={styles.timeBox}
                      >
                        <Text style={styles.timeText}>{formatTo12Hour(formData.operatingHours[day].open)}</Text>
                      </TouchableOpacity>
                      <Text style={styles.timeSeparator}>–</Text>
                      <TouchableOpacity
                        onPress={() => { setActiveDay(day); setTimeMode('close'); setShowTimePicker(true); }}
                        style={[styles.timeBox, hoursErrors[day] && { borderColor: Colors.error, backgroundColor: '#FFF5F5' }]}
                      >
                        <Text style={[styles.timeText, hoursErrors[day] && { color: Colors.error }]}>
                          {formatTo12Hour(formData.operatingHours[day].close)}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  {hoursErrors[day] && (
                    <Text style={{ fontSize: 11, color: Colors.error, marginBottom: 6, marginLeft: 4 }}>
                      ⚠ {hoursErrors[day]}
                    </Text>
                  )}
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
          is24Hour={false}
          display="default"
          onChange={handleTimeChange}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  logoUploadSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoUploader: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    overflow: 'hidden',
  },
  logoUploaded: {
    borderStyle: 'solid',
    borderColor: Colors.success,
  },
  uploaderPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  uploaderText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: Colors.black,
    marginTop: 6,
  },
  uploaderSubtext: {
    fontSize: 10,
    color: Colors.subText,
    marginTop: 2,
  },
  logoPreviewContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  logoImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  changeBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  changeBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  required: {
    color: Colors.error,
  },
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
  row: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.black,
    marginBottom: 8,
  },
  required: {
    color: Colors.error,
  },
  input: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    height: 50,
    fontSize: 16,
    color: Colors.black,
    backgroundColor: '#FAFAFA',
  },
  inputError: {
    borderColor: Colors.error,
    backgroundColor: '#FFF5F5',
  },
  inputValid: {
    borderColor: Colors.success,
    backgroundColor: '#F0FFF4',
  },
  disabledInput: {
    backgroundColor: Colors.grey,
    color: Colors.darkGrey,
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
    backgroundColor: 'white',
  },
  selectorText: {
    fontSize: 16,
    color: Colors.black,
  },
  dropdownIcon: {
    fontSize: 12,
    color: Colors.darkGrey,
  },
  textArea: {
    height: 100,
    paddingVertical: 12,
    textAlignVertical: 'top',
  },
  locationButton: {
    height: 50,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderStyle: 'dashed',
  },
  locationButtonText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  locationPined: {
    borderColor: Colors.success,
    backgroundColor: '#E8F5E9',
    borderStyle: 'solid',
  },
  locationPinedText: {
    color: Colors.success,
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
  backButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 40,
  },
  backButtonText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalItem: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalItemText: {
    fontSize: 16,
    color: Colors.black,
  },
  checkIcon: {
    color: Colors.primary,
    fontWeight: 'bold',
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
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  dayRowError: {
    backgroundColor: '#FFF5F5',
    borderRadius: 6,
    paddingHorizontal: 4,
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
  }
});
