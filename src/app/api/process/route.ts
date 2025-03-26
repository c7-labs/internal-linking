/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import {processInternalLinks, readSitemap} from './interLink.js';

export const maxDuration = 300; // Set max duration to 300 seconds (5 minutes)
export const dynamic = 'force-dynamic'; // Disable static optimization

// Add timeout to fetch operations
const fetchWithTimeout = async (url: string, timeout = 30000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};

export async function POST(request: Request) {
  console.log('API Route: Starting POST request processing');
  try { 
    const contentType = request.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return new NextResponse(
        JSON.stringify({ error: 'Content-Type must be application/json' }),
        { 
          status: 400,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    }

    const body = await request.json();
    const { content, sitemapUrl } = body;
    
    if (!content || !sitemapUrl) {
      console.log('API Route: Missing required fields', { content: !!content, sitemapUrl: !!sitemapUrl });
      return new NextResponse(
        JSON.stringify({ error: 'Content and sitemap URL are required' }),
        { 
          status: 400,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    }

    console.log('Step 1: Starting to process content with:', { sitemapUrl, contentLength: content.length });
    
    // First test if we can read the sitemap with timeout
    console.log('Step 2: Testing sitemap access...');
    try {
      const sitemapData = await readSitemap(sitemapUrl);
      if (!sitemapData) {
        throw new Error('Failed to read sitemap data');
      }
      console.log('Step 3: Sitemap read successfully, URL count:', sitemapData?.size || 0);

      // Process the content with internal links using the sitemap data
      const result = await processInternalLinks(content, sitemapData);
      console.log('Step 4: Content processed successfully');
      
      return new NextResponse(
        JSON.stringify({ result }),
        { 
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    } catch (error: any) {
      console.error('API Error:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      
      return new NextResponse(
        JSON.stringify({ 
          error: error.message || 'Error processing content',
          details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }),
        { 
          status: 500,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    }
  } catch (error: any) {
    console.error('Request parsing error:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    return new NextResponse(
      JSON.stringify({ error: 'Invalid request format' }),
      { 
        status: 400,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
}
