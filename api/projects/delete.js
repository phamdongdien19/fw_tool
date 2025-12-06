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
        const { name } = req.query;

        if (!name) {
            return res.status(400).json({ error: 'Project name is required' });
        }

        // Find the blob first
        const { blobs } = await list({
            prefix: `projects/${name}.json`,
        });

        if (blobs.length === 0) {
            return res.status(404).json({
                error: 'Project not found',
                projectName: name
            });
        }

        // Delete the blob
        await del(blobs[0].url);

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
