const state = {
  fileName: "",
  originalBytes: null,
  pageCount: 0,
  outputUrl: "",
  outputBytes: null,
};

const elements = {
  pdfInput: document.querySelector("#pdfInput"),
  dropzone: document.querySelector("#dropzone"),
  fileState: document.querySelector("#fileState"),
  pageCountBadge: document.querySelector("#pageCountBadge"),
  pageNumberInput: document.querySelector("#pageNumberInput"),
  copiesInput: document.querySelector("#copiesInput"),
  addButton: document.querySelector("#addButton"),
  sequenceInput: document.querySelector("#sequenceInput"),
  appendAllButton: document.querySelector("#appendAllButton"),
  clearOrderButton: document.querySelector("#clearOrderButton"),
  resetButton: document.querySelector("#resetButton"),
  chips: document.querySelector("#chips"),
  orderSummary: document.querySelector("#orderSummary"),
  statusMessage: document.querySelector("#statusMessage"),
  previewButton: document.querySelector("#previewButton"),
  goButton: document.querySelector("#goButton"),
  printFrame: document.querySelector("#printFrame"),
};

function parseSequence() {
  return elements.sequenceInput.value
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => Number(value));
}

function setSequence(pages) {
  elements.sequenceInput.value = pages.join(" ");
  updateUi();
}

function isValidPage(page) {
  return Number.isInteger(page) && page >= 1 && page <= state.pageCount;
}

function clearGeneratedPdf() {
  if (state.outputUrl) {
    URL.revokeObjectURL(state.outputUrl);
    state.outputUrl = "";
  }

  state.outputBytes = null;
  elements.printFrame.removeAttribute("src");
  elements.printFrame.hidden = true;
}

function setStatus(message, type = "neutral") {
  elements.statusMessage.textContent = message;
  elements.statusMessage.dataset.type = type;
}

function loadPdfPreview(url) {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = () => {
      if (resolved) {
        return;
      }

      resolved = true;
      resolve();
    };

    elements.printFrame.addEventListener("load", finish, { once: true });
    elements.printFrame.src = url;
    elements.printFrame.hidden = false;
    window.setTimeout(finish, 1200);
  });
}

function formatFileSize(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function renderChips(pages) {
  elements.chips.replaceChildren();

  if (pages.length === 0) {
    const empty = document.createElement("span");
    empty.className = "drop-hint";
    empty.textContent = "Added pages will appear here.";
    elements.chips.append(empty);
    return;
  }

  pages.forEach((page, index) => {
    const chip = document.createElement("span");
    chip.className = `chip${isValidPage(page) ? "" : " invalid"}`;
    chip.textContent = page;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.title = `Remove page ${page}`;
    removeButton.setAttribute("aria-label", `Remove page ${page}`);
    removeButton.textContent = "x";
    removeButton.addEventListener("click", () => {
      const nextPages = parseSequence();
      nextPages.splice(index, 1);
      setSequence(nextPages);
    });

    chip.append(removeButton);
    elements.chips.append(chip);
  });
}

function updateUi() {
  const pages = parseSequence();
  const validPages = pages.filter(isValidPage);
  const invalidCount = pages.length - validPages.length;
  const hasPdf = Boolean(state.originalBytes);
  const canGenerate = hasPdf && pages.length > 0 && invalidCount === 0;

  elements.pageCountBadge.textContent =
    state.pageCount === 1 ? "1 page" : `${state.pageCount} pages`;
  elements.pageNumberInput.max = state.pageCount || "";
  elements.previewButton.disabled = !canGenerate;
  elements.goButton.disabled = !canGenerate;

  if (!hasPdf) {
    elements.orderSummary.textContent = "No PDF loaded";
  } else if (pages.length === 0) {
    elements.orderSummary.textContent = "No pages queued";
  } else if (invalidCount > 0) {
    elements.orderSummary.textContent = `${invalidCount} invalid page${invalidCount === 1 ? "" : "s"}`;
  } else {
    elements.orderSummary.textContent = `${pages.length} page${pages.length === 1 ? "" : "s"} queued`;
  }

  renderChips(pages);
}

async function loadPdf(file) {
  const looksLikePdf =
    file && (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));

  if (!looksLikePdf) {
    setStatus("Choose a PDF file.", "error");
    return;
  }

  if (!window.PDFLib) {
    setStatus("PDF tools did not load. Check your internet connection and refresh.", "error");
    return;
  }

  clearGeneratedPdf();
  setStatus("Reading PDF...");

  try {
    const bytes = await file.arrayBuffer();
    const pdf = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });

    state.fileName = file.name;
    state.originalBytes = bytes;
    state.pageCount = pdf.getPageCount();

    elements.fileState.textContent = `${file.name} - ${state.pageCount} page${state.pageCount === 1 ? "" : "s"} - ${formatFileSize(file.size)}`;
    elements.sequenceInput.value = "";
    elements.pageNumberInput.value = "";
    setStatus("Add page numbers in the order you want them printed.");
  } catch (error) {
    state.fileName = "";
    state.originalBytes = null;
    state.pageCount = 0;
    elements.fileState.textContent = "No file selected";
    setStatus(`Could not read this PDF. ${error.message}`, "error");
  }

  updateUi();
}

