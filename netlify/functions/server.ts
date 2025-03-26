import { Context } from '@netlify/functions'
import { processInternalLinks, readSitemap } from '../../src/app/api/process/interLink.js'

export default async function handler(req: Request, context: Context) {
  try {
    // Only accept POST requests
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }

    // Verify content type
    const contentType = req.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return new Response(JSON.stringify({ error: 'Content-Type must be application/json' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }

    // Parse request body
    const { content, sitemapUrl } = await req.json();
    
    if (!content || !sitemapUrl) {
      console.log('Missing required fields', { content: !!content, sitemapUrl: !!sitemapUrl });
      return new Response(JSON.stringify({ error: 'Content and sitemap URL are required' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }

    console.log('Processing content with:', { sitemapUrl, contentLength: content.length });
    
    // Read sitemap
    console.log('Reading sitemap...');
    const sitemapData = await readSitemap(sitemapUrl);
    if (!sitemapData) {
      throw new Error('Failed to read sitemap data');
    }
    console.log('Sitemap read successfully, URL count:', sitemapData?.size || 0);

    // Process content
    const result = await processInternalLinks(content, sitemapData);
    console.log('Content processed successfully');
    
    return new Response(JSON.stringify({ result }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error: any) {
    console.error('Processing error:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    return new Response(JSON.stringify({ 
      error: error.message || 'Error processing content',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}
