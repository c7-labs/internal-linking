/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import {processInternalLinks, readSitemap} from './interLink.js';

export const maxDuration = 300; // Set max duration to 300 seconds (5 minutes)
export const dynamic = 'force-dynamic'; // Disable static optimization

export async function POST(request: Request) {
  try { 
    const { content, sitemapUrl } = await request.json();
    
    if (!content || !sitemapUrl) {
      return NextResponse.json(
        { error: 'Content and sitemap URL are required' },
        { status: 400 }
      );
    }

    console.log('Step 1: Starting to process content with:', { sitemapUrl, contentLength: content.length });
    
    // First test if we can read the sitemap
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
      
      return NextResponse.json({ result }, { status: 200 });
    } catch (error: any) {
      console.error('API Error:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      
      return NextResponse.json(
        { 
          error: error.message || 'Error processing content',
          details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Request parsing error:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    return NextResponse.json(
      { 
        error: 'Invalid request format',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 400 }
    );
  }
}
