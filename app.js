// app.js (ES Module)
// - MediaRecorder for audio recording (client-side) :contentReference[oaicite:6]{index=6}
// - Transformers.js for running models in browser :contentReference[oaicite:7]{index=7}
// - Xenova/vit-gpt2-image-captioning: ONNX weights for Transformers.js :contentReference[oaicite:8]{index=8}
// - html2pdf.js for PDF export :contentReference[oaicite:9]{index=9}
// - docx (browser) + Packer.toBlob for DOCX export :contentReference[oaicite:10]{index=10}

const $ = (id) => document.getElementById(id);

function showNotice(msg) {
  const box = $("envNotice");
  box.textContent = msg;
  box.style.display = "block";
}
function hideNotice() {
  const box = $("envNotice");
  box.textContent = "";
  box.style.display = "none";
}
function nowISO() {
  return new Date().toISOString();
}
function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// -------------------- State --------------------
let recStream = null;
let recMediaRecorder = null;
let recChunks = [];
let recBlob = null;
let recObjectUrl = null;

let upAudioFile = null;
let upAudioObjectUrl = null;

let imgFile = null;
let imgObjectUrl = null;

let imageToTextResult = "";     // <-- transformer output (caption)
let latestTextOutput = "";

// Transformers.js objects (lazy load)
let tfPipeline = null;          // pipeline function
let captioner = null;           // cached pipeline instance
let modelLoading = false;

// -------------------- Environment checks --------------------
const ua = navigator.userAgent;
const isEdge = ua.includes("Edg/");
const isChrome = ua.includes("Chrome/") && !isEdge;
const hasMediaRecorder = typeof window.MediaRecorder !== "undefined";
const hasGetUserMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

if (!isChrome && !isEdge) {
  showNotice("คำเตือน: แอปนี้ออกแบบให้ใช้งานบน Google Chrome / Microsoft Edge เป็นหลัก");
} else if (!hasMediaRecorder || !hasGetUserMedia) {
  showNotice("คำเตือน: อุปกรณ์นี้อาจไม่รองรับการอัดเสียง (MediaRecorder/getUserMedia)");
} else {
  hideNotice();
}

// -------------------- Elements --------------------
const textInput = $("textInput");
const btnClearText = $("btnClearText");

const btnStartRec = $("btnStartRec");
const btnStopRec = $("btnStopRec");
const recStatus = $("recStatus");
const audioPreviewRec = $("audioPreviewRec");
const btnClearRec = $("btnClearRec");

const audioFile = $("audioFile");
const audioPreviewUp = $("audioPreviewUp");
const btnClearAudioUp = $("btnClearAudioUp");

const imageFile = $("imageFile");
const imageWrap = $("imageWrap");
const imagePreview = $("imagePreview");
const btnClearImage = $("btnClearImage");
const btnImageToText = $("btnImageToText");
const visionStatus = $("visionStatus");
const imageText = $("imageText");
const btnClearImageText = $("btnClearImageText");

const btnBuildText = $("btnBuildText");
const btnResetAll = $("btnResetAll");
const outputText = $("outputText");

const exportFormat = $("exportFormat");
const btnExport = $("btnExport");

const printArea = $("printArea");
const printPre = $("printPre");
const printMeta = $("printMeta");

// -------------------- UI helpers --------------------
function setRecUI(isRecording) {
  btnStartRec.disabled = isRecording;
  btnStopRec.disabled = !isRecording;
  recStatus.textContent = isRecording ? "กำลังอัด..." : "พร้อม";
}
function setExportReady(isReady) {
  btnExport.disabled = !isReady;
}
function setVisionStatus(text, mode = "idle") {
  visionStatus.textContent = text;
  // mode kept for future styling
}

// -------------------- Text --------------------
btnClearText.addEventListener("click", () => {
  textInput.value = "";
});

// -------------------- Audio Recording --------------------
function clearRecordedAudio() {
  if (recObjectUrl) URL.revokeObjectURL(recObjectUrl);
  recObjectUrl = null;
  recBlob = null;
  recChunks = [];

  audioPreviewRec.hidden = true;
  audioPreviewRec.removeAttribute("src");
  audioPreviewRec.load();

  btnClearRec.disabled = true;

  if (recStream) {
    recStream.getTracks().forEach((t) => t.stop());
    recStream = null;
  }
}

async function startRecording() {
  if (!hasGetUserMedia || !hasMediaRecorder) {
    showNotice("ไม่รองรับการอัดเสียงในเบราว์เซอร์/อุปกรณ์นี้");
    return;
  }
  hideNotice();
  clearRecordedAudio();

  try {
    recStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const options = {};
    if (MediaRecorder.isTypeSupported("audio/webm")) options.mimeType = "audio/webm";

    recChunks = [];
    recMediaRecorder = new MediaRecorder(recStream, options);

    recMediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recChunks.push(e.data);
    };

    recMediaRecorder.onstop = () => {
      recBlob = new Blob(recChunks, { type: recMediaRecorder.mimeType || "audio/webm" });
      recObjectUrl = URL.createObjectURL(recBlob);

      audioPreviewRec.src = recObjectUrl;
      audioPreviewRec.hidden = false;
      btnClearRec.disabled = false;

      if (recStream) {
        recStream.getTracks().forEach((t) => t.stop());
        recStream = null;
      }
    };

    recMediaRecorder.start();
    setRecUI(true);
  } catch (err) {
    console.error(err);
    showNotice("ไม่สามารถเข้าถึงไมโครโฟนได้ (โปรดอนุญาต Permission)");
    setRecUI(false);
  }
}

