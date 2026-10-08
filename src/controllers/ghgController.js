import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.join(__dirname, 'generated_config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

export const getConfig = async (req, res) => {
  try {
    // Send everything except emissionFactors which are huge and not needed for just dropdowns
    // CalculatorView expects emissionFactors if needed? No, wait. 
    // CalculatorView expects useTypes, sources, units, and maybe emissionFactors.
    // In original code: res.json({ ...config, emissionFactors: emissionFactorsMap });
    // It's fine to send the whole config which includes emissionFactors, because CalculatorView might not even use them directly, but just in case.
    res.json(config);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch configuration' });
  }
};

export const calculate = async (req, res) => {
  try {
    const { entries } = req.body;
    
    if (!entries || !Array.isArray(entries)) {
      return res.status(400).json({ error: 'Entries array is required' });
    }

    const { emissionFactors } = config;

    let results = [];
    let totals = { scope1: 0, scope2: 0, scope3: 0, total: 0 };

    for (const entry of entries) {
      const { useType, source, quantity, unit } = entry;
      
      const factorKey = `${source}_${unit}`;
      const efData = emissionFactors[factorKey];
      
      if (!efData) {
        return res.status(400).json({ error: `We couldn't calculate emissions for this combination (${source} with unit ${unit}). Please try another unit.` });
      }

      // We already match the exact unit from the JSON! So multiplier is 1.
      let multiplier = 1;

      const emissions = quantity * multiplier * efData.factor;

      results.push({
        source,
        quantity,
        unit,
        emissionFactor: efData.factor,
        emissionFactorUnit: efData.unit,
        emissions: Number(emissions.toFixed(2)),
        scope: efData.scope
      });

      if (efData.scope === 1) totals.scope1 += emissions;
      if (efData.scope === 2) totals.scope2 += emissions;
      if (efData.scope === 3) totals.scope3 += emissions;
      totals.total += emissions;
    }

    totals.scope1 = Number(totals.scope1.toFixed(2));
    totals.scope2 = Number(totals.scope2.toFixed(2));
    totals.scope3 = Number(totals.scope3.toFixed(2));
    totals.total = Number(totals.total.toFixed(2));

    res.json({ results, totals });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Calculation failed' });
  }
};
