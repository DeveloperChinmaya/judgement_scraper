const fs = require('fs');

function filterJudgementLinks() {
    const data = JSON.parse(fs.readFileSync('supreme_court_links.json', 'utf8'));
    const filteredData = {};
    const allJudgementLinks = [];

    Object.keys(data).forEach(year => {
        filteredData[year] = {};
        
        Object.keys(data[year]).forEach(page => {
            const pageLinks = data[year][page];
            const judgementLinks = [];
            
            // Filter only actual judgement links (those containing /doc/NUMBER/)
            pageLinks.forEach(link => {
                if (link.includes('/doc/') && !link.includes('/docfragment/')) {
                    // Check if it's a proper judgement link (ends with number/)
                    const match = link.match(/\/doc\/(\d+)\//);
                    if (match) {
                        judgementLinks.push(link);
                        allJudgementLinks.push({
                            year: parseInt(year),
                            page: parseInt(page),
                            link: link,
                            docId: match[1]
                        });
                    }
                }
            });
            
            if (judgementLinks.length > 0) {
                filteredData[year][page] = judgementLinks;
            }
        });
    });

    // Save filtered links
    fs.writeFileSync('filtered_judgement_links.json', JSON.stringify(filteredData, null, 2));
    
    // Save all links in a flat structure for easier processing
    fs.writeFileSync('all_judgement_links_flat.json', JSON.stringify(allJudgementLinks, null, 2));
    
    console.log('Filtering complete!');
    console.log(`Total judgement links: ${allJudgementLinks.length}`);
    
    return allJudgementLinks;
}

filterJudgementLinks();