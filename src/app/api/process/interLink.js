const axios = require('axios');
const xml2js = require('xml2js');
const natural = require('natural');

const tokenizer = new natural.WordTokenizer();
const stemmer = natural.PorterStemmer;

// Cache for stemmed words to improve performance
const stemCache = new Map();
function cachedStem(word) {
    if (stemCache.has(word)) {
        return stemCache.get(word);
    }
    const stemmed = stemmer.stem(word);
    stemCache.set(word, stemmed);
    return stemmed;
}


async function fetchAndParseSitemap(sitemapUrl) {
    try {
        const response = await axios.get(sitemapUrl);
        const parser = new xml2js.Parser();
        return await parser.parseStringPromise(response.data);
    } catch (error) {
        console.error(`Error fetching sitemap ${sitemapUrl}:`, error);
        return null;
    }
}

async function extractUrlsFromSitemap(sitemapData) {
    const urls = new Set();
    
    if (!sitemapData) return urls;

    // Handle sitemap index files
    if (sitemapData.sitemapindex) {
        const nestedSitemaps = sitemapData.sitemapindex.sitemap || [];
        for (const sitemap of nestedSitemaps) {
            const nestedUrl = sitemap.loc[0];
            const nestedData = await fetchAndParseSitemap(nestedUrl);
            const nestedUrls = await extractUrlsFromSitemap(nestedData);
            nestedUrls.forEach(url => urls.add(url));
        }
    }

    // Handle regular sitemap files
    if (sitemapData.urlset) {
        const urlEntries = sitemapData.urlset.url || [];
        urlEntries.forEach(entry => {
            if (entry.loc && entry.loc[0]) {
                urls.add(entry.loc[0]);
            }
        });
    }

    return urls;
}

function extractPhrasesFromContent(content) {
    const phrases = new Set();
    
    // Split into sentences first
    const sentences = content.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
    
    for (const sentence of sentences) {
        // Skip URLs and existing markdown links
        const cleanSentence = sentence.replace(/\[.*?\]\(.*?\)/g, '') // Remove markdown links
                                    .replace(/https?:\/\/[^\s)]+/g, ''); // Remove URLs
        
        // Split sentence into words
        const words = cleanSentence.split(/\s+/).filter(w => {
            // Filter out markdown syntax and very short words
            return w.length > 1 && 
                   !w.startsWith('[') && 
                   !w.startsWith('(') && 
                   !w.endsWith(']') && 
                   !w.endsWith(')') &&
                   !w.includes('/') && // Skip path segments
                   !/^[0-9-]+$/.test(w); // Skip numbers and dashes
        });
        
        // Create sliding window of phrases (2-5 words)
        for (let i = 0; i < words.length; i++) {
            for (let len = 2; len <= Math.min(5, words.length - i); len++) {
                const phrase = words.slice(i, i + len).join(' ');
                if (phrase.length >= 3) {  // Minimum 3 characters
                    phrases.add(phrase);
                }
            }
            // Add single words if they're long enough (potential keywords)
            if (words[i].length >= 4 && !words[i].includes('.')) {
                phrases.add(words[i]);
            }
        }
    }
    
    return Array.from(phrases);
}