function addPagesFromControls() {
  const page = Number(elements.pageNumberInput.value);
  const copies = Number(elements.copiesInput.value || 1);

  if (!state.pageCount) {
    setStatus("Upload a PDF before adding pages.", "error");
    return;
  }

  if (!isValidPage(page)) {
    setStatus(`Enter a page number from 1 to ${state.pageCount}.`, "error");
    elements.pageNumberInput.focus();
    return;
  }

  if (!Number.isInteger(copies) || copies < 1) {
    setStatus("Copies must be 1 or more.", "error");
    elements.copiesInput.focus();
    return;
  }

  const pages = parseSequence();
  pages.push(...Array.from({ length: copies }, () => page));
  setSequence(pages);
  elements.pageNumberInput.select();
  setStatus(`Added page ${page}${copies > 1 ? ` ${copies} times` : ""}.`);
}

async function generatePdf() {
  if (!window.PDFLib) {
    throw new Error("PDF tools did not load. Check your internet connection and refresh.");
  }

  const pages = parseSequence();
  const invalidPages = pages.filter((page) => !isValidPage(page));

  if (!state.originalBytes) {
    throw new Error("Upload a PDF first.");
  }

  if (pages.length === 0) {
    throw new Error("Add at least one page number.");
  }

  if (invalidPages.length > 0) {
    throw new Error(`Invalid pages: ${invalidPages.join(", ")}`);
  }

  setStatus("Generating reordered PDF...");
  const sourcePdf = await PDFLib.PDFDocument.load(state.originalBytes, {
    ignoreEncryption: true,
  });
  const outputPdf = await PDFLib.PDFDocument.create();

  for (const pageNumber of pages) {
    const [copiedPage] = await outputPdf.copyPages(sourcePdf, [pageNumber - 1]);
    outputPdf.addPage(copiedPage);
  }

  const outputBytes = await outputPdf.save();
  const blob = new Blob([outputBytes], { type: "application/pdf" });

  clearGeneratedPdf();
  state.outputBytes = outputBytes;
  state.outputUrl = URL.createObjectURL(blob);
  await loadPdfPreview(state.outputUrl);

  setStatus(`Generated ${pages.length} page${pages.length === 1 ? "" : "s"} from ${state.fileName}.`);
  return state.outputUrl;
}

async function previewPdf() {
  try {
    await generatePdf();
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };

    return entities[char];
  });
}

async function renderPrintImages(pdfBytes) {
  if (!window.pdfjsLib) {
    throw new Error("Print renderer did not load. Check your internet connection and refresh.");
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice(0) });
  const pdf = await loadingTask.promise;
  const images = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: context, viewport }).promise;
    images.push({
      src: canvas.toDataURL("image/png"),
      width: viewport.width,
      height: viewport.height,
    });
  }

  return images;
}

function writePrintDocument(printWindow, images) {
  const pages = images
    .map(
      (image, index) => `
        <section class="print-page">
          <img
            src="${image.src}"
            width="${Math.round(image.width)}"
            height="${Math.round(image.height)}"
            alt="Page ${index + 1}"
          >
        </section>`,
    )
    .join("");

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(state.fileName || "Print Manager")}</title>
    <style>
      html,
      body {
        margin: 0;
        background: #ffffff;
      }

      .print-page {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        break-after: page;
        page-break-after: always;
      }

      .print-page:last-child {
        break-after: auto;
        page-break-after: auto;
      }

      img {
        display: block;
        max-width: 100%;
        max-height: 100vh;
      }

      @media print {
        @page {
          margin: 0;
        }

        .print-page {
          height: 100vh;
          min-height: 100vh;
        }
      }
    </style>
  </head>
  <body>
    ${pages}
    <script>
      window.addEventListener("load", () => {
        window.focus();
        window.print();
      });
    <\/script>
  </body>
</html>`);
  printWindow.document.close();
}

async function printPdf() {
  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    setStatus("Allow popups for this page so the print screen can open.", "error");
    return;
  }

  try {
    await generatePdf();
    setStatus("Preparing print screen...");
    printWindow.document.write("<p>Preparing print screen...</p>");
    const images = await renderPrintImages(state.outputBytes);
    writePrintDocument(printWindow, images);
    setStatus("Print dialog opened for the reordered PDF.");
  } catch (error) {
    if (printWindow) {
      printWindow.close();
    }

    setStatus(error.message, "error");
  }
}

function resetAll() {
  clearGeneratedPdf();
  state.fileName = "";
  state.originalBytes = null;
  state.pageCount = 0;
  elements.pdfInput.value = "";
  elements.pageNumberInput.value = "";
  elements.copiesInput.value = "1";
  elements.sequenceInput.value = "";
  elements.fileState.textContent = "No file selected";
  setStatus("Upload a PDF and add page numbers to begin.");
  updateUi();
}

elements.pdfInput.addEventListener("change", (event) => {
  loadPdf(event.target.files[0]);
});

elements.dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  elements.dropzone.classList.add("dragging");
});

elements.dropzone.addEventListener("dragleave", () => {
  elements.dropzone.classList.remove("dragging");
});

elements.dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  elements.dropzone.classList.remove("dragging");
  loadPdf(event.dataTransfer.files[0]);
});

elements.addButton.addEventListener("click", addPagesFromControls);
elements.pageNumberInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    addPagesFromControls();
  }
});

elements.appendAllButton.addEventListener("click", () => {
  if (!state.pageCount) {
    setStatus("Upload a PDF before adding pages.", "error");
    return;
  }

  setSequence(Array.from({ length: state.pageCount }, (_, index) => index + 1));
  setStatus("Added all pages in normal order.");
});

elements.clearOrderButton.addEventListener("click", () => {
  elements.sequenceInput.value = "";
  setStatus("Print order cleared.");
  updateUi();
});

elements.resetButton.addEventListener("click", resetAll);
elements.sequenceInput.addEventListener("input", updateUi);
elements.previewButton.addEventListener("click", previewPdf);
elements.goButton.addEventListener("click", printPdf);

updateUi();
