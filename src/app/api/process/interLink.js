import axios from 'axios';
import { parseString } from 'xml2js';
import natural from 'natural';

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
        // Fetch XML data from URL
        const response = await axios.get(sitemapUrl);
        const xmlData = response.data;
        
        return new Promise((resolve, reject) => {
            parseString(xmlData, (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });
    } catch (error) {
        console.error('Error fetching or parsing sitemap:', error);
        throw error;
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

function findRelatedKeywords(phrase, sitemapKeywords) {
    const phraseWords = tokenizer.tokenize(phrase.toLowerCase());
    if (!phraseWords || phraseWords.length === 0) return null;

    let bestMatch = null;
    let bestScore = 0;

    for (const [keyword, metadata] of sitemapKeywords) {
        const { url, isSingleWord } = metadata;
        
        // For single-word keywords, require exact match
        if (isSingleWord) {
            if (phrase.toLowerCase() === keyword) {
                return {
                    key: keyword,
                    url,
                    score: 1
                };
            }
            continue;
        }

        // For multi-word keywords, use existing similarity logic
        const keywordWords = tokenizer.tokenize(keyword);
        if (!keywordWords || keywordWords.length === 0) continue;

        // Calculate similarity using stemming
        const phraseStems = new Set(phraseWords.map(word => cachedStem(word)));
        const keywordStems = new Set(keywordWords.map(word => cachedStem(word)));

        // Calculate Jaccard similarity
        const intersection = new Set([...phraseStems].filter(x => keywordStems.has(x)));
        const union = new Set([...phraseStems, ...keywordStems]);
        
        const score = intersection.size / union.size;

        if (score > bestScore) {
            bestScore = score;
            bestMatch = {
                key: keyword,
                url,
                score
            };
        }
    }

    // Return match only if score exceeds threshold
    return bestScore >= 0.8 ? bestMatch : null;
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
    const sitemapData = await fetchAndParseSitemap(sitemapUrl);
    const urls = await extractUrlsFromSitemap(sitemapData);
        
    const urlMap = new Map();
        
    for (const url of urls) {
            // Extract keywords from URL path segments
            const pathSegments = new URL(url).pathname.split('/').filter(Boolean);
            const keywords = pathSegments.map(segment => {
                const words = segment.split('-');
                const keyword = segment.replace(/-/g, ' ').toLowerCase();
                return {
                    keyword,
                    isSingleWord: words.length === 1
                };
            });
            
            // Map each keyword to the URL with additional metadata
            keywords.forEach(({ keyword, isSingleWord }) => {
                if (!urlMap.has(keyword)) {
                    urlMap.set(keyword, {
                        url,
                        isSingleWord
                    });
                }
            });
        }
        
        return urlMap;
}

async function processInternalLinks(content,sitemapurl) {
    try {
        const sitemapKeywords = await readSitemap(sitemapurl);
        
        const addedLinks = [];
        const stats = { totalMatches: 0, uniqueUrls: new Set() };
        
        // Keep track of positions where links exist to avoid nesting
        const linkPositions = [];
        
        // Track which keywords have been linked to avoid duplicates
        const linkedKeywords = new Set();
        
        // First pass: Find existing links and mark their positions
        const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        let match;
        while ((match = linkRegex.exec(content)) !== null) {
            linkPositions.push({
                start: match.index,
                end: match.index + match[0].length
            });
        }
        
        // Function to check if a position overlaps with existing links
        const isPositionSafe = (start, end) => {
            return !linkPositions.some(pos => 
                (start >= pos.start && start <= pos.end) || 
                (end >= pos.start && end <= pos.end) ||
                (start <= pos.start && end >= pos.end)
            );
        };

        // Split content into lines to process non-header content
        const lines = content.split('\n');
        let processedContent = '';
        let currentPosition = 0;
        
        // Process each line
        for (const line of lines) {
            // Skip header lines (starting with #)
            if (line.trim().startsWith('#')) {
                processedContent += line + '\n';
                currentPosition += line.length + 1; // +1 for newline
                continue;
            }
            
            let currentLine = line;
            let lineOffset = currentPosition;
            
            // Convert Map entries to array and sort by keyword length (longest first)
            const sortedKeywords = Array.from(sitemapKeywords.entries())
                .sort(([a], [b]) => b.length - a.length);

            for (const [keyword, metadata] of sortedKeywords) {
                // Skip if this keyword has already been linked
                if (linkedKeywords.has(keyword.toLowerCase())) {
                    continue;
                }
                
                const { url, isSingleWord } = metadata;
                
                // For hyphenated keywords, match the exact phrase
                // For non-hyphenated keywords, use word boundaries
                const keywordRegex = isSingleWord 
                    ? new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
                    : new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
                
                let keywordMatch;
                while ((keywordMatch = keywordRegex.exec(currentLine)) !== null) {
                    const matchStart = lineOffset + keywordMatch.index;
                    const matchEnd = matchStart + keywordMatch[0].length;
                    
                    // Skip if this is part of a hyphenated word but not the complete hyphenated word
                    if (!isSingleWord) {
                        const beforeChar = matchStart > 0 ? content[matchStart - 1] : '';
                        const afterChar = matchEnd < content.length ? content[matchEnd] : '';
                        if (beforeChar === '-' || afterChar === '-') {
                            continue;
                        }
                    }
                    
                    // Only add link if the position is safe (not inside another link)
                    if (isPositionSafe(matchStart, matchEnd)) {
                        const link = `[${keywordMatch[0]}](${url})`;
                        const beforeMatch = currentLine.slice(0, keywordMatch.index);
                        const afterMatch = currentLine.slice(keywordMatch.index + keywordMatch[0].length);
                        currentLine = beforeMatch + link + afterMatch;
                        
                        // Update link positions for future checks
                        linkPositions.push({
                            start: matchStart,
                            end: matchStart + link.length
                        });
                        
                        // Mark this keyword as linked
                        linkedKeywords.add(keyword.toLowerCase());
                        
                        addedLinks.push({ keyword: keywordMatch[0], url });
                        stats.totalMatches++;
                        stats.uniqueUrls.add(url);
                        
                        // Adjust regex index for the next iteration
                        keywordRegex.lastIndex += link.length - keywordMatch[0].length;
                        
                        // Break after first match for this keyword
                        break;
                    }
                }
            }
            
            processedContent += currentLine + '\n';
            currentPosition += line.length + 1; // +1 for newline
        }

        return {
            found_links: addedLinks,
            updated_content: processedContent.trimEnd(), // Remove trailing newline
            stats: { 
                totalMatches: stats.totalMatches, 
                uniqueUrls: stats.uniqueUrls.size 
            }
        };
    } catch (error) {
        console.error('Error processing internal links:', error);
        return {
            found_links: [],
            updated_content: content,
            stats: { totalMatches: 0, uniqueUrls: 0 }
        };
    }
}

export { processInternalLinks, readSitemap };