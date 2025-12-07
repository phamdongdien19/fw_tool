import { del, list } from '@vercel/blob';

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'DELETE') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { name, url } = req.query;

        // If URL is provided, delete directly
        if (url) {
            await del(url);
            return res.status(200).json({
                success: true,
                message: `Project deleted successfully (by URL)`
            });
        }

        if (!name) {
            return res.status(400).json({ error: 'Project name or URL is required' });
        }

        // List ALL blobs in projects folder and find the matching one
        const { blobs } = await list({
            prefix: 'projects/',
        });

        // Find blob matching the project name (handle URL encoding)
        const targetBlob = blobs.find(blob => {
            // Extract name from pathname like "projects/Test Fix Project.json"
            const blobName = blob.pathname.replace('projects/', '').replace('.json', '');
            // Also try URL-decoded version
            const decodedBlobName = decodeURIComponent(blobName);
            return blobName === name || decodedBlobName === name;
        });

        if (!targetBlob) {
            console.log('Available blobs:', blobs.map(b => b.pathname));
            console.log('Looking for:', name);
            return res.status(404).json({
                error: 'Project not found',
                projectName: name,
                availableProjects: blobs.map(b => b.pathname)
            });
        }

        // Delete the blob
        await del(targetBlob.url);

        return res.status(200).json({
            success: true,
            message: `Project "${name}" deleted successfully`
        });

    } catch (error) {
        console.error('Delete error:', error);
        return res.status(500).json({
            error: 'Failed to delete project',
            details: error.message
        });
    }
}
