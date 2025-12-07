import { put } from '@vercel/blob';

export const config = {
    api: {
        bodyParser: false, // Disable body parsing, accept raw stream
    },
};

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-vercel-filename');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'PUT') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Get filename from header or query
        const filename = req.headers['x-vercel-filename'] || req.query.filename;

        if (!filename) {
            return res.status(400).json({
                success: false,
                error: 'Filename is required (x-vercel-filename header or filename query param)'
            });
        }

        const blobPath = `projects/${filename}.json`;
        console.log(`[Upload] Uploading to: ${blobPath}`);

        // Stream the request body directly to Vercel Blob
        const blob = await put(blobPath, req, {
            access: 'public',
            contentType: 'application/json',
            addRandomSuffix: false,
        });

        console.log(`[Upload] Success: ${blob.url}`);

        return res.status(200).json({
            success: true,
            message: `Project "${filename}" saved successfully`,
            url: blob.url,
            savedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('[Upload] Error:', error);
        return res.status(500).json({
            success: false,
            error: `Failed to upload: ${error.message}`,
            details: error.message
        });
    }
}
