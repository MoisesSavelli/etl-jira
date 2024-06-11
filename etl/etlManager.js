const fetchAndSaveIssues = require('./jiraRequest');
const processIssues = require('../data/land/issuesRaw');
//const transformIssues = require('../data/stg/issues');
//const loadIssues = require('../data/dw/issues');

const etlProcesses = {
  'fetchAndSaveIssues': fetchAndSaveIssues,
  'processIssues': processIssues,
//  'transformIssues': transformIssues,
//  'loadIssues': loadIssues
};

const runETL = async (etlName) => {
  if (etlProcesses[etlName]) {
    await etlProcesses[etlName]();
    console.log(`${etlName} executed successfully`);
  } else {
    throw new Error(`ETL process ${etlName} not found`);
  }
};

module.exports = runETL;
