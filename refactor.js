import fs from 'fs';
import path from 'path';

const filesToUpdate = [
  'index.js',
  'database/db.js',
  'models/post.js',
  'models/bookDemo.js',
  'src/routes/authRoutes.js',
  'src/routes/ghgRoutes.js',
  'src/models/EmissionFactor.js',
  'src/models/Otp.js',
  'src/models/User.js',
  'src/controllers/authController.js',
  'src/controllers/ghgController.js'
];

filesToUpdate.forEach(file => {
  const fullPath = path.join(process.cwd(), file);
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf8');
    
    // Replace const X = require('Y') with import X from 'Y'
    content = content.replace(/const\s+([a-zA-Z0-9_{},\s]+)\s*=\s*require\((['"`])(.*?)\2\);?/g, (match, p1, p2, p3) => {
      // For local imports in ES modules, we often need .js extension if it's missing and not a directory index
      let importPath = p3;
      if (importPath.startsWith('.') && !importPath.endsWith('.js')) {
          importPath += '.js';
      }
      return `import ${p1} from '${importPath}';`;
    });
    
    // Replace module.exports = X with export default X
    content = content.replace(/module\.exports\s*=\s*(.*?);?/g, 'export default $1;');

    // Handle require('./database/db')
    content = content.replace(/require\((['"`])(.*?)\1\);?/g, (match, p1, p2) => {
      let importPath = p2;
      if (importPath.startsWith('.') && !importPath.endsWith('.js')) {
          importPath += '.js';
      }
      return `import '${importPath}';`;
    });
    
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`Updated ${file}`);
  }
});
