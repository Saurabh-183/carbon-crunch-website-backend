import fs from 'fs';
import path from 'path';

const loadJson = (filename) => JSON.parse(fs.readFileSync(filename, 'utf-8'));

const scope1 = loadJson('scope1EF.json');
const scope2 = loadJson('scope2EF.json');
const scope3 = loadJson('scope3EF.json');

const config = {
  useTypes: [],
  sources: {},
  units: {},
  emissionFactors: {}
};

function processScope(data, scopeNum) {
  for (const useType of Object.keys(data)) {
    if (useType === 'scope') continue;
    
    if (!config.useTypes.includes(useType)) {
      config.useTypes.push(useType);
    }
    if (!config.sources[useType]) {
      config.sources[useType] = [];
    }

    const traverse = (node, currentPath) => {
      if (typeof node !== 'object' || node === null) return;
      
      if (node.emissionFactor !== undefined) return;
      
      let isSourceNode = false;
      for (const key of Object.keys(node)) {
        if (node[key] && typeof node[key] === 'object' && node[key].emissionFactor !== undefined) {
          isSourceNode = true;
          break;
        }
      }

      if (isSourceNode) {
        const sourceName = currentPath;
        if (!config.sources[useType].includes(sourceName)) {
          config.sources[useType].push(sourceName);
        }
        if (!config.units[sourceName]) {
          config.units[sourceName] = [];
        }
        
        for (const unitName of Object.keys(node)) {
          if (!config.units[sourceName].includes(unitName)) {
            config.units[sourceName].push(unitName);
          }
          const factorKey = `${sourceName}_${unitName}`;
          config.emissionFactors[factorKey] = {
            factor: node[unitName].emissionFactor,
            unit: node[unitName].unit,
            scope: scopeNum
          };
        }
        return;
      }
      
      for (const key of Object.keys(node)) {
        if (key === 'label' || key === 'categories') {
           if (key === 'categories') traverse(node[key], currentPath);
           continue;
        }
        traverse(node[key], key);
      }
    };
    
    traverse(data[useType], '');
  }
}

processScope(scope1, 1);
processScope(scope2, 2);
processScope(scope3, 3);

fs.writeFileSync('src/controllers/generated_config.json', JSON.stringify(config, null, 2));
console.log("Config generated!");