function calculateSemanticSimilarity(phrase1, phrase2) {
    // Tokenize and stem both phrases
    const tokens1 = tokenizer.tokenize(phrase1.toLowerCase());
    const tokens2 = tokenizer.tokenize(phrase2.toLowerCase());
    
    const stemmed1 = tokens1.map(token => cachedStem(token));
    const stemmed2 = tokens2.map(token => cachedStem(token));
    
    // Calculate Jaccard similarity of stemmed tokens
    const set1 = new Set(stemmed1);
    const set2 = new Set(stemmed2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    const jaccardSim = intersection.size / union.size;
    
    // Combine scores
    return Math.min(1, jaccardSim);
}

function findRelatedKeywords(contentPhrase, sitemapKeywords) {
    // Clean and normalize the content phrase
    const cleanPhrase = contentPhrase.toLowerCase().trim();
    const phraseWords = cleanPhrase.split(/\s+/);
    
    // Skip very short phrases and common stop words
    const stopWords = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he', 
        'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'to', 'was', 'were', 'will', 'with']);
    
    // Skip if the phrase is just stop words
    const significantWords = phraseWords.filter(word => !stopWords.has(word) && word.length > 1);
    if (significantWords.length === 0) {
        return null;
    }
    
    const matches = [];
    
    // Go through each sitemap keyword
    for (const [sitemapKey, url] of sitemapKeywords) {
        const cleanSitemapKey = sitemapKey.toLowerCase().replace(/-/g, ' ');
        
        // Calculate semantic similarity
        const semanticScore = calculateSemanticSimilarity(cleanPhrase, cleanSitemapKey);
        
        if (semanticScore >= 0.70) {  // Increased threshold for better relevance
            matches.push({ 
                key: sitemapKey, 
                url, 
                score: semanticScore,
                matchType: 'semantic',
                commonWords: significantWords
            });
        }
    }
    
    // Sort matches by score and return the best match
    matches.sort((a, b) => b.score - a.score);
    return matches.length > 0 ? matches[0] : null;
}

function getContext(content, phrase) {
    // Escape special regex characters in the phrase
    const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    try {
        // Use positive lookbehind/lookahead to get surrounding context
        const regex = new RegExp(`[^.!?]*?${escapedPhrase}[^.!?]*`, 'g');
        const match = content.match(regex);
        return match ? match[0].trim() : '';
    } catch (error) {
        console.error('Error getting context:', error);
        // Fallback to simple substring if regex fails
        const index = content.indexOf(phrase);
        if (index === -1) return '';
        
        const start = Math.max(0, content.lastIndexOf('.', index) + 1);
        const end = Math.min(content.length, content.indexOf('.', index + phrase.length));
        return content.substring(start, end).trim();
    }
}

async function readSitemap(sitemapUrl) {
    try {
        const sitemapData = await fetchAndParseSitemap(sitemapUrl);
        const urls = await extractUrlsFromSitemap(sitemapData);
        
        const urlMap = new Map();
        
        for (const url of urls) {
            // Extract keywords from URL path segments
            const pathSegments = new URL(url).pathname.split('/').filter(Boolean);
            const keywords = pathSegments.map(segment => 
                segment.replace(/-/g, ' ').toLowerCase()
            )
            
            // Map each keyword to the URL
            keywords.forEach(keyword => {
                if (!urlMap.has(keyword)) {
                    urlMap.set(keyword, url);
                }
            });
        }
        
        return urlMap;
    } catch (error) {
        console.error('Error processing sitemap:', error);
        return new Map();
    }
}

async function processInternalLinks(content, sitemapUrl) {
    try {
        const sitemapKeywords = await readSitemap(sitemapUrl);
        const addedLinks = [];
        const stats = { totalMatches: 0, uniqueUrls: new Set() };
        
        // Extract phrases from content
        const phrases = extractPhrasesFromContent(content);
        
        // Track best match per URL
        const urlBestMatches = new Map();
        
        // First pass: Find all matches and keep only the best match per URL
        for (const phrase of phrases) {
            const match = findRelatedKeywords(phrase, sitemapKeywords);
            if (match) {
                const existingMatch = urlBestMatches.get(match.url);
                if (!existingMatch || match.score > existingMatch.score) {
                    urlBestMatches.set(match.url, {
                        phrase,
                        ...match
                    });
                }
            }
        }
        
        // Second pass: Apply the best matches
        let modifiedContent = content;
        const processedPhrases = new Set(); // Track processed phrases to avoid duplicates
        
        for (const [url, match] of urlBestMatches) {
            const { phrase } = match;
            
            // Skip if we've already processed this phrase
            if (processedPhrases.has(phrase)) {
                continue;
            }
            
            // Create a regex that matches the exact phrase but not within URLs or markdown links
            const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(
                `(?<!\\[|\\]\\(|https?:\\/\\/[^\\s)]*?)${escapedPhrase}(?!\\]|\\)|[^\\s)]*?\\))`,
                'g'
            );
            
            // Only replace if the phrase exists and isn't already part of a link
            if (regex.test(modifiedContent)) {
                // Replace only the first occurrence that's not already a link
                let replaced = false;
                modifiedContent = modifiedContent.replace(regex, (match) => {
                    if (!replaced) {
                        replaced = true;
                        return `[${phrase}](${url})`;
                    }
                    return match; // Keep subsequent occurrences as plain text
                });

                if (replaced) {
                    addedLinks.push({
                        phrase,
                        matchedWith: match.key,
                        score: match.score,
                        url: match.url,
                        context: getContext(content, phrase)
                    });
                    stats.totalMatches++;
                    stats.uniqueUrls.add(url);
                    processedPhrases.add(phrase);
                }
            }
        }
        
        return  {
            found_links: addedLinks,
            updated_content: modifiedContent,
            stats: {
                totalMatches: stats.totalMatches,
                uniqueUrls: stats.uniqueUrls.size
            }
        };
    } catch (error) {
        console.error('Error in processInternalLinks:', error);
        return {
            found_links: [],
            updated_content: content,
            stats: {
                totalMatches: 0,
                uniqueUrls: 0
            }
        };
    }
}
module.exports = {
    processInternalLinks,
    readSitemap
};