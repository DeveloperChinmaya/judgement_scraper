const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

class JudgementScraper {
    constructor() {
        this.baseURL = 'https://indiankanoon.org';
        this.delay = 1500; // 2 seconds between requests
        this.concurrent = 1; // Process one at a time for reliability
        
        // Files
        this.linksFile = 'all_judgement_links_flat.json';
        this.outputFile = 'judgements_data.json';
        this.progressFile = 'judgement_scraper_progress.json';
        
        // Initialize data structures
        this.judgementsData = {};
        this.progress = {
            year: null,
            page: null,
            index: -1,
            totalProcessed: 0,
            status: 'idle'
        };
        
        // Initialize axios
        this.axiosInstance = axios.create({
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive'
            },
            timeout: 60000,
            maxRedirects: 5
        });
        
        this.allLinks = [];
        this.currentYearData = null;
    }

    // Load progress
    loadProgress() {
        try {
            if (fs.existsSync(this.progressFile)) {
                const data = fs.readFileSync(this.progressFile, 'utf8');
                this.progress = JSON.parse(data);
                console.log(`Resuming from: Year ${this.progress.year}, Index ${this.progress.index + 1}`);
                return true;
            }
        } catch (error) {
            console.log('No progress file found, starting fresh...');
        }
        return false;
    }

    // Save progress
    saveProgress() {
        fs.writeFileSync(this.progressFile, JSON.stringify(this.progress, null, 2));
    }

    // Load existing judgements data
    loadJudgementsData() {
        try {
            if (fs.existsSync(this.outputFile)) {
                const data = fs.readFileSync(this.outputFile, 'utf8');
                this.judgementsData = JSON.parse(data);
                console.log(`Loaded ${Object.keys(this.judgementsData).length} years of existing data`);
                return true;
            }
        } catch (error) {
            this.judgementsData = {};
        }
        return false;
    }

    // Save judgements data
    saveJudgementsData() {
        fs.writeFileSync(this.outputFile, JSON.stringify(this.judgementsData, null, 2));
    }

    // Load all links
    loadAllLinks() {
        try {
            const data = fs.readFileSync(this.linksFile, 'utf8');
            this.allLinks = JSON.parse(data);
            console.log(`Loaded ${this.allLinks.length} judgement links`);
            return true;
        } catch (error) {
            console.error('Error loading links file:', error.message);
            return false;
        }
    }

    // Clean incomplete judgement if exists at resume position
    cleanIncompleteJudgement() {
        if (this.progress.year && this.progress.index >= 0) {
            const yearStr = this.progress.year.toString();
            if (this.judgementsData[yearStr] && this.judgementsData[yearStr].length > 0) {
                // Check if last judgement is incomplete (no texts or empty)
                const lastIndex = this.judgementsData[yearStr].length - 1;
                const lastJudgement = this.judgementsData[yearStr][lastIndex];
                
                if (!lastJudgement.texts || lastJudgement.texts.length === 0) {
                    console.log('Removing incomplete judgement...');
                    this.judgementsData[yearStr].pop();
                    this.saveJudgementsData();
                }
            }
        }
    }

    // Extract text recursively from an element
    extractTextWithMetadata(element, $, parentTitle = null) {
        const result = [];
        
        // Get current element's title or id
        const elementTitle = $(element).attr('title') || $(element).attr('id') || parentTitle || 'unknown';
        
        // If this element has direct text
        const directText = $(element).contents().filter(function() {
            return this.nodeType === 3; // Text node
        }).text().trim();
        
        if (directText) {
            result.push({
                type: elementTitle,
                content: directText
            });
        }

        // Process child elements recursively
        $(element).children().each((i, child) => {
            const childTag = $(child).prop('tagName').toLowerCase();
            
            // Skip script and style tags
            if (childTag === 'script' || childTag === 'style') {
                return;
            }
            
            // For certain tags, we want to process their content
            const childText = $(child).text().trim();
            if (childText) {
                const childTitle = $(child).attr('title') || $(child).attr('id') || elementTitle;
                
                // For blockquote, pre, p, div, span - extract their text
                if (['blockquote', 'pre', 'p', 'div', 'span'].includes(childTag)) {
                    // Recursively extract from children
                    const childResults = this.extractTextWithMetadata(child, $, childTitle);
                    result.push(...childResults);
                } else {
                    // For other tags, just get the text
                    result.push({
                        type: childTitle,
                        content: childText
                    });
                }
            }
        });

        return result;
    }

    // Extract judgement content from HTML
    extractJudgementContent(html, url) {
        const $ = cheerio.load(html);
        const result = {
            title: '',
            texts: [],
            url: url,
            timestamp: new Date().toISOString()
        };

        try {
            // Find the judgements div
            const judgementsDiv = $('div.judgments');
            
            if (judgementsDiv.length === 0) {
                console.log('No judgements div found');
                return result;
            }

            // Extract title from h2.doc_title
            const titleElement = judgementsDiv.find('h2.doc_title');
            result.title = titleElement.text().trim() || 'Untitled Judgement';

            // Remove covers div and h3 if present
            judgementsDiv.find('div.covers, h3').remove();

            // Process all child nodes of judgements div
            judgementsDiv.children().each((i, child) => {
                const childTag = $(child).prop('tagName').toLowerCase();
                
                // Skip empty elements
                if ($(child).text().trim().length === 0) {
                    return;
                }

                // Extract text with metadata
                const childTexts = this.extractTextWithMetadata(child, $);
                if (childTexts.length > 0) {
                    result.texts.push(...childTexts);
                }
            });

            // Also check for pre elements (they might be direct children)
            judgementsDiv.find('pre').each((i, pre) => {
                const preText = $(pre).text().trim();
                if (preText) {
                    const preTitle = $(pre).attr('title') || $(pre).attr('id') || 'judgement_text';
                    result.texts.push({
                        type: preTitle,
                        content: preText
                    });
                }
            });

        } catch (error) {
            console.error('Error extracting content:', error.message);
        }

        return result;
    }

    // Fetch and process a single judgement
    async processJudgement(linkInfo) {
        const { year, page, link, docId } = linkInfo;
        
        console.log(`\n[${year}] Processing: ${docId}`);
        console.log(`URL: ${link}`);
        
        try {
            const response = await this.axiosInstance.get(link);
            
            if (response.status === 200) {
                const judgement = this.extractJudgementContent(response.data, link);
                
                // Add year and page info
                judgement.year = year;
                judgement.page = page;
                judgement.docId = docId;
                
                console.log(`✓ Extracted: "${judgement.title.substring(0, 60)}..."`);
                console.log(`  Text sections: ${judgement.texts.length}`);
                
                return judgement;
            } else {
                console.log(`✗ Failed: HTTP ${response.status}`);
                return null;
            }
        } catch (error) {
            console.error(`✗ Error: ${error.message}`);
            
            // Handle specific errors
            if (error.response) {
                console.log(`  HTTP ${error.response.status}: ${error.response.statusText}`);
            }
            
            return null;
        }
    }

    // Main scraping function
    async scrape() {
        console.log('=== Starting Judgement Scraper ===\n');
        
        // Load data
        if (!this.loadAllLinks()) {
            console.error('Failed to load links. Exiting.');
            return;
        }
        
        this.loadProgress();
        this.loadJudgementsData();
        this.cleanIncompleteJudgement();
        
        // Determine start index
        let startIndex = 0;
        if (this.progress.index >= 0) {
            startIndex = this.progress.index + 1; // Start from next after saved progress
            console.log(`Resuming from index: ${startIndex}`);
        }
        
        // Process judgements
        for (let i = startIndex; i < this.allLinks.length; i++) {
            const linkInfo = this.allLinks[i];
            const yearStr = linkInfo.year.toString();
            
            // Initialize year array if not exists
            if (!this.judgementsData[yearStr]) {
                this.judgementsData[yearStr] = [];
            }
            
            // Update progress
            this.progress.year = linkInfo.year;
            this.progress.page = linkInfo.page;
            this.progress.index = i;
            this.progress.totalProcessed++;
            this.progress.status = 'processing';
            
            console.log(`\n[Progress: ${i + 1}/${this.allLinks.length}]`);
            
            // Process the judgement
            const judgement = await this.processJudgement(linkInfo);
            
            if (judgement) {
                // Add to data
                this.judgementsData[yearStr].push(judgement);
                
                // Save progress every 5 judgements
                if (this.progress.totalProcessed % 5 === 0) {
                    this.saveJudgementsData();
                    this.saveProgress();
                    console.log(`  Progress saved (${this.progress.totalProcessed} total)`);
                }
            }
            
            // Delay between requests
            if (i < this.allLinks.length - 1) {
                console.log(`  Waiting ${this.delay/1000} seconds...`);
                await this.delayAsync(this.delay);
            }
        }
        
        // Final save
        this.progress.status = 'completed';
        this.saveJudgementsData();
        this.saveProgress();
        
        console.log('\n=== Scraping Completed ===');
        console.log(`Total judgements processed: ${this.progress.totalProcessed}`);
        console.log(`Data saved to: ${this.outputFile}`);
        
        // Print summary
        this.printSummary();
    }

    // Utility: Delay function
    delayAsync(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Print summary statistics
    printSummary() {
        console.log('\n=== Summary ===');
        
        Object.keys(this.judgementsData).sort().forEach(year => {
            const count = this.judgementsData[year].length;
            let totalTexts = 0;
            
            this.judgementsData[year].forEach(j => {
                totalTexts += j.texts.length;
            });
            
            console.log(`${year}: ${count} judgements, ${totalTexts} text sections`);
        });
    }

    // Get statistics
    getStats() {
        const stats = {
            totalYears: Object.keys(this.judgementsData).length,
            totalJudgements: 0,
            totalTextSections: 0,
            years: {}
        };
        
        Object.keys(this.judgementsData).forEach(year => {
            const count = this.judgementsData[year].length;
            let yearTexts = 0;
            
            this.judgementsData[year].forEach(j => {
                yearTexts += j.texts.length;
            });
            
            stats.totalJudgements += count;
            stats.totalTextSections += yearTexts;
            stats.years[year] = {
                judgements: count,
                textSections: yearTexts
            };
        });
        
        return stats;
    }
}

// Run the scraper
async function main() {
    const scraper = new JudgementScraper();
    
    try {
        await scraper.scrape();
        
        // Print final statistics
        const stats = scraper.getStats();
        console.log('\n=== Final Statistics ===');
        console.log(`Years: ${stats.totalYears}`);
        console.log(`Total Judgements: ${stats.totalJudgements}`);
        console.log(`Total Text Sections: ${stats.totalTextSections}`);
        
    } catch (error) {
        console.error('Fatal error:', error);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n\nScraper interrupted. Saving progress...');
    process.exit(0);
});

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = JudgementScraper;