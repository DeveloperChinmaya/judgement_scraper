const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const BASE_URL = 'https://indiankanoon.org';
const START_YEAR = 2010;
const END_YEAR = 2026;

// Files to store data
const LINKS_FILE = 'supreme_court_links.json';
const PROGRESS_FILE = 'scraper_progress.json';

// Configure axios with retry logic
const axiosInstance = axios.create({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    timeout: 30000
});

// Load progress or start fresh
function loadProgress() {
    try {
        if (fs.existsSync(PROGRESS_FILE)) {
            const data = fs.readFileSync(PROGRESS_FILE, 'utf8');
            console.log(`Resuming from Year: ${data.currentYear}, Page: ${data.currentPage}`);
            return JSON.parse(data);
        }
    } catch (error) {
        console.log('No progress file found, starting fresh...');
    }
    return { currentYear: START_YEAR, currentPage: 0 };
}

// Save progress
function saveProgress(currentYear, currentPage) {
    const progress = { currentYear, currentPage };
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// Load existing links
function loadLinksData() {
    try {
        if (fs.existsSync(LINKS_FILE)) {
            const data = fs.readFileSync(LINKS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        // File doesn't exist yet
    }
    return {};
}

// Save links
function saveLinksData(linksData) {
    fs.writeFileSync(LINKS_FILE, JSON.stringify(linksData, null, 2));
}

// Extract links from a single page
async function extractLinksFromPage(year, pageNum) {
    let url;
    
    if (pageNum === 0) {
        url = `${BASE_URL}/search/?formInput=doctypes:supremecourt%20year:${year}`;
    } else {
        url = `${BASE_URL}/search/?formInput=doctypes%3A%20supremecourt%20year%3A%20${year}&pagenum=${pageNum}`;
    }

    console.log(`Fetching Year ${year}, Page ${pageNum + 1}...`);

    try {
        const response = await axiosInstance.get(url);
        const $ = cheerio.load(response.data);

        const links = [];
        
        // Find all anchor tags inside result items
        $('article.result a, .result a, .result_title a').each((index, element) => {
            const href = $(element).attr('href');
            if (href) {
                // Make URL absolute
                const absoluteLink = href.startsWith('http') ? href : `${BASE_URL}${href}`;
                links.push(absoluteLink);
            }
        });

        console.log(`Found ${links.length} links`);

        // Check if there are more pages by looking for content
        const hasContent = $('article.result, .result, .result_title').length > 0;
        return { links, hasContent };

    } catch (error) {
        console.error(`Error: ${error.message}`);
        return { links: [], hasContent: false };
    }
}

// Scrape all years
async function scrapeAllYears() {
    // Load existing data
    let linksData = loadLinksData();
    let progress = loadProgress();

    // Start from where we left off
    let currentYear = progress.currentYear;
    let startFromCurrentPage = progress.currentPage;

    for (let year = currentYear; year <= END_YEAR; year++) {
        console.log(`\n=== Starting Year ${year} ===`);
        
        // Initialize year if not exists
        if (!linksData[year]) {
            linksData[year] = {};
        }

        let pageNum = (year === currentYear) ? startFromCurrentPage : 0;
        let hasMorePages = true;
        let pageCount = 0;

        while (hasMorePages) {
            // Update progress
            saveProgress(year, pageNum);

            // Extract links
            const result = await extractLinksFromPage(year, pageNum);
            
            // Store links if we found any
            if (result.links.length > 0) {
                pageCount++;
                linksData[year][pageCount] = result.links;
                saveLinksData(linksData);
            }

            hasMorePages = result.links.length > 0 && result.hasContent;
            pageNum++;

            // Small delay to be nice to the server
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log(`Completed Year ${year}`);
        
        // Reset page counter for next year
        progress.currentPage = 0;
    }

    console.log('\n=== Scraping Completed ===');
    console.log(`Data saved to ${LINKS_FILE}`);
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
    console.log('\n\nScraper stopped. Progress saved.');
    process.exit(0);
});

// Run the scraper
scrapeAllYears().catch(console.error);