function stopRecording() {
  if (recMediaRecorder && recMediaRecorder.state !== "inactive") {
    recMediaRecorder.stop();
  }
  setRecUI(false);
}

btnStartRec.addEventListener("click", startRecording);
btnStopRec.addEventListener("click", stopRecording);
btnClearRec.addEventListener("click", clearRecordedAudio);

// -------------------- Audio Upload --------------------
function clearUploadedAudio() {
  if (upAudioObjectUrl) URL.revokeObjectURL(upAudioObjectUrl);
  upAudioObjectUrl = null;
  upAudioFile = null;

  audioFile.value = "";
  audioPreviewUp.hidden = true;
  audioPreviewUp.removeAttribute("src");
  audioPreviewUp.load();

  btnClearAudioUp.disabled = true;
}

audioFile.addEventListener("change", () => {
  clearUploadedAudio();
  const f = audioFile.files && audioFile.files[0];
  if (!f) return;

  upAudioFile = f;
  upAudioObjectUrl = URL.createObjectURL(f);

  audioPreviewUp.src = upAudioObjectUrl;
  audioPreviewUp.hidden = false;

  btnClearAudioUp.disabled = false;
});

btnClearAudioUp.addEventListener("click", clearUploadedAudio);

// -------------------- Image Upload --------------------
function clearImage() {
  if (imgObjectUrl) URL.revokeObjectURL(imgObjectUrl);
  imgObjectUrl = null;
  imgFile = null;

  imageFile.value = "";
  imageWrap.hidden = true;
  imagePreview.removeAttribute("src");

  btnClearImage.disabled = true;
  btnImageToText.disabled = true;
}

imageFile.addEventListener("change", () => {
  clearImage();

  const f = imageFile.files && imageFile.files[0];
  if (!f) return;

  imgFile = f;
  imgObjectUrl = URL.createObjectURL(f);

  imagePreview.src = imgObjectUrl;
  imageWrap.hidden = false;

  btnClearImage.disabled = false;
  btnImageToText.disabled = false;

  // Reset previous vision output
  imageToTextResult = "";
  imageText.value = "";
  btnClearImageText.disabled = true;
  setVisionStatus("พร้อมรัน Image→Text");
});

btnClearImage.addEventListener("click", () => {
  clearImage();
});

// -------------------- Image → Text (Transformer) --------------------
btnClearImageText.addEventListener("click", () => {
  imageToTextResult = "";
  imageText.value = "";
  btnClearImageText.disabled = true;
  setVisionStatus("ล้างแล้ว");
});

async function ensureCaptionerLoaded() {
  if (captioner) return captioner;
  if (modelLoading) throw new Error("Model is loading");

  modelLoading = true;
  setVisionStatus("กำลังโหลดโมเดล... (ครั้งแรกอาจใช้เวลาสักครู่)");

  // Lazy import Transformers.js (browser)
  // NOTE: Using a pinned major/minor series helps stability in teaching/research demos.
  const mod = await import("https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js");
  tfPipeline = mod.pipeline;

  // Optional env tuning (safe defaults)
  if (mod.env) {
    mod.env.allowLocalModels = false;
    mod.env.useBrowserCache = true;
  }

  // Build pipeline: image-to-text with ONNX web-ready model
  captioner = await tfPipeline("image-to-text", "Xenova/vit-gpt2-image-captioning");
  modelLoading = false;

  setVisionStatus("โมเดลพร้อมใช้งาน");
  return captioner;
}

btnImageToText.addEventListener("click", async () => {
  try {
    if (!imgFile || !imgObjectUrl) {
      setVisionStatus("กรุณาอัปโหลดรูปก่อน");
      return;
    }

    btnImageToText.disabled = true;
    setVisionStatus("กำลังประมวลผลรูป...");

    const cap = await ensureCaptionerLoaded();

    // Use object URL so pipeline can fetch it as an image input
    const results = await cap(imgObjectUrl, { max_new_tokens: 30 });

    // Typical output: [{ generated_text: "..." }]
    const generated = (Array.isArray(results) && results[0] && results[0].generated_text)
      ? results[0].generated_text
      : "";

    imageToTextResult = generated || "(ไม่สามารถสร้างข้อความจากรูปได้)";
    imageText.value = imageToTextResult;

    btnClearImageText.disabled = false;
    setVisionStatus("เสร็จสิ้น");
  } catch (err) {
    console.error(err);
    setVisionStatus("เกิดข้อผิดพลาดในการ Image→Text (ดู console)");
  } finally {
    btnImageToText.disabled = !imgFile;
  }
});

