import { pending, run } from "./index";
import { compressSync, decompressSync } from "fflate";

const filesInput = <HTMLInputElement>document.getElementById("files")!;
const previewer = document.getElementById("previewer")!;
const previewerCount = document.getElementById("previewer-count")!;

let files: File[] = [];

const bytesToSize = (bytes: number) => {
	  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
	  if (bytes === 0) return "0 Byte";
	  const i = Math.floor(Math.log(bytes) / Math.log(1024));
	  return bytes / Math.pow(1024, i) + " " + sizes[i];
};

const compress = <HTMLInputElement>document.getElementById("compress")!;

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

  files = [...files, ...newFiles];

  previewerCount.innerText = `${files.length} files to inscribe`;

  for (let file of newFiles) {
    const div = document.createElement("div");
    div.innerHTML = `<a id="${file.name}" href="#" class="remove">[x]</a> - ${file.name} - ${bytesToSize(file.size)} bytes - ${file.type}<hr />`;
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
    });
  }
});

document.getElementById("run")!.addEventListener("click", () => {
  const address = <HTMLInputElement>document.getElementById("taproot_address")!;

  run({
    log: (message: string) => {
      const log = document.getElementById("log")!;
      if (message.includes('i0') && !compress.checked) {
        log.innerHTML += `Tx ID: ${message.replace('i0', '')}; after tx confirmation you can view it: <a target="_blank" href="https://ordinals.com/content/${message}">https://ordinals.com/content/${message}</a><br>`;
        return
      } else if (message.includes('i0') && compress.checked) {
        log.innerHTML += `Tx ID: ${message.replace('i0', '')}; after tx confirmation you can view it on our experimental viewer: <a target="_blank" href="https://ordinals.com/content/7b9cdb349d8a75152834437f6453b235d1884c188f4428d69db4b26fd3048ccbi0?q=${message}">https://ordinals.com/content/7b9cdb349d8a75152834437f6453b235d1884c188f4428d69db4b26fd3048ccbi0?q=${message}</a>` + "<br>";
        return
      }
      log.innerHTML = message + "<br>";
    },
    address: address.value.trim(),
    tippingAddress:
      "bc1psupdj48keuw4s2zwmf456h8l2zvh66kcj858rdunvf0490ldj2uqskmta4",
    files,
    tip: 1000,
  });
});

pending((message: string) => {
  const log = document.getElementById("log")!;
  log.innerHTML = message + "<br>";
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
};

main().catch((err) => console.error(err));
