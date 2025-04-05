// pdfParser.js
import { PdfReader } from "pdfreader";

export async function getPdfPages(filePath) {
  return new Promise((resolve, reject) => {
    const pdfReader = new PdfReader();
    const pages = {};
    let currentPage = 0;
    let pageText = "";

    pdfReader.parseFileItems(filePath, (err, item) => {
      if (err) {
        reject(err);
      } else if (!item) {
        // Add the last page
        if (pageText) {
          pages[currentPage] = pageText.trim();
        }
        resolve(pages);
      } else if (item.page) {
        // Save previous page text if exists
        if (pageText && currentPage > 0) {
          pages[currentPage] = pageText.trim();
          pageText = "";
        }
        currentPage = item.page;
      } else if (item.text) {
        pageText += item.text + " ";
      }
    });
  });
}