/**
 * CORS Proxy API for fetching external URLs
 * Handles CSV/Excel file downloads from external sources
 */

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Get URL from query or body
        const url = req.query.url || req.body?.url;

        if (!url) {
            return res.status(400).json({ error: 'URL parameter is required' });
        }

        // Validate URL
        let parsedUrl;
        try {
            parsedUrl = new URL(url);
        } catch {
            return res.status(400).json({ error: 'Invalid URL format' });
        }

        // Fetch the file
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'FW-Tools/1.0',
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({
                error: `Failed to fetch: ${response.statusText}`,
                status: response.status
            });
        }

        // Get content type
        const contentType = response.headers.get('content-type') || 'application/octet-stream';

        // Reject HTML responses (common error page pattern)
        if (contentType.includes('text/html')) {
            return res.status(400).json({
                success: false,
                error: 'URL returned HTML instead of data file. Please check the URL is a direct download link.',
                contentType
            });
        }

        // For binary files (Excel), return as base64
        if (contentType.includes('spreadsheet') ||
            contentType.includes('excel') ||
            contentType.includes('octet-stream') ||
            url.endsWith('.xlsx') || url.endsWith('.xls')) {

            const buffer = await response.arrayBuffer();
            const base64 = Buffer.from(buffer).toString('base64');

            return res.status(200).json({
                success: true,
                contentType,
                encoding: 'base64',
                data: base64,
                filename: parsedUrl.pathname.split('/').pop()
            });
        }

        // For text files (CSV), return as text
        const text = await response.text();

        // Additional check: if text looks like HTML, reject it
        if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html') || text.trim().startsWith('<HTML')) {
            return res.status(400).json({
                success: false,
                error: 'Response appears to be HTML, not a data file. Please verify the URL.',
                contentType
            });
        }

        return res.status(200).json({
            success: true,
            contentType,
            encoding: 'text',
            data: text,
            filename: parsedUrl.pathname.split('/').pop()
        });

    } catch (error) {
        console.error('Proxy error:', error);
        return res.status(500).json({
            error: 'Proxy failed',
            details: error.message
        });
    }
}
