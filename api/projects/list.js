import { head, put } from '@vercel/blob';

// Use a cached index file instead of scanning all blobs
// This file is updated by save.js and delete.js
const PROJECTS_INDEX_PATH = 'projects/_index.json';

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
        // Try to get the cached project index using head() (Simple Operation)
        let projects = [];

        try {
            const blobInfo = await head(PROJECTS_INDEX_PATH);
            const url = new URL(blobInfo.url);
            url.searchParams.set('t', Date.now()); // Cache busting
            const response = await fetch(url.toString(), { cache: 'no-store' });

            if (response.ok) {
                const indexData = await response.json();
                projects = indexData.projects || [];
            }
        } catch (headErr) {
            // Index file doesn't exist yet - return empty list
            // The index will be created when first project is saved
            console.log('Projects index not found, returning empty list');
        }

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
