const express = require('express');
const router = express.Router();
const firebaseAuth = require('../middleware/auth');
const { generatePresignedUrl } = require('../lib/cloudflare');

/**
 * MODULE: Storage Management
 * Handles secure upload permissions for Cloudflare R2
 */

// GET /api/storage/presigned-url?fileName=logo.png&contentType=image/png
router.get('/presigned-url', firebaseAuth, async (req, res) => {
    try {
        const { fileName, contentType } = req.query;

        if (!fileName || !contentType) {
            return res.status(400).json({ error: 'fileName and contentType are required' });
        }

        // Add a timestamp or UUID to fileName to avoid collisions
        const timestamp = Date.now();
        const uniqueFileName = `${timestamp}_${fileName.replace(/\s+/g, '_')}`;

        console.log(`[STORAGE] Generating presigned URL for: ${uniqueFileName}`);
        
        const { uploadUrl, publicUrl } = await generatePresignedUrl(uniqueFileName, contentType);

        res.json({
            success: true,
            uploadUrl,
            publicUrl
        });

    } catch (error) {
        console.error('[STORAGE] Failed to generate presigned URL:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

module.exports = router;
