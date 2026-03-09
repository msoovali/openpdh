# OpenPDH

**Open Portable Document Harvester** — Extract structured data from PDF documents by defining reading zones.

## What it does

1. **Configure** — Upload a sample PDF, draw rectangles over the areas you want to extract, and assign field names
2. **Harvest** — Upload any PDF matching that layout, and get structured JSON data back instantly

## Tech Stack

- **Frontend:** Vite + React + Mantine UI
- **PDF Rendering:** pdf.js
- **Storage:** Browser-based (IndexedDB)

## Getting Started

```bash
npm install
npm run dev
```
