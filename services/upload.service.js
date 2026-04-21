import apiClient from './api';

/**
 * Cloudflare R2 Upload Service
 * Manages direct-to-cloud uploads using secure presigned URLs.
 */

/**
 * Upload an image file directly to Cloudflare R2
 * @param {string} fileUri - Local URI from ImagePicker
 * @param {string} fileName - Original filename
 * @param {string} contentType - MIME type (e.g., 'image/jpeg')
 * @returns {Promise<string>} - The final public URL of the uploaded image
 */
export const uploadToCloudflare = async (fileUri, fileName, contentType = 'image/jpeg') => {
  try {
    console.log(`[STORAGE] Initiating upload for: ${fileName}`);

    // 1. Get Presigned URL from Backend
    const { uploadUrl, publicUrl } = await apiClient.get('/api/storage/presigned-url', {
      params: { fileName, contentType }
    });

    // 2. Fetch the local file as a Blob/ArrayBuffer
    const response = await fetch(fileUri);
    const blob = await response.blob();

    // 3. Upload directly to Cloudflare R2 via PUT
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      body: blob,
      headers: {
        'Content-Type': contentType,
      },
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Cloudflare upload failed: ${uploadResponse.status} ${errorText}`);
    }

    console.log('[STORAGE] Upload successful! Public URL:', publicUrl);
    return publicUrl;

  } catch (error) {
    console.error('[STORAGE-SERVICE] Upload failed:', error);
    throw error;
  }
};
