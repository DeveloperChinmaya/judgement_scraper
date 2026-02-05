const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");

/* ============================================================
   JUDGEMENT SCRAPER – PRODUCTION VERSION
   - Year-wise JSON storage
   - Resume support
   - Atomic writes
   - Ctrl+C safe
============================================================ */

class JudgementScraper {
  constructor({ resume = false } = {}) {

    /* ---------- CONFIG ---------- */
    this.baseURL = "https://indiankanoon.org";
    this.delay = 1500;
    this.linksFile = "all_judgement_links_flat.json";
    this.progressFile = "judgement_scraper_progress.json";
    this.outputDir = "judgements";

    /* ---------- STATE ---------- */
    this.currentYear = null;
    this.currentYearBuffer = [];
    this.allLinks = [];
    this.resume = resume;

    this.progress = {
      year: null,
      page: null,
      index: -1,
      totalProcessed: 0,
      status: "idle"
    };

    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir);
    }

    this.http = axios.create({
      timeout: 60000,
      maxRedirects: 5,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      }
    });
  }

  /* ============================================================
     FILE HELPERS
  ============================================================ */

  getYearFile(year) {
    return `${this.outputDir}/${year}.json`;
  }

  loadYear(year) {
    const file = this.getYearFile(year);

    if (fs.existsSync(file)) {
      this.currentYearBuffer = JSON.parse(fs.readFileSync(file, "utf8"));
    } else {
      this.currentYearBuffer = [];
    }

    this.currentYear = year;
  }

  saveCurrentYear() {
    if (!this.currentYear) return;

    const file = this.getYearFile(this.currentYear);
    const tmp = file + ".tmp";

    fs.writeFileSync(tmp, JSON.stringify(this.currentYearBuffer, null, 2));
    fs.renameSync(tmp, file);
  }

  saveProgress() {
    fs.writeFileSync(
      this.progressFile,
      JSON.stringify(this.progress, null, 2)
    );
  }

  loadProgress() {
    if (!this.resume) return;

    if (fs.existsSync(this.progressFile)) {
      this.progress = JSON.parse(
        fs.readFileSync(this.progressFile, "utf8")
      );

      console.log(
        `Resuming at index ${this.progress.index + 1}`
      );
    }
  }

  loadAllLinks() {
    this.allLinks = JSON.parse(
      fs.readFileSync(this.linksFile, "utf8")
    );

    console.log(`Loaded ${this.allLinks.length} links`);
  }

  /* ============================================================
     EXTRACTION
  ============================================================ */

  extractTextWithMetadata(el, $, parent = "text") {
    const result = [];
    const title =
      $(el).attr("title") || $(el).attr("id") || parent;

    const directText = $(el)
      .contents()
      .filter(function () {
        return this.nodeType === 3;
      })
      .text()
      .trim();

    if (directText) {
      result.push({ type: title, content: directText });
    }

    $(el)
      .children()
      .each((_, child) => {
        const tag = $(child).prop("tagName").toLowerCase();
        if (tag === "script" || tag === "style") return;

        const childText = $(child).text().trim();
        if (!childText) return;

        if (["p", "div", "span", "pre", "blockquote"].includes(tag)) {
          result.push(
            ...this.extractTextWithMetadata(child, $, title)
          );
        } else {
          result.push({ type: title, content: childText });
        }
      });

    return result;
  }

  extractJudgement(html, url) {
    const $ = cheerio.load(html);

    const result = {
      title: "",
      texts: [],
      url,
      timestamp: new Date().toISOString()
    };

    const div = $("div.judgments");
    if (!div.length) return result;

    result.title =
      div.find("h2.doc_title").text().trim() ||
      "Untitled Judgement";

    div.find("div.covers, h3").remove();

    div.children().each((_, el) => {
      if ($(el).text().trim()) {
        result.texts.push(
          ...this.extractTextWithMetadata(el, $)
        );
      }
    });

    return result;
  }

  /* ============================================================
     NETWORK
  ============================================================ */

  async fetchJudgement(info) {
    try {
      const res = await this.http.get(info.link);
      if (res.status !== 200) return null;

      const j = this.extractJudgement(res.data, info.link);
      j.year = info.year;
      j.page = info.page;
      j.docId = info.docId;

      return j;
    } catch {
      return null;
    }
  }

  /* ============================================================
     MAIN LOOP
  ============================================================ */

  async scrape() {

    this.loadAllLinks();
    this.loadProgress();

    let start = this.resume
      ? this.progress.index + 1
      : 0;

    console.log(`Starting from index ${start}`);

    for (let i = start; i < this.allLinks.length; i++) {

      const info = this.allLinks[i];
      const year = String(info.year);

      if (this.currentYear !== year) {
        if (this.currentYearBuffer.length) {
          this.saveCurrentYear();
        }
        this.loadYear(year);
      }

      const judgement = await this.fetchJudgement(info);

      this.progress = {
        year: info.year,
        page: info.page,
        index: i,
        totalProcessed: this.progress.totalProcessed,
        status: "processing"
      };

      if (judgement) {
        this.currentYearBuffer.push(judgement);
        this.progress.totalProcessed++;
      }

      if (i % 5 === 0) {
        this.saveCurrentYear();
        this.saveProgress();
      }

      if (i < this.allLinks.length - 1) {
        await new Promise(r => setTimeout(r, this.delay));
      }
    }

    this.progress.status = "completed";
    this.saveCurrentYear();
    this.saveProgress();

    console.log("Scraping complete");
  }
}

/* ============================================================
   ENTRY
============================================================ */

async function main() {

  const mode = process.argv.includes("--resume")
    ? true
    : false;

  const scraper = new JudgementScraper({ resume: mode });
  global.scraper = scraper;

  await scraper.scrape();
}

/* Ctrl+C Safe */
process.on("SIGINT", () => {
  console.log("\nSaving before exit...");
  if (global.scraper) {
    global.scraper.saveCurrentYear();
    global.scraper.saveProgress();
  }
  process.exit();
});

if (require.main === module) {
  main();
}

module.exports = JudgementScraper;