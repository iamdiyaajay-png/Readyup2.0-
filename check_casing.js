/* eslint-env node */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function checkDirectory(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      checkDirectory(filePath);
    } else if (file.endsWith('.js') || file.endsWith('.jsx')) {
      checkFile(filePath);
    }
  }
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const importRegex = /import\s+.*?\s+from\s+['"](.*?)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    if (importPath.startsWith('.')) {
      const absoluteImportPath = path.resolve(path.dirname(filePath), importPath);
      // We need to resolve extensions like .js, .jsx, .css, etc.
      const extensions = ['', '.js', '.jsx', '.css', '.svg'];
      let found = false;
      let actualName = null;
      let requestedName = null;
      
      for (const ext of extensions) {
        const fullPath = absoluteImportPath + ext;
        const dir = path.dirname(fullPath);
        const base = path.basename(fullPath);
        
        try {
          const filesInDir = fs.readdirSync(dir);
          if (filesInDir.includes(base)) {
            found = true;
            break;
          } else {
             // Check if it exists with different casing
             const lowerBase = base.toLowerCase();
             const matchingFile = filesInDir.find(f => f.toLowerCase() === lowerBase);
             if (matchingFile) {
               console.log(`CASE MISMATCH in ${filePath}:`);
               console.log(`  Imported as: ${base}`);
               console.log(`  Actual file: ${matchingFile}`);
               found = true;
               break;
             }
          }
        } catch (e) {
          // directory might not exist, ignore
        }
      }
    }
  }
}

checkDirectory(path.join(__dirname, 'src'));
console.log('Check complete.');
