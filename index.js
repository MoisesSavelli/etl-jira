const express = require('express');
const runETL = require('./etl/etlManager');

const app = express();
const port = process.env.PORT || 3000;

app.get('/run-etl/:etlName', async (req, res) => {
  const etlName = req.params.etlName;
  try {
    await runETL(etlName);
    res.send(`ETL process ${etlName} completed successfully`);
  } catch (error) {
    console.error(`Error running ETL process ${etlName}:`, error);
    res.status(500).send(`ETL process ${etlName} failed: ${error.message}`);
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
