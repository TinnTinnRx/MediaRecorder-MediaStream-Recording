# Multimodal Input → Text Output (Chrome/Edge)  
**Client-side web app (GitHub Pages compatible)** that accepts **Text + Audio (record/upload) + Image (upload)** and produces a **single text report**.  
It also supports exporting the report as **TXT / PDF / DOCX**, and includes **Image → Text** using a lightweight **Transformer-based image captioning model** (runs in the browser).

> **Target browsers:** Google Chrome, Microsoft Edge (Chromium-based)

---

## Key Features
- **Text input**: user-entered text included in the final report.
- **Audio input**:
  - Record from microphone using **MediaRecorder** (client-side).
  - Upload an audio file (client-side).
  - (This starter template records and summarizes audio metadata; it does **not** transcribe audio to text yet.)
- **Image input**:
  - Upload an image and preview it.
  - **Image → Text (Transformer)**: generates a **caption** (description) from the image.
- **Output = text report**: one consolidated report in a textarea.
- **Export options**:
  - **TXT**: direct download
  - **PDF**: client-side HTML → PDF
  - **DOCX**: client-side DOCX generation

---

## Tech Stack (Client-side Only)
- **HTML/CSS/JavaScript**
- **MediaRecorder API** for recording audio in the browser (Chrome/Edge support).
- **Transformers.js** for running ML models in the browser.
  - Model used: **`Xenova/vit-gpt2-image-captioning`** (ONNX weights designed for Transformers.js).
- **html2pdf.js** for PDF export (wraps `html2canvas` + `jsPDF`).
- **docx** (docx.js) for DOCX export in the browser.

---

## Project Structure
