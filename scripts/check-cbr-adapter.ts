import { loadConfig } from '../src/common/config.ts';
import { CbrApiDataSource } from '../src/modules/cbr/cbr.service.ts';

const result = await new CbrApiDataSource(loadConfig()).getMortgageStats();
console.log(
  JSON.stringify(
    {
      ...result,
      observations: result.observations.slice(0, 3),
      totalObservations: result.observations.length,
    },
    null,
    2,
  ),
);
if (!result.observations.length || result.issues.length) process.exitCode = 1;
