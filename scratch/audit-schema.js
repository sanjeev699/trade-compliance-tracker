const fs = require('fs');
const path = require('path');

function getFiles(dir, filesList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getFiles(filePath, filesList);
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      filesList.push(filePath);
    }
  }
  return filesList;
}

const allFiles = [...getFiles('app'), ...getFiles('components'), ...getFiles('lib')];
const lines = [];
for (const file of allFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  content.split('\n').forEach((line, i) => {
    if (line.includes('supabase.from') || line.includes('.from(') || line.includes('.select(') || line.includes('.insert(') || line.includes('.update(')) {
      lines.push(`${file}:${i + 1}: ${line.trim()}`);
    }
  });
}

fs.writeFileSync('scratch/queries.txt', lines.join('\n'));
console.log('Saved to scratch/queries.txt');
