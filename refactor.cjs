const fs = require('fs');
const path = require('path');


function findFiles(dir, ext, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      findFiles(filePath, ext, fileList);
    } else if (filePath.endsWith(ext)) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const files = [...findFiles('./src', '.tsx'), ...findFiles('./src', '.ts')];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let newContent = content;
  
  if (file.includes('Step3Negotiation.tsx')) {
    newContent = newContent.replace(
      /import ragDatabase from '..\/..\/data\/rag_database\.json';/g,
      "import ragDatabase from '../../data';\nimport ragHotel from '../../data/rag_hotel.json';"
    );
    newContent = newContent.replace(
      /ragDatabase\.filter\(d => d\.type === 'hotel'\)/g,
      "ragHotel"
    );
  } else {
    newContent = newContent.replace(
      /import ragDatabase from '..\/..\/data\/rag_database\.json';/g,
      "import ragDatabase from '../../data';"
    );
    newContent = newContent.replace(
      /import ragDatabase from '..\/data\/rag_database\.json';/g,
      "import ragDatabase from '../data';"
    );
    newContent = newContent.replace(
      /import ragDatabase from '\.\/data\/rag_database\.json';/g,
      "import ragDatabase from './data';"
    );
  }

  if (content !== newContent) {
    fs.writeFileSync(file, newContent, 'utf8');
    console.log(`Updated ${file}`);
  }
}
