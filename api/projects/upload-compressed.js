import { put } from '@vercel/blob';
import { gunzipSync } from 'zlib';

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb', // Compressed data should be much smaller
        },
    },
};

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Original-Size');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const filename = req.query.filename;

        if (!filename) {
            return res.status(400).json({
                success: false,
                error: 'Filename is required'
            });
        }

        // Get compressed data from request body
        // req.body should be a Buffer when bodyParser is configured
        let compressedData;

        if (Buffer.isBuffer(req.body)) {
            compressedData = req.body;
        } else if (typeof req.body === 'string') {
            compressedData = Buffer.from(req.body, 'binary');
        } else {
            // Read raw body
            const chunks = [];
            for await (const chunk of req) {
                chunks.push(chunk);
            }
            compressedData = Buffer.concat(chunks);
        }

        console.log(`[UploadCompressed] Received ${compressedData.length} bytes compressed for "${filename}"`);

        // Decompress gzip data
        const decompressedData = gunzipSync(compressedData);
        const jsonString = decompressedData.toString('utf-8');

        console.log(`[UploadCompressed] Decompressed to ${decompressedData.length} bytes`);

        // Parse and validate JSON
        const projectData = JSON.parse(jsonString);

        // Ensure it has the expected structure
        if (!projectData.projectName) {
            projectData.projectName = filename;
        }

        // Re-stringify to ensure clean JSON
        const cleanJson = JSON.stringify(projectData);

        // Upload to Vercel Blob
        const blobPath = `projects/${filename}.json`;
        const blob = await put(blobPath, cleanJson, {
            access: 'public',
            contentType: 'application/json',
            addRandomSuffix: false,
        });

        console.log(`[UploadCompressed] Saved to: ${blob.url}`);

        return res.status(200).json({
            success: true,
            message: `Project "${filename}" saved successfully`,
            url: blob.url,
            savedAt: new Date().toISOString(),
            originalSize: decompressedData.length,
            compressedSize: compressedData.length
        });

    } catch (error) {
        console.error('[UploadCompressed] Error:', error);
        return res.status(500).json({
            success: false,
            error: `Failed to upload: ${error.message}`,
            details: error.message
        });
    }
}
