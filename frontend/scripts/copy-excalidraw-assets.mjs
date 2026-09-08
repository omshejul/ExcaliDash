import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");

// In 0.18.0 the old excalidraw-assets / excalidraw-assets-dev directories were
// replaced by dist/prod and dist/dev.  Only the fonts sub-directory needs to be
// copied to the public / dist output so that Excalidraw can load them at runtime
// via window.EXCALIDRAW_ASSET_PATH (which is set to "/" in index.html).
const EXCALIDRAW_DIST_DIR = path.join(
  frontendRoot,
  "node_modules",
  "@excalidraw",
  "excalidraw",
  "dist"
);
const INTER_FONT_DIR = path.join(
  frontendRoot,
  "node_modules",
  "@fontsource",
  "inter",
  "files"
);

const INTER_NORMAL_FONT_FILES = {
  "Nunito-Regular-XRXI3I6Li01BKofiOc5wtlZ2di8HDIkhdTk3j6zbXWjgevT5.woff2": "inter-cyrillic-ext-500-normal.woff2",
  "Nunito-Regular-XRXI3I6Li01BKofiOc5wtlZ2di8HDIkhdTA3j6zbXWjgevT5.woff2": "inter-cyrillic-500-normal.woff2",
  "Nunito-Regular-XRXI3I6Li01BKofiOc5wtlZ2di8HDIkhdTs3j6zbXWjgevT5.woff2": "inter-vietnamese-500-normal.woff2",
  "Nunito-Regular-XRXI3I6Li01BKofiOc5wtlZ2di8HDIkhdTo3j6zbXWjgevT5.woff2": "inter-latin-ext-500-normal.woff2",
  "Nunito-Regular-XRXI3I6Li01BKofiOc5wtlZ2di8HDIkhdTQ3j6zbXWjgeg.woff2": "inter-latin-500-normal.woff2",
};

// src relative to EXCALIDRAW_DIST_DIR  →  dest name inside the target root
const ASSET_COPIES = [
  { src: path.join("prod", "fonts"), dest: "fonts" },
];

const copyDir = async (src, dest) => {
  await fs.rm(dest, { recursive: true, force: true });
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.cp(src, dest, { recursive: true });
};

const replaceFontReferences = async (dir) => {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await replaceFontReferences(entryPath);
    } else if (entry.name.endsWith(".js")) {
      let contents = await fs.readFile(entryPath, "utf8");
      for (const [nunitoName, interName] of Object.entries(INTER_NORMAL_FONT_FILES)) {
        contents = contents.replaceAll(nunitoName, interName);
      }
      await fs.writeFile(entryPath, contents);
    }
  }
};

const getTargets = () => {
  const args = new Set(process.argv.slice(2));
  const targets = [];
  if (args.has("--public")) targets.push("public");
  if (args.has("--dist")) targets.push("dist");
  return targets.length > 0 ? targets : ["dist"];
};

const main = async () => {
  const targets = getTargets();

  for (const targetName of targets) {
    const targetRoot = path.join(frontendRoot, targetName);
    await fs.mkdir(targetRoot, { recursive: true });

    for (const { src: srcRel, dest: destName } of ASSET_COPIES) {
      const src = path.join(EXCALIDRAW_DIST_DIR, srcRel);
      const dest = path.join(targetRoot, destName);

      try {
        await fs.access(src);
      } catch (err) {
        console.error(`[copy-excalidraw-assets] Missing source dir: ${src}`);
        throw err;
      }

      await copyDir(src, dest);

      if (destName === "fonts") {
        const normalFontDir = path.join(dest, "Nunito");
        for (const [nunitoName, interName] of Object.entries(INTER_NORMAL_FONT_FILES)) {
          await fs.copyFile(
            path.join(INTER_FONT_DIR, interName),
            path.join(normalFontDir, targetName === "dist" ? interName : nunitoName)
          );
        }
        if (targetName === "dist") {
          await replaceFontReferences(path.join(targetRoot, "assets"));
        }
      }

      console.log(`[copy-excalidraw-assets] Copied ${srcRel} -> ${targetName}/${destName}`);
    }
  }
};

await main();
