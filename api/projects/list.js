import { list } from '@vercel/blob';

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // List all project blobs
        const { blobs } = await list({
            prefix: 'projects/',
        });

        // Extract project names from blob paths
        const projects = blobs
            .filter(blob => blob.pathname.endsWith('.json'))
            .map(blob => {
                // Extract name from "projects/name.json"
                const name = blob.pathname.replace('projects/', '').replace('.json', '');
                return {
                    name,
                    url: blob.url,
                    size: blob.size,
                    uploadedAt: blob.uploadedAt
                };
            });

        return res.status(200).json({
            success: true,
            projects,
            count: projects.length
        });

    } catch (error) {
        console.error('List error:', error);
        return res.status(500).json({
            error: 'Failed to list projects',
            details: error.message
        });
    }
}
