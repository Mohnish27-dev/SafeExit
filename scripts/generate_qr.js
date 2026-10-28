const fs = require('fs');
const path = require('path');
const qr = require(path.join(__dirname, '../safeexit/node_modules/qr.js'));

function createSvg(url) {
  const q = qr(url, { errorCorrectLevel: qr.ErrorCorrectLevel.M });
  const size = q.modules.length;
  let pathD = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (q.modules[r][c]) {
        pathD += `M${c},${r}h1v1h-1z `;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">
    <rect width="${size}" height="${size}" fill="#ffffff"/>
    <path d="${pathD.trim()}" fill="#1e1b4b"/>
  </svg>`;
}

const svg = createSvg('https://erp.nitp.ac.in/safeexit');
const outPath = path.join(__dirname, '../docs/safeexit_qr.svg');
fs.writeFileSync(outPath, svg, 'utf8');
console.log('SUCCESS: Written QR SVG to', outPath);
