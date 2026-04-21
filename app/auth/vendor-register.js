import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert, Modal, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import Colors from '../../constants/Colors';
import * as Location from 'expo-location';
import { useAuthStore } from '../../store/authStore';
import DateTimePicker from '@react-native-community/datetimepicker';
import MapModal from '../../components/MapModal';

const CATEGORIES = ['Food', 'Grocery', 'Pharmacy', 'Other'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function VendorRegisterScreen() {
  const { user } = useAuthStore();
  const [formData, setFormData] = useState({
    businessName: '',
    ownerName: '',
    phone: user?.phoneNumber || '',
    email: user?.email || '',
    address: '',
    category: 'Food',
    description: '',
    location: null,
    operatingHours: DAYS.reduce((acc, day) => ({
      ...acc,
      [day]: { isClosed: false, open: '09:00', close: '22:00' }
    }), {}),
  });
  
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showHoursModal, setShowHoursModal] = useState(false);
  const [activeDay, setActiveDay] = useState(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timeMode, setTimeMode] = useState('open'); // 'open' or 'close'
  const [mapVisible, setMapVisible] = useState(false);

  const router = useRouter();

  const handleInputChange = (name, value) => {
    setFormData({ ...formData, [name]: value });
  };

  const handlePinLocation = async () => {
    setLoadingLocation(true);
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission denied', 'Allow access to location to pin your store');
      setLoadingLocation(false);
      return;
    }

    let location = await Location.getCurrentPositionAsync({});
    setFormData({ 
      ...formData, 
      location: {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      }
    });
    setLoadingLocation(false);
    setMapVisible(true);
  };

  const onConfirmLocation = (coords) => {
    setFormData({ ...formData, location: coords });
    setMapVisible(false);
    Alert.alert('Location Pinned', 'Map coordinates saved successfully!');
  };

  const handleTimeChange = (event, selectedDate) => {
    setShowTimePicker(false);
    if (selectedDate && activeDay) {
      const hours = selectedDate.getHours().toString().padStart(2, '0');
      const minutes = selectedDate.getMinutes().toString().padStart(2, '0');
      const timeString = `${hours}:${minutes}`;
      
      setFormData({
        ...formData,
        operatingHours: {
          ...formData.operatingHours,
          [activeDay]: {
            ...formData.operatingHours[activeDay],
            [timeMode]: timeString
          }
        }
      });
    }
  };

  const handleNext = () => {
    if (!formData.businessName || !formData.ownerName || !formData.address || !formData.location) {
      Alert.alert('Required Fields', 'Business Name, Owner Name, Address, and Location Pin are mandatory.');
      return;
    }
    
    // Save to global state instead of URL params to avoid data loss due to string limits
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
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Business Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Tasty Bites"
                value={formData.businessName}
                onChangeText={(text) => handleInputChange('businessName', text)}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Owner Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="Full Name"
                value={formData.ownerName}
                onChangeText={(text) => handleInputChange('ownerName', text)}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.label}>Phone (Locked)</Text>
                <TextInput
                  style={[styles.input, styles.disabledInput]}
                  value={formData.phone}
                  editable={false}
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
                style={styles.input}
                placeholder="email@example.com"
                keyboardType="email-address"
                value={formData.email}
                onChangeText={(text) => handleInputChange('email', text)}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Business Address *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Full Address"
                multiline
                numberOfLines={3}
                value={formData.address}
                onChangeText={(text) => handleInputChange('address', text)}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Store Location *</Text>
              <TouchableOpacity 
                style={[styles.locationButton, formData.location && styles.locationPined]}
                onPress={handlePinLocation}
                disabled={loadingLocation}
              >
                <Text style={[styles.locationButtonText, formData.location && styles.locationPinedText]}>
                  {loadingLocation ? 'Getting Location...' : formData.location ? 'Location Pinned ✓' : 'Pin my location'}
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
                useAuthStore.getState().setRole(null);
                router.replace('/auth/role-select');
              }}
            >
              <Text style={styles.backButtonText}>← Change Role</Text>
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
                <View key={day} style={styles.dayRow}>
                  <Text style={styles.dayName}>{day}</Text>
                  <View style={styles.timeControls}>
                    <TouchableOpacity 
                      onPress={() => { setActiveDay(day); setTimeMode('open'); setShowTimePicker(true); }}
                      style={styles.timeBox}
                    >
                      <Text style={styles.timeText}>{formData.operatingHours[day].open}</Text>
                    </TouchableOpacity>
                    <Text style={styles.timeSeparator}>-</Text>
                    <TouchableOpacity 
                      onPress={() => { setActiveDay(day); setTimeMode('close'); setShowTimePicker(true); }}
                      style={styles.timeBox}
                    >
                      <Text style={styles.timeText}>{formData.operatingHours[day].close}</Text>
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
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    height: 50,
    fontSize: 16,
    color: Colors.black,
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
