import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Colors from '../../constants/Colors';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../../store/authStore';
import { vendorApi } from '../../services/vendorApi';

export default function KYCUpload() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const router = useRouter();
  const { docId, title } = useLocalSearchParams();

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled) {
        setFile(result.assets[0]);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to pick a document');
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Camera permission is required to take a photo.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled) {
        const asset = result.assets[0];
        setFile({
          uri: asset.uri,
          name: `photo_${Date.now()}.jpg`,
          size: asset.fileSize || 0,
          mimeType: 'image/jpeg',
        });
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to take a photo');
    }
  };

  const handlePickOptions = () => {
    Alert.alert(
      'Select Document',
      'Choose how you want to upload your document',
      [
        { text: 'Take Photo', onPress: takePhoto },
        { text: 'Choose from Files', onPress: pickDocument },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const uploadFile = async () => {
     if (!file) {
      Alert.alert('Error', 'Please select a file first');
      return;
    }
    setUploading(true);
    
    try {
      console.log('[KYC] Starting real upload to Cloudflare R2:', file.name);
      
      const uploadResult = await vendorApi.uploadImage(file.uri);
      
      if (!uploadResult.success) {
        throw new Error('Upload failed');
      }
      
      // Save to store
      useAuthStore.getState().setKycDoc(docId, {
        name: file.name,
        url: uploadResult.url,
        status: 'SUCCESS'
      });

      Alert.alert('Success', 'Document uploaded successfully', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (err) {
      console.error('[KYC] Upload Error:', err);
      Alert.alert(
        'Upload Failed', 
        'Failed to upload the document. Please check your connection and try again.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Retry', onPress: uploadFile }
        ]
      );
    }
 finally {
      setUploading(false);
    }

  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>Upload a clear photo or PDF of your document</Text>
        </View>

        <View style={styles.uploadArea}>
          {file ? (
            <View style={styles.filePreview}>
              <View style={styles.fileIconLarge}>
                <Text style={styles.fileTypeText}>{file.name.split('.').pop().toUpperCase()}</Text>
              </View>
              <Text style={styles.fileName}>{file.name}</Text>
              <Text style={styles.fileSize}>{(file.size / (1024 * 1024)).toFixed(2)} MB</Text>
              <TouchableOpacity onPress={() => setFile(null)} style={styles.removeButton}>
                <Text style={styles.removeButtonText}>Remove & Choose Another</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.pickButton} onPress={handlePickOptions}>
              <View style={styles.iconContainer}>
                <Image 
                  source={{ uri: 'https://cdn-icons-png.flaticon.com/512/109/109612.png' }} 
                  style={styles.icon} 
                />
              </View>
              <Text style={styles.pickText}>Choose File / Take Photo</Text>
              <Text style={styles.helperText}>PDF, JPG, or PNG (Max 5MB)</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity 
          style={[styles.uploadButton, (!file || uploading) && styles.disabledButton]} 
          onPress={uploadFile}
          disabled={!file || uploading}
        >
          {uploading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.uploadButtonText}>Confirm & Upload</Text>
          )}
        </TouchableOpacity>
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
  },
  header: {
    marginBottom: 40,
  },
  backButton: {
    marginBottom: 16,
  },
  backButtonText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: 'bold',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.black,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.subText,
  },
  uploadArea: {
    aspectRatio: 1.5,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 16,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.grey,
    marginBottom: 40,
    padding: 20,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  icon: {
    width: 24,
    height: 24,
    tintColor: Colors.primary,
  },
  pickText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.black,
    marginBottom: 4,
  },
  helperText: {
    fontSize: 12,
    color: Colors.subText,
  },
  filePreview: {
    alignItems: 'center',
    width: '100%',
  },
  fileIconLarge: {
    width: 60,
    height: 70,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  fileTypeText: {
    color: Colors.white,
    fontWeight: 'bold',
    fontSize: 14,
  },
  fileName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.black,
    textAlign: 'center',
    marginBottom: 4,
  },
  fileSize: {
    fontSize: 12,
    color: Colors.subText,
    marginBottom: 16,
  },
  removeButton: {
    padding: 8,
  },
  removeButtonText: {
    color: Colors.error,
    fontWeight: 'bold',
  },
  uploadButton: {
    backgroundColor: Colors.primary,
    height: 56,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadButtonText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  disabledButton: {
    backgroundColor: Colors.border,
  },
});
