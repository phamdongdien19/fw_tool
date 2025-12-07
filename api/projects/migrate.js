import { list, put, head } from '@vercel/blob';

const PROJECTS_INDEX_PATH = 'projects/_index.json';

/**
 * One-time migration endpoint to rebuild the projects index
 * This uses list() ONCE to scan all existing projects and create the index
 * After running this once, all other operations use head() (Simple Operation)
 * 
 * Call: POST /api/projects/migrate
 */
export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Allow both GET and POST for easy testing
    if (req.method !== 'POST' && req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        console.log('[migrate.js] Starting index rebuild...');

        // Check if index already exists
        let existingIndex = [];
        try {
            const blobInfo = await head(PROJECTS_INDEX_PATH);
            const response = await fetch(blobInfo.url);
            if (response.ok) {
                const data = await response.json();
                existingIndex = data.projects || [];
            }
        } catch (e) {
            // Index doesn't exist, that's fine
        }

        // Use list() ONCE to scan all existing project blobs
        const { blobs } = await list({
            prefix: 'projects/',
        });

        // Filter to only .json files (not the index file)
        const projectBlobs = blobs.filter(blob =>
            blob.pathname.endsWith('.json') &&
            blob.pathname !== PROJECTS_INDEX_PATH &&
            !blob.pathname.includes('_index')
        );

        console.log(`[migrate.js] Found ${projectBlobs.length} project blobs to index`);

        // Build new index from blobs
        const projects = projectBlobs.map(blob => {
            // Extract name from "projects/name.json"
            const name = blob.pathname.replace('projects/', '').replace('.json', '');
            return {
                name: decodeURIComponent(name),
                url: blob.url,
                size: blob.size,
                uploadedAt: blob.uploadedAt
            };
        });

        // Save the new index
        await put(PROJECTS_INDEX_PATH, JSON.stringify({ projects }), {
            access: 'public',
            contentType: 'application/json',
            addRandomSuffix: false,
        });

        console.log(`[migrate.js] Index rebuilt with ${projects.length} projects`);

        return res.status(200).json({
            success: true,
            message: `Index rebuilt successfully`,
            previousCount: existingIndex.length,
            newCount: projects.length,
            projects: projects.map(p => p.name)
        });

    } catch (error) {
        console.error('Migration error:', error);
        return res.status(500).json({
            error: 'Failed to rebuild index',
            details: error.message
        });
    }
}
