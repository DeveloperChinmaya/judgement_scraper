const fs = require('fs');

function verifyAndRecover() {
    console.log('=== Verifying and Recovering Data ===\n');
    
    // Load progress
    let progress = {};
    try {
        if (fs.existsSync('judgement_scraper_progress.json')) {
            progress = JSON.parse(fs.readFileSync('judgement_scraper_progress.json', 'utf8'));
            console.log('Progress loaded:', progress);
        }
    } catch (error) {
        console.log('No progress file');
    }
    
    // Load judgements data
    let judgementsData = {};
    try {
        if (fs.existsSync('judgements_data.json')) {
            judgementsData = JSON.parse(fs.readFileSync('judgements_data.json', 'utf8'));
        }
    } catch (error) {
        console.log('No judgements data file');
    }
    
    // Load links
    let allLinks = [];
    try {
        if (fs.existsSync('all_judgement_links_flat.json')) {
            allLinks = JSON.parse(fs.readFileSync('all_judgement_links_flat.json', 'utf8'));
        }
    } catch (error) {
        console.log('No links file');
    }
    
    // Check for inconsistencies
    if (progress.index >= 0 && progress.index < allLinks.length) {
        const expectedIndex = progress.index;
        const actualCount = countJudgements(judgementsData);
        
        console.log(`\nExpected to have processed: ${expectedIndex + 1} links`);
        console.log(`Actual judgements in data: ${actualCount}`);
        
        if (actualCount < expectedIndex + 1) {
            console.log('\n⚠️  Inconsistency detected! Some judgements might be missing.');
            console.log('Run the scraper again to resume from last good position.');
        } else {
            console.log('\n✓ Data appears consistent');
        }
    }
    
    // Print statistics
    printStatistics(judgementsData);
}

function countJudgements(data) {
    let count = 0;
    Object.keys(data).forEach(year => {
        count += data[year].length;
    });
    return count;
}

function printStatistics(data) {
    console.log('\n=== Current Data Statistics ===');
    
    const years = Object.keys(data).sort();
    console.log(`Years with data: ${years.length}`);
    
    years.forEach(year => {
        const judgements = data[year];
        console.log(`\n${year}: ${judgements.length} judgements`);
        
        if (judgements.length > 0) {
            const sample = judgements[0];
            console.log(`  Sample: "${sample.title.substring(0, 80)}..."`);
            console.log(`  Text sections: ${sample.texts.length}`);
        }
    });
}

verifyAndRecover();