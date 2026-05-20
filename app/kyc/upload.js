import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Colors from '../../constants/Colors';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../../store/authStore';
import { vendorApi } from '../../services/vendorApi';

// ─── Constants ───────────────────────────────────────────────────────────────
const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'pdf'];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const getFileExtension = (filename = '') => filename.split('.').pop().toLowerCase();

const validateFile = (file) => {
  if (!file) return 'No file selected.';

  // Extension check
  const ext = getFileExtension(file.name);
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `Invalid file type ".${ext}". Only JPG, PNG, or PDF files are allowed.`;
  }

  // MIME type check (if available)
  if (file.mimeType && !ALLOWED_MIME_TYPES.includes(file.mimeType.toLowerCase())) {
    return `Invalid file type. Only JPG, PNG, or PDF files are allowed.`;
  }

  // Size check
  if (file.size && file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return `File is too large (${sizeMB} MB). Maximum allowed size is ${MAX_FILE_SIZE_MB} MB.`;
  }

  return null; // null = valid
};

// ─── Component ───────────────────────────────────────────────────────────────
export default function KYCUpload() {
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const router = useRouter();
  const { docId, title } = useLocalSearchParams();

  const applyFile = (pickedFile) => {
    const error = validateFile(pickedFile);
    if (error) {
      setFileError(error);
      setFile(null);
      Alert.alert('Invalid Document', error);
      return;
    }
    setFileError(null);
    setFile(pickedFile);
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        applyFile(result.assets[0]);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to pick a document. Please try again.');
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
        quality: 0.85,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const photoFile = {
          uri: asset.uri,
          name: `photo_${Date.now()}.jpg`,
          size: asset.fileSize || 0,
          mimeType: 'image/jpeg',
        };
        applyFile(photoFile);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to take a photo. Please try again.');
    }
  };

  const handlePickOptions = () => {
    Alert.alert(
      'Select Document',
      `Accepted: JPG, PNG, PDF  ·  Max size: ${MAX_FILE_SIZE_MB} MB`,
      [
        { text: '📷 Take Photo', onPress: takePhoto },
        { text: '📁 Choose from Files', onPress: pickDocument },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const uploadFile = async () => {
    if (!file) {
      Alert.alert('No File', 'Please select a document first.');
      return;
    }

    // Re-validate before upload as a safety net
    const error = validateFile(file);
    if (error) {
      setFileError(error);
      Alert.alert('Invalid Document', error);
      return;
    }

    setUploading(true);
    try {
      console.log('[KYC] Fetching profile for deterministic key...');
      const profileData = await vendorApi.getProfile();
      if (!profileData?.id) {
        throw new Error('Could not identify vendor ID. Please try again.');
      }

      const extension = getFileExtension(file.name);
      const deterministicKey = `kyc/${profileData.id}/${docId}.${extension}`;

      console.log('[KYC] Starting deterministic upload to R2:', deterministicKey);

      const uploadResult = await vendorApi.uploadImage(file.uri, {
        key: deterministicKey,
        isDeterministic: true,
      });

      if (!uploadResult.success) {
        throw new Error('Upload was not successful. Please try again.');
      }

      // Save to auth store
      useAuthStore.getState().setKycDoc(docId, {
        name: file.name,
        url: uploadResult.url,
        status: 'SUCCESS',
      });

      Alert.alert('✅ Uploaded', `${title} has been uploaded successfully.`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err) {
      console.error('[KYC] Upload Error:', err);
      Alert.alert(
        'Upload Failed',
        err.message || 'Failed to upload the document. Please check your connection and try again.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Retry', onPress: uploadFile },
        ]
      );
    } finally {
      setUploading(false);
    }
  };

  const fileSizeMB = file?.size ? (file.size / (1024 * 1024)).toFixed(2) : null;
  const isFileTooLarge = file?.size > MAX_FILE_SIZE_BYTES;

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

        {/* ── File Requirements Banner ──────────────────────────────── */}
        <View style={styles.requirementsBanner}>
          <Text style={styles.requirementsTitle}>📋 Document Requirements</Text>
          <Text style={styles.requirementItem}>• Accepted formats: JPG, PNG, PDF</Text>
          <Text style={styles.requirementItem}>• Maximum file size: {MAX_FILE_SIZE_MB} MB</Text>
          <Text style={styles.requirementItem}>• Document must be clearly visible & legible</Text>
          <Text style={styles.requirementItem}>• Ensure no part is cut off or blurred</Text>
        </View>

        {/* ── Upload Area ───────────────────────────────────────────── */}
        <View style={[styles.uploadArea, fileError && styles.uploadAreaError]}>
          {file ? (
            <View style={styles.filePreview}>
              <View style={[styles.fileIconLarge, isFileTooLarge && { backgroundColor: Colors.error }]}>
                <Text style={styles.fileTypeText}>{getFileExtension(file.name).toUpperCase()}</Text>
              </View>
              <Text style={styles.fileName} numberOfLines={2}>{file.name}</Text>
              {fileSizeMB && (
                <Text style={[styles.fileSize, isFileTooLarge && { color: Colors.error, fontWeight: 'bold' }]}>
                  {fileSizeMB} MB {isFileTooLarge ? `(Exceeds ${MAX_FILE_SIZE_MB} MB limit ⚠️)` : '✓'}
                </Text>
              )}
              <TouchableOpacity onPress={() => { setFile(null); setFileError(null); }} style={styles.removeButton}>
                <Text style={styles.removeButtonText}>✕ Remove & Choose Another</Text>
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
              <Text style={styles.helperText}>PDF, JPG, or PNG · Max {MAX_FILE_SIZE_MB} MB</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Inline File Error ─────────────────────────────────────── */}
        {fileError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerIcon}>⚠️</Text>
            <Text style={styles.errorBannerText}>{fileError}</Text>
          </View>
        )}

        {/* ── Upload Button ─────────────────────────────────────────── */}
        <TouchableOpacity
          style={[
            styles.uploadButton,
            (!file || uploading || !!fileError || isFileTooLarge) && styles.disabledButton,
          ]}
          onPress={uploadFile}
          disabled={!file || uploading || !!fileError || isFileTooLarge}
        >
          {uploading ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ActivityIndicator color="white" style={{ marginRight: 8 }} />
              <Text style={styles.uploadButtonText}>Uploading...</Text>
            </View>
          ) : (
            <Text style={styles.uploadButtonText}>✓ Confirm & Upload</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.securityNote}>
          🔒 Your documents are encrypted and stored securely. They are only visible to our compliance team.
        </Text>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  scrollContainer: {
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
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
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.subText,
  },
  requirementsBanner: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  requirementsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: 6,
  },
  requirementItem: {
    fontSize: 12,
    color: '#374151',
    marginBottom: 3,
    lineHeight: 18,
  },
  uploadArea: {
    aspectRatio: 1.5,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 16,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    marginBottom: 12,
    padding: 20,
  },
  uploadAreaError: {
    borderColor: Colors.error,
    backgroundColor: '#FFF5F5',
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
  pickButton: {
    alignItems: 'center',
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
    fontSize: 15,
    fontWeight: 'bold',
    color: Colors.black,
    textAlign: 'center',
    marginBottom: 4,
    paddingHorizontal: 12,
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
    fontSize: 13,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorBannerIcon: {
    fontSize: 14,
    marginRight: 8,
    marginTop: 1,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#991B1B',
    lineHeight: 18,
    fontWeight: '500',
  },
  uploadButton: {
    backgroundColor: Colors.primary,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  uploadButtonText: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: 'bold',
  },
  disabledButton: {
    backgroundColor: '#D1D5DB',
  },
  securityNote: {
    fontSize: 12,
    color: Colors.subText,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },
});
