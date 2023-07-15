import { ParsedFile, base64ToHex, encodeBase64, fileToSha256Hex, pending, run } from "./index";
import { compressSync, decompressSync } from "fflate";

const filesInput = <HTMLInputElement>document.getElementById("files")!;
const previewer = document.getElementById("previewer")!;
const previewerCount = document.getElementById("previewer-count")!;

let files: ParsedFile[] = localStorage.getItem("files") !== null ? JSON.parse(localStorage.getItem("files")!) : [];

const bytesToSize = (bytes: number) => {
	  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
	  if (bytes === 0) return "0 Byte";
	  const i = Math.floor(Math.log(bytes) / Math.log(1024));
	  return bytes / Math.pow(1024, i) + " " + sizes[i];
};

const compress = <HTMLInputElement>document.getElementById("compress")!;

const network = <HTMLInputElement>document.getElementById("mainnet")!;

const showFiles = (parsedFiles: ParsedFile[]) => {
  previewer.innerHTML = "";
  previewerCount.innerText = `${files.length} files to inscribe`;

  for (let file of parsedFiles) {
    const div = document.createElement("div");
    div.innerHTML = `<a id="${file.name}" href="#" class="remove">[x]</a> - ${file.name} - ${file.size && bytesToSize(file.size)} bytes - ${file.mimetype}<hr />`;
    previewer.appendChild(div);
  }

  const remove = document.querySelectorAll<HTMLButtonElement>(".remove");

  for (let button of remove) {
    button.addEventListener("click", (e) => {
      e.preventDefault();
      const id = button.id;
      const file = files.find((f) => f.name === id);
      if (!file) return;
      files = files.filter((f) => f.name !== id);
      previewer.removeChild(button.parentElement!);
      previewerCount.innerText = `${files.length} files to inscribe`;
      localStorage.setItem("files", JSON.stringify(files));
    });
  }
};

if (files.length > 0) {
  showFiles(files);
}

filesInput.addEventListener("change", async () => {
  if (!filesInput.files || filesInput.files.length === 0) return;

  let newFiles: File[];

  if (compress.checked) {
    newFiles = await Promise.all(
      Array.from(filesInput.files).map(async (f) => {
        const arrayBuffer = await f.arrayBuffer();
        const compressed = await compressSync(new Uint8Array(arrayBuffer));
        return new File([compressed], `${f.name}.gz`, { type: 'application/x-gzip' });
      })
    );
  } else {
    newFiles = Array.from(filesInput.files);
  }
  
  // clear input
  filesInput.value = "";

  const parsedFiles: ParsedFile[] = [...files];

  for (let file of newFiles) {
    if (file.size >= 350000) {
        alert("One of your desired inscriptions exceeds the maximum of 350kb.")
        break;
    }
    let mimetype = file.type;
    if (mimetype.includes("text/plain")) {
        mimetype += ";charset=utf-8";
    }
    const b64 = await encodeBase64(file);
    let base64 = b64.substring(b64.indexOf("base64,") + 7);
    let hex = base64ToHex(base64);

    let sha256 = await fileToSha256Hex(file);

    parsedFiles.push({
        name: file.name,
        hex: hex,
        mimetype: mimetype,
        sha256: sha256.replace('0x', ''),
        size: file.size,
        compressed: compress.checked
    });
  }

  files = parsedFiles;

  localStorage.setItem("files", JSON.stringify(parsedFiles));

  showFiles(parsedFiles)
});

const showLog = (message: string, isTx?: boolean) => {
  const log = document.getElementById("log")!;
      if (isTx) {
        log.innerHTML = ''
        const result = document.getElementById("result")!;
        if (files[0].compressed) {
          result.innerHTML += `Tx ID: ${message.replace('i0', '')}; after tx confirmation you can view it on our <a target="_blank" href="https://ordinals.com/content/7b9cdb349d8a75152834437f6453b235d1884c188f4428d69db4b26fd3048ccbi0?q=${message}">experimental viewer</a>` + "<br><br>";
        } else {
          result.innerHTML += `Tx ID: ${message.replace('i0', '')}; after tx confirmation you can view it on <a target="_blank" href="https://ordinals.com/content/${message}">ordinals content</a>` + "<br><br>";
        }
        files.shift();
        localStorage.setItem("files", JSON.stringify(files));
      } else {
        log.innerHTML = message + "<br>";
      }
}

document.getElementById("run")!.addEventListener("click", () => {
  const address = <HTMLInputElement>document.getElementById("taproot_address")!;

  run({
    log: showLog,
    address: address.value.trim(),
    tippingAddress:
      "bc1psupdj48keuw4s2zwmf456h8l2zvh66kcj858rdunvf0490ldj2uqskmta4",
    files,
    tip: 1000,
    network: network.checked ? "mainnet" : "testnet",
  });
});

document.getElementById("x")!.addEventListener("click", (e) => {
  e.preventDefault();
  localStorage.removeItem("pending");
  const log = document.getElementById("log")!;
  log.innerHTML = "Old transaction is removed";
});

const params = new URLSearchParams(window.location.search);
const q = params.get("q");

const main = async () => {
  if (q !== null) {
    const res = await fetch(q);
    const mimetype = res.headers.get("content-type");
    if (mimetype === null) return;
    const isZip = mimetype.includes("zip");

    if (isZip) {
      const buf = await res.arrayBuffer();
      let decompressed;
      try {
        decompressed = decompressSync(new Uint8Array(buf));
      } catch (e) {
        decompressed = new Uint8Array(buf);
      }
      if (mimetype === null) {
        throw new Error("No content-type header");
      }
      document.open();
      document.write(new TextDecoder().decode(decompressed));
      document.close();
      return;
    }
  }

  pending(showLog);
};

main().catch((err) => console.error(err));
