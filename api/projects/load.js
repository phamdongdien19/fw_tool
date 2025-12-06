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
        const { name } = req.query;

        if (!name) {
            return res.status(400).json({ error: 'Project name is required' });
        }

        // List blobs to find the project
        const { blobs } = await list({
            prefix: `projects/${name}.json`,
        });

        if (blobs.length === 0) {
            return res.status(404).json({
                error: 'Project not found',
                projectName: name
            });
        }

        // Fetch the blob content
        const blobUrl = blobs[0].url;
        const response = await fetch(blobUrl);

        if (!response.ok) {
            throw new Error('Failed to fetch project data');
        }

        const projectData = await response.json();

        return res.status(200).json({
            success: true,
            project: projectData
        });

    } catch (error) {
        console.error('Load error:', error);
        return res.status(500).json({
            error: 'Failed to load project',
            details: error.message
        });
    }
}
