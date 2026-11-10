#!/usr/bin/env node
/**
 * Offline-compatible production build script for NEEV_MICROFINANCE_CLONE/frontend.
 * Packages index.html, centralized CSS tokens, compiled application bundle,
 * Font Awesome CDN, and icon injection script into both dist/ and bundle_static/.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cssContent = fs.readFileSync(path.join(__dirname, 'src/styles/tokens.css'), 'utf-8');
const appJsContent = fs.readFileSync(path.join(__dirname, 'src/bundle_entry.js'), 'utf-8');

// Icon files
const iconsCssPath = path.join(__dirname, 'public/assets/icons.css');
const iconsJsPath = path.join(__dirname, 'public/assets/icons.js');
const iconsCssContent = fs.existsSync(iconsCssPath) ? fs.readFileSync(iconsCssPath, 'utf-8') : '';
const iconsJsContent = fs.existsSync(iconsJsPath) ? fs.readFileSync(iconsJsPath, 'utf-8') : '';

// Member module parts
const memberPartPath = path.join(__dirname, 'src/parts/memberUmang.js');
const memberPartContent = fs.existsSync(memberPartPath) ? fs.readFileSync(memberPartPath, 'utf-8') : '';
const planPartPath = path.join(__dirname, 'src/parts/planUmang.js');
const planPartContent = fs.existsSync(planPartPath) ? fs.readFileSync(planPartPath, 'utf-8') : '';
const docsPartPath = path.join(__dirname, 'src/parts/memberDocsUmang.js');
const docsPartContent = fs.existsSync(docsPartPath) ? fs.readFileSync(docsPartPath, 'utf-8') : '';
const kycPartPath = path.join(__dirname, 'src/parts/memberKycUmang.js');
const kycPartContent = fs.existsSync(kycPartPath) ? fs.readFileSync(kycPartPath, 'utf-8') : '';
const detailsPartPath = path.join(__dirname, 'src/parts/memberDetailsUmang.js');
const detailsPartContent = fs.existsSync(detailsPartPath) ? fs.readFileSync(detailsPartPath, 'utf-8') : '';
const loanDetailPartPath = path.join(__dirname, 'src/parts/loanDetailUmang.js');
const loanDetailPartContent = fs.existsSync(loanDetailPartPath) ? fs.readFileSync(loanDetailPartPath, 'utf-8') : '';
const topupPartPath = path.join(__dirname, 'src/parts/loanTopupUmang.js');
const topupPartContent = fs.existsSync(topupPartPath) ? fs.readFileSync(topupPartPath, 'utf-8') : '';
const individualPartPath = path.join(__dirname, 'src/parts/individualLoanUmang.js');
const individualPartContent = fs.existsSync(individualPartPath) ? fs.readFileSync(individualPartPath, 'utf-8') : '';
const custLoanPartPath = path.join(__dirname, 'src/parts/customerLoanDetailsUmang.js');
const custLoanPartContent = fs.existsSync(custLoanPartPath) ? fs.readFileSync(custLoanPartPath, 'utf-8') : '';
const rolePermPartPath = path.join(__dirname, 'src/parts/rolePermissionUmang.js');
const rolePermPartContent = fs.existsSync(rolePermPartPath) ? fs.readFileSync(rolePermPartPath, 'utf-8') : '';
const partsContent = memberPartContent + '\n;\n' + planPartContent + '\n;\n' + docsPartContent + '\n;\n' + kycPartContent + '\n;\n' + detailsPartContent + '\n;\n' + loanDetailPartContent + '\n;\n' + topupPartContent + '\n;\n' + individualPartContent + '\n;\n' + custLoanPartContent + '\n;\n' + rolePermPartContent;

// Content hash
const buildHash = crypto.createHash('sha256')
  .update(cssContent + appJsContent + partsContent + iconsCssContent + iconsJsContent)
  .digest('hex')
  .slice(0, 10);

const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NEEV 4D | Microfinance Management Software</title>
  <link rel="stylesheet" href="/assets/app.css?v=${buildHash}" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" crossorigin="anonymous" />
  <link rel="stylesheet" href="/assets/icons.css?v=${buildHash}" />
</head>
<body>
  <div id="root"></div>
  <script src="/assets/app.js?v=${buildHash}"></script>
  <script src="/assets/icons.js?v=${buildHash}" defer></script>
</body>
</html>
`;

for (const outFolder of ['dist', 'bundle_static']) {
  const outDir = path.join(__dirname, outFolder);
  const assetsDir = path.join(outDir, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(path.join(assetsDir, 'app.css'), cssContent, 'utf-8');
  fs.writeFileSync(path.join(assetsDir, 'app.js'), appJsContent + '\n;\n' + partsContent, 'utf-8');
  fs.writeFileSync(path.join(assetsDir, 'icons.css'), iconsCssContent, 'utf-8');
  fs.writeFileSync(path.join(assetsDir, 'icons.js'), iconsJsContent, 'utf-8');
  fs.writeFileSync(path.join(outDir, 'index.html'), indexHtml, 'utf-8');
}

console.log('✓ Frontend production bundle built successfully (index.html, assets/app.css, assets/app.js, assets/icons.css, assets/icons.js)');