// -------------------- Build output (TEXT only) --------------------
function audioSummaryText() {
  if (recBlob) {
    return `เสียง (อัด): MIME=${recBlob.type || "audio/webm"}, Size=${recBlob.size} bytes`;
  }
  if (upAudioFile) {
    return `เสียง (อัปโหลด): Name=${upAudioFile.name}, MIME=${upAudioFile.type || "audio/*"}, Size=${upAudioFile.size} bytes`;
  }
  return "เสียง: (ไม่มี)";
}

function imageSummaryText() {
  if (imgFile) {
    return `รูปภาพ: Name=${imgFile.name}, MIME=${imgFile.type || "image/*"}, Size=${imgFile.size} bytes`;
  }
  return "รูปภาพ: (ไม่มี)";
}

function buildTextOutput() {
  const createdAt = nowISO();
  const browserHint = isEdge ? "Edge (Chromium)" : (isChrome ? "Chrome" : "Other");

  const lines = [];
  lines.push("MULTIMODAL → TEXT REPORT");
  lines.push(`Timestamp: ${createdAt}`);
  lines.push(`Browser: ${browserHint}`);
  lines.push("------------------------------------------------------------");
  lines.push("");
  lines.push("SECTION A: TEXT (User Input)");
  lines.push(textInput.value ? textInput.value : "(ไม่มีข้อความ)");
  lines.push("");
  lines.push("SECTION B: AUDIO");
  lines.push(audioSummaryText());
  lines.push("Transcription: (ยังไม่ถอดเสียงเป็นข้อความในเวอร์ชันนี้)");
  lines.push("");
  lines.push("SECTION C: IMAGE");
  lines.push(imageSummaryText());
  lines.push(`Image→Text (Transformer): ${imageToTextResult ? imageToTextResult : "(ยังไม่สร้าง/ไม่มีผลลัพธ์)"}`);
  lines.push("");
  lines.push("END OF REPORT");

  latestTextOutput = lines.join("\n");
  outputText.value = latestTextOutput;

  // Prepare print area for PDF
  printMeta.textContent = `Timestamp: ${createdAt}\nBrowser: ${browserHint}`;
  printPre.textContent = latestTextOutput;

  setExportReady(true);
}

btnBuildText.addEventListener("click", buildTextOutput);

// -------------------- Export (TXT / PDF / DOCX) --------------------
async function exportAsTxt(text) {
  downloadText(`multimodal_text_output_${Date.now()}.txt`, text);
}

async function exportAsPdf(text) {
  // html2pdf.js converts element to PDF client-side
  printPre.textContent = text;
  printArea.hidden = false;

  const opt = {
    margin: 10,
    filename: `multimodal_text_output_${Date.now()}.pdf`,
    image: { type: "jpeg", quality: 0.95 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
  };

  await window.html2pdf().set(opt).from(printArea).save();
  printArea.hidden = true;
}

async function exportAsDocx(text) {
  const { Document, Packer, Paragraph, TextRun } = window.docx;

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          children: [new TextRun({ text: "Multimodal → Text Report", bold: true, size: 32 })]
        }),
        new Paragraph({
          children: [new TextRun({ text: `Generated: ${nowISO()}`, size: 20 })]
        }),
        new Paragraph({ text: "" }),
        ...text.split("\n").map(line => new Paragraph({ text: line }))
      ]
    }]
  });

  const blob = await Packer.toBlob(doc);
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = `multimodal_text_output_${Date.now()}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

btnExport.addEventListener("click", async () => {
  if (!latestTextOutput) return;

  const fmt = exportFormat.value;
  try {
    if (fmt === "txt") return await exportAsTxt(latestTextOutput);
    if (fmt === "pdf") return await exportAsPdf(latestTextOutput);
    if (fmt === "docx") return await exportAsDocx(latestTextOutput);
  } catch (err) {
    console.error(err);
    showNotice("เกิดข้อผิดพลาดระหว่างส่งออกไฟล์ (ดู console เพื่อรายละเอียด)");
  }
});

// -------------------- Reset --------------------
function resetAll() {
  textInput.value = "";

  clearRecordedAudio();
  clearUploadedAudio();
  clearImage();

  imageToTextResult = "";
  imageText.value = "";
  btnClearImageText.disabled = true;
  setVisionStatus("ยังไม่รัน");

  latestTextOutput = "";
  outputText.value = "";
  setExportReady(false);

  printArea.hidden = true;

  if ((isChrome || isEdge) && hasMediaRecorder && hasGetUserMedia) hideNotice();
}

btnResetAll.addEventListener("click", resetAll);

// Initial state
setRecUI(false);
setExportReady(false);
setVisionStatus("ยังไม่รัน");
btnClearImageText.disabled = true;